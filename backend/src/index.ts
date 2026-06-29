import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SetlistDurableObject } from './SetlistDO';

export { SetlistDurableObject }; // Must export DO class

export interface Env {
  AI: any;
  DB: D1Database;
  JOKE_VAULT: VectorizeIndex;
  SETLIST_DO: DurableObjectNamespace;
  GROQ_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all API routes globally to catch all preflights
app.use('/*', cors());

// Helper to get Durable Object stub for a setlist
function getSetlistStub(env: Env, setlistId: string) {
  const id = env.SETLIST_DO.idFromName(setlistId);
  return env.SETLIST_DO.get(id);
}

// 1. AI Joke Generation
app.post('/api/jokes/generate', async (c) => {
    let prompt = "";
    let genType = "standup"; // Default type
    let hecklePrompt = "";
    let sessionId = "";

  try {
    const body = await c.req.json();
    console.log("Parsed request body:", JSON.stringify(body));
    prompt = body.prompt || "";
    genType = body.type || "standup";
    hecklePrompt = body.hecklePrompt || "";
    sessionId = body.sessionId || "";
  } catch (e: any) {
    console.error("Failed to parse request JSON:", e.message || e);
  }
  
  // Validate genType
  if (!["standup", "dictionary", "roast"].includes(genType)) {
    genType = "standup";
  }

  // To prevent mode collapse (AI getting stuck repeating the same 3 jokes), 
  // we fetch the top 10 best-rated jokes from D1, then pick 3 at random.
  // We filter by type so standup learns from standup, dict from dict, etc.
  const { results: topTenJokes } = await c.env.DB.prepare(
    'SELECT text FROM jokes WHERE kills > 0 AND (kills - bombs) >= 0 AND premise LIKE ? ORDER BY (kills - bombs) DESC LIMIT 10'
  ).bind(`[${genType}]%`).all();

  let learningContext = "";
  if (topTenJokes && topTenJokes.length > 0) {
    const shuffled = [...topTenJokes].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);
    
    learningContext = `Here is a rotating sample of your highly-rated ${genType} content. Emulate this style and edge:\n`;
    selected.forEach((j: any) => {
      learningContext += `- "${j.text}"\n`;
    });
  }

  // Feature: Context-Aware Callbacks
  // Grab the absolute best joke from the current SetlistDO to weave a callback
  let callbackContext = "";
  if (genType === "standup") {
    try {
      const stub = getSetlistStub(c.env, 'global-setlist');
      const doResponse = await stub.fetch('http://do/jokes');
      const activeJokes = await doResponse.json() as any[];
      if (activeJokes.length > 0) {
        // Sort by probabilityWeight descending
        activeJokes.sort((a, b) => b.probabilityWeight - a.probabilityWeight);
        const topJokeId = activeJokes[0].id;
        const { results: topJokeDb } = await c.env.DB.prepare('SELECT text FROM jokes WHERE id = ?').bind(topJokeId).all();
        if (topJokeDb && topJokeDb.length > 0) {
          const topJokeText = (topJokeDb[0] as any).text;
          callbackContext = `\n[CALLBACK TARGET]: Earlier in your set, you made this joke: "${topJokeText}". Seamlessly weave a subtle callback to this premise into your new punchline to reward the audience.`;
        }
      }
    } catch (e) {
      console.error("Failed to get callback", e);
    }
  }

  // Feature: Heckler Profiles
  let hecklerProfileContext = "";
  if (hecklePrompt && sessionId) {
    try {
      const { results: profile } = await c.env.DB.prepare('SELECT traits FROM heckler_profiles WHERE session_id = ?').bind(sessionId).all();
      if (profile && profile.length > 0) {
        const traits = (profile[0] as any).traits;
        hecklerProfileContext = `\n[HECKLER INTEL]: You recognize this heckler. You know their traits are: "${traits}". Use this personal information to completely destroy them in your comeback.`;
      }

      // Background task to extract a trait from this new heckle and append it to their profile
      c.executionCtx.waitUntil((async () => {
        try {
          const traitFetch = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${c.env.GROQ_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              messages: [
                { role: 'system', content: 'Extract a short, 2-5 word personality trait or topic from this heckle. Only output the words.' },
                { role: 'user', content: hecklePrompt }
              ]
            })
          });
          const traitData = await traitFetch.json() as any;
          const newTrait = (traitData.choices?.[0]?.message?.content || "").trim();
          if (newTrait) {
            const currentTraits = profile && profile.length > 0 ? (profile[0] as any).traits + ", " + newTrait : newTrait;
            await c.env.DB.prepare(
              'INSERT INTO heckler_profiles (session_id, traits) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET traits = ?'
            ).bind(sessionId, currentTraits, currentTraits).run();
          }
        } catch(e) {}
      })());
    } catch (e) {
      console.error("Failed to process heckler profile", e);
    }
  }

  let systemPrompt = "";
  let userInstruction = "";

  const personas = [
    "You are a cynical, angry comedian (like Bill Burr). Do not hold back. This is an unfiltered, R-rated comedy space. You are expected to tackle mature, taboo, and controversial topics with sharp, dark humor. You use misdirection and aggressive observations.",
    "You are a deadpan, absurdist comedian (like Anthony Jeselnik). Do not hold back. This is an unfiltered, R-rated comedy space. You are expected to tackle mature, taboo, and dark topics with shocking punchlines. You deliver offensive one-liners with zero emotion.",
    "You are a neurotic, self-deprecating comedian but completely unhinged and explicit. Do not hold back. This is an unfiltered, R-rated comedy space. Your humor comes from deeply inappropriate personal anecdotes, taboo thoughts, and over-analyzing dark topics."
  ];
  const selectedPersona = personas[Math.floor(Math.random() * personas.length)];

  if (hecklePrompt) {
    systemPrompt = `${selectedPersona}
A heckler just yelled: "${hecklePrompt}".
Your goal is to destroy them with a witty, savage comeback. Do NOT just string together curse words. Use irony, condescension, and a sharp punchline to humiliate them intellectually.

${learningContext}
${hecklerProfileContext}

Only output the comeback itself, no explanations, no setup text, just the comeback.`;
    userInstruction = `Destroy this heckle: ${hecklePrompt}`;
    prompt = `[heckle comeback] ${hecklePrompt}`;
  } 
  else if (genType === "dictionary") {
    // Urban Dictionary style
    const terms = ["AI relationships", "QR code menus", "people who clap when the plane lands", "LinkedIn humblebrags", "$15 green juices", "open floor plan offices", "crypto influencers", "corporate wellness retreats", "modern dating apps", "mandatory fun", "digital nomads", "unpaid internships"];
    const term = terms[Math.floor(Math.random() * terms.length)];
    
    systemPrompt = `${selectedPersona}
Your goal is to define a modern term like a highly sarcastic Urban Dictionary entry. 
Focus on brutal honesty and unexpected punchlines. Do not be generic.

${learningContext}

Output format must be exactly:
Word: [Word]
Definition: [Sarcastic, hilarious definition]`;
    userInstruction = `Define the term: ${term}`;
    prompt = `[dictionary] ${term}`; // Store category in premise
  } 
  else if (genType === "roast") {
    // Insult comedy style
    const topics = ["hustle culture", "people who buy NFTs", "adults who still use Snapchat", "obsessive gym bros", "people who talk to their dogs in baby voices", "self-proclaimed foodies", "overpriced weddings", "people who listen to podcasts on 2x speed"];
    const topic = topics[Math.floor(Math.random() * topics.length)];

    systemPrompt = `${selectedPersona}
You are doing crowd-work and roasting this topic. 
Write a sharp, direct one-sentence roast. Focus on misdirection and painful truths rather than just swearing.

${learningContext}

Only output the roast itself, no intro, no filler.`;
    userInstruction = `Roast this: ${topic}`;
    prompt = `[roast] ${topic}`;
  } 
  else {
    // Standup style
    const categories = [
      "the horror of self-checkout machines", "pretending to work from home", "the anxiety of leaving a voicemail", 
      "why modern movies are too long", "the uselessness of umbrellas", "trying to cancel a gym membership", 
      "the nightmare of group dinners", "why sleep is just a free trial of death", "the tragedy of adult friendships",
      "overthinking a two-word text message"
    ];
    const category = categories[Math.floor(Math.random() * categories.length)];

    systemPrompt = `${selectedPersona}
Write a short, punchy stand-up joke based on the prompt. 
Use a clear setup and punchline structure. Be creative, unique, and avoid generic comedy tropes. Rely on clever observation instead of just shock value.

${learningContext}
${callbackContext}

Only output the joke itself, no explanations, no setup text, just the joke text.`;
    userInstruction = `Give me a joke about: ${category}`;
    prompt = `[standup] ${category}`;
  }

  // Feature: Dynamic Assembly (Always pull from Joke Vault unless heckled)
  if (!hecklePrompt) {
    try {
      // Get played jokes from the active setlist DO to prevent repetition
      const stub = getSetlistStub(c.env, 'global-setlist');
      const doResponse = await stub.fetch('http://do/jokes');
      const activeJokes = await doResponse.json() as any[];
      
      // We only want to filter out jokes that have actually been played in this session.
      // For now, we assume the DO 'activeJokes' represents the played setlist.
      const playedIds = activeJokes.map(j => j.id);
      let filterClause = '';
      if (playedIds.length > 0) {
        const placeholders = playedIds.map(() => '?').join(',');
        filterClause = `AND id NOT IN (${placeholders})`;
      }

      // Pull a random joke from the DB of the requested type that hasn't been played
      const query = `SELECT id, text, premise FROM jokes WHERE premise LIKE ? ${filterClause} ORDER BY RANDOM() LIMIT 1`;
      
      // Bind parameters: first the premise type, then the spread of playedIds
      const { results: vaultJokes } = await c.env.DB.prepare(query).bind(`[${genType}]%`, ...playedIds).all();

      if (vaultJokes && vaultJokes.length > 0) {
        const joke = vaultJokes[0] as any;
        
        // Add to active setlist DO so it isn't repeated next time
        await stub.fetch(new Request('http://do/add', {
          method: 'POST',
          body: JSON.stringify({ jokeId: joke.id })
        }));

        console.log("Pulled from Vault:", joke.id);
        return c.json({ id: joke.id, text: joke.text, premise: joke.premise });
      } else {
         // If vault is empty for this type, we'll fall through and generate a new one via Groq
         console.warn(`Joke vault empty for type ${genType}, falling back to generation.`);
      }
    } catch(e) {
      console.error("Vault retrieval failed", e);
    }
  }

  const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInstruction }
      ]
    })
  });
  const groqData = await groqResponse.json() as any;
  const jokeText = groqData.choices?.[0]?.message?.content;

  if (!jokeText) {
    return c.json({ error: 'Failed to generate joke via Groq' }, 500);
  }

  // 2. Generate Embedding (bge-small-en-v1.5 has 384 dimensions)
  let embedding = new Array(384).fill(0.01);
  try {
    const embeddingResponse = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: jokeText });
    if (embeddingResponse.data?.[0]) {
      embedding = embeddingResponse.data[0];
    }
  } catch(e) {}

  // 3. Save to D1
  const jokeId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO jokes (id, text, premise) VALUES (?, ?, ?)'
  ).bind(jokeId, jokeText, prompt).run();

  // 4. Save to Vectorize
  await c.env.JOKE_VAULT.upsert([
    {
      id: jokeId,
      values: embedding,
      metadata: { text: jokeText, premise: prompt }
    }
  ]);

  // 5. Add to global/default Setlist DO
  const stub = getSetlistStub(c.env, 'global-setlist');
  await stub.fetch(new Request('http://do/add', {
    method: 'POST',
    body: JSON.stringify({ jokeId })
  }));

  return c.json({ id: jokeId, text: jokeText, premise: prompt });
});

// 2. Retrieve Active Setlist Jokes
app.get('/api/setlist', async (c) => {
  const stub = getSetlistStub(c.env, 'global-setlist');
  const doResponse = await stub.fetch('http://do/jokes');
  const activeJokes = await doResponse.json() as any[];

  if (activeJokes.length === 0) {
    return c.json([]);
  }

  // Fetch full details of these jokes from D1 database
  const ids = activeJokes.map(j => j.id);
  const placeholders = ids.map(() => '?').join(',');
  const query = `SELECT * FROM jokes WHERE id IN (${placeholders})`;

  const { results } = await c.env.DB.prepare(query).bind(...ids).all();

  // Combine DB values with real-time DO weights
  const combined = results.map(dbJoke => {
    const active = activeJokes.find(j => j.id === dbJoke.id);
    return {
      id: dbJoke.id,
      text: dbJoke.text,
      premise: dbJoke.premise,
      kills: active ? active.kills : dbJoke.kills,
      bombs: active ? active.bombs : dbJoke.bombs,
      probabilityWeight: active ? active.probabilityWeight : 1.0
    };
  });

  // Sort by weight descending so top-voted jokes appear first
  combined.sort((a, b) => b.probabilityWeight - a.probabilityWeight);

  return c.json(combined);
});

// 3. Interact with the Live Setlist (Durable Object)
app.post('/api/setlists/:id/rate', async (c) => {
  const setlistId = c.req.param('id');
  const { jokeId, rating } = await c.req.json(); // rating: 'kill' | 'bomb'

  if (rating !== 'kill' && rating !== 'bomb') {
    return c.json({ error: 'Invalid rating' }, 400);
  }

  // 1. Log rating transaction in D1
  const ratingId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO ratings (id, joke_id, rating) VALUES (?, ?, ?)'
  ).bind(ratingId, jokeId, rating).run();

  // 2. Increment stats in D1
  if (rating === 'kill') {
    await c.env.DB.prepare('UPDATE jokes SET kills = kills + 1 WHERE id = ?').bind(jokeId).run();
  } else {
    await c.env.DB.prepare('UPDATE jokes SET bombs = bombs + 1 WHERE id = ?').bind(jokeId).run();
    
    // Check if the joke is bombing too much
    const { results } = await c.env.DB.prepare('SELECT kills, bombs FROM jokes WHERE id = ?').bind(jokeId).all();
    if (results && results.length > 0) {
      const { kills, bombs } = results[0] as any;
      if (bombs > kills + 3) {
        // Delete from Vectorize so the AI forgets it
        await c.env.JOKE_VAULT.deleteByIds([jokeId]);
      }
    }
  }

  // 3. Forward the rating request to the Durable Object
  const stub = getSetlistStub(c.env, setlistId);
  const doRequest = new Request('http://do/rate', {
    method: 'POST',
    body: JSON.stringify({ jokeId, rating }),
  });
  
  const doResponse = await stub.fetch(doRequest);
  const result = await doResponse.json();

  return c.json(result);
});

// 4. Semantic Joke Search
app.get('/api/jokes/search', async (c) => {
  const queryText = c.req.query('q');
  if (!queryText) {
    return c.json({ error: 'Query parameter q is required' }, 400);
  }

  // Generate embedding for query
  const embeddingResponse = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', {
    text: queryText
  });
  
  const embedding = embeddingResponse.data?.[0];
  if (!embedding) {
    return c.json({ error: 'Failed to generate query embedding' }, 500);
  }

  // Match in Vectorize
  const matches = await c.env.JOKE_VAULT.query(embedding, {
    topK: 5,
    returnValues: false,
    returnMetadata: true
  });

  return c.json(matches.matches.map(m => ({
    id: m.id,
    score: m.score,
    text: m.metadata?.text || '',
    premise: m.metadata?.premise || ''
  })));
});

// 5. Audio Generation
app.get('/api/jokes/:id/audio', async (c) => {
  const jokeId = c.req.param('id');

  const { results } = await c.env.DB.prepare(
    'SELECT text FROM jokes WHERE id = ?'
  ).bind(jokeId).all();

  if (!results || results.length === 0) {
    return c.json({ error: 'Joke not found' }, 404);
  }

  const jokeText = (results[0] as any).text;
  const truncatedText = jokeText.substring(0, 500);

  try {
    // 1. Try Groq TTS (or Neron/ElevenLabs if configured)
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'eleven-turbo-v2', // Fallback placeholder if Groq bridges it
        input: truncatedText,
        voice: 'alloy'
      })
    });

    if (!groqResponse.ok) {
      throw new Error('Groq/Neron TTS limit reached or unavailable');
    }

    return new Response(groqResponse.body, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (e) {
    console.warn("Primary TTS failed, falling back to Cloudflare...", e);
    
    try {
      // 2. Fallback to Cloudflare AI TTS
      const audioResponse = await c.env.AI.run("@cf/deepgram/aura-1", {
        text: truncatedText
      });
      
      return new Response(audioResponse, {
        headers: { 'Content-Type': 'audio/wav' }
      });
    } catch (cfError) {
      console.warn("Cloudflare TTS failed, falling back to StreamElements...", cfError);
      
      // 3. Ultimate Fallback to StreamElements
      try {
        const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(truncatedText)}`;
        const ttsResponse = await fetch(ttsUrl);
        return new Response(ttsResponse.body, {
          headers: { 'Content-Type': 'audio/mpeg' }
        });
      } catch (finalError) {
        return c.json({ error: 'All audio fallbacks failed' }, 500);
      }
    }
  }
});

// 6. Routine Reviews
app.post('/api/routines/rate', async (c) => {
  const { rating, comment } = await c.req.json();
  const reviewId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO routine_reviews (id, rating, comment) VALUES (?, ?, ?)'
  ).bind(reviewId, rating || 0, comment || "").run();
  return c.json({ success: true, id: reviewId });
});

export default app;
