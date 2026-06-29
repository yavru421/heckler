import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SetlistDurableObject } from './SetlistDO';

export { SetlistDurableObject }; // Must export DO class

export interface Env {
  AI: any;
  DB: D1Database;
  JOKE_VAULT: VectorizeIndex;
  SETLIST_DO: DurableObjectNamespace;
}

// Helper functions for Beta-distribution Thompson Sampling
function sampleGamma(k: number): number {
  let sum = 0;
  for (let i = 0; i < k; i++) {
    sum += -Math.log(Math.random() || 0.0001);
  }
  return sum;
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  const total = x + y;
  return total === 0 ? 0.5 : x / total;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all API routes globally to catch all preflights
app.use('/*', cors());

// Helper to get Durable Object stub for a setlist
function getSetlistStub(env: Env, setlistId: string) {
  const id = env.SETLIST_DO.idFromName(setlistId);
  return env.SETLIST_DO.get(id);
}

// 1. AI Joke Generation / Selection (Thompson Sampling D1 Vault)
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

  // If a heckle prompt is provided, invoke Workers AI to generate a comeback roast
  if (hecklePrompt) {
    let hecklerProfileContext = "";
    if (sessionId) {
      try {
        const { results: profile } = await c.env.DB.prepare('SELECT traits FROM heckler_profiles WHERE session_id = ?').bind(sessionId).all();
        if (profile && profile.length > 0) {
          const traits = (profile[0] as any).traits;
          hecklerProfileContext = `\n[HECKLER INTEL]: You recognize this heckler. You know their traits are: "${traits}". Use this personal information to completely destroy them in your comeback.`;
        }
      } catch (e) {}
    }

    const systemPrompt = `You are a cynical, angry, and sharp comedian (like Bill Burr). 
A heckler just yelled: "${hecklePrompt}".
Your goal is to destroy them with a witty, savage, 1-sentence comeback roast. Use irony, condescension, and observation to humiliate them. 
Do not include any intro, markdown, or commentary. Only output the roast itself.
${hecklerProfileContext}`;

    const userInstruction = `Destroy this heckler: "${hecklePrompt}"`;

    let comebackText = "";
    try {
      const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userInstruction }
        ]
      });
      comebackText = aiResponse.response || aiResponse.text || "";
    } catch (err) {
      console.error("Workers AI heckle failed, using database seed fallback", err);
      // Fallback to random roast in database
      const { results } = await c.env.DB.prepare(
        "SELECT text FROM jokes WHERE premise LIKE '[roast]%' ORDER BY RANDOM() LIMIT 1"
      ).all();
      comebackText = results && results.length > 0 ? (results[0] as any).text : "I'd ask you to shut the fuck up, but looking at you, nature has clearly already silenced your genetic line.";
    }

    const jokeId = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO jokes (id, text, premise) VALUES (?, ?, ?)'
    ).bind(jokeId, comebackText, `[heckle comeback] ${hecklePrompt}`).run();

    // Add trait extraction background task using Workers AI
    if (sessionId) {
      c.executionCtx.waitUntil((async () => {
        try {
          const traitResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
            messages: [
              { role: 'system', content: 'Extract a short, 2-5 word personality trait or topic from this heckle. Only output the words. Do not explain.' },
              { role: 'user', content: hecklePrompt }
            ]
          });
          const newTrait = (traitResponse.response || traitResponse.text || "").trim();
          if (newTrait) {
            const { results: profile } = await c.env.DB.prepare('SELECT traits FROM heckler_profiles WHERE session_id = ?').bind(sessionId).all();
            const currentTraits = profile && profile.length > 0 ? (profile[0] as any).traits + ", " + newTrait : newTrait;
            await c.env.DB.prepare(
              'INSERT INTO heckler_profiles (session_id, traits) VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET traits = ?'
            ).bind(sessionId, currentTraits, currentTraits).run();
          }
        } catch (e) {}
      })());
    }

    return c.json({ id: jokeId, text: comebackText, premise: `[heckle comeback] ${hecklePrompt}` });
  }

  // Standard Playback: Thompson Sampling over D1 pre-generated jokes (Vault-Only, No LLM!)
  try {
    const stub = getSetlistStub(c.env, 'global-setlist');
    const doResponse = await stub.fetch('http://do/jokes');
    const activeJokes = await doResponse.json() as any[];
    const playedIds = activeJokes.map(j => j.id);

    let filterClause = '';
    const queryParams: any[] = [`[${genType}]%`];
    if (playedIds.length > 0) {
      const placeholders = playedIds.map(() => '?').join(',');
      filterClause = `AND id NOT IN (${placeholders})`;
      queryParams.push(...playedIds);
    }

    // Query D1 for candidate jokes that are NOT banned (bombs >= kills + 2)
    const query = `
      SELECT id, text, premise, kills, bombs 
      FROM jokes 
      WHERE (premise LIKE ? OR premise NOT LIKE '[%') 
        ${filterClause}
        AND (bombs < kills + 2)
    `;
    const { results: candidates } = await c.env.DB.prepare(query).bind(...queryParams).all();

    let selectedJoke: any = null;

    if (candidates && candidates.length > 0) {
      let highestScore = -1;
      for (const joke of candidates) {
        const k = (joke.kills as number) || 0;
        const b = (joke.bombs as number) || 0;
        const score = sampleBeta(k + 1, b + 1);
        if (score > highestScore) {
          highestScore = score;
          selectedJoke = joke;
        }
      }
    }

    // Fallback: if all jokes played, relax played constraint to keep show running
    if (!selectedJoke) {
      const fallbackQuery = `
        SELECT id, text, premise 
        FROM jokes 
        WHERE (premise LIKE ? OR premise NOT LIKE '[%')
          AND (bombs < kills + 2)
        ORDER BY RANDOM() LIMIT 1
      `;
      const { results: fallbackJokes } = await c.env.DB.prepare(fallbackQuery).bind(`[${genType}]%`).all();
      if (fallbackJokes && fallbackJokes.length > 0) {
        selectedJoke = fallbackJokes[0];
      }
    }

    if (selectedJoke) {
      await stub.fetch(new Request('http://do/add', {
        method: 'POST',
        body: JSON.stringify({ jokeId: selectedJoke.id })
      }));

      console.log("Selected via Thompson Sampling:", selectedJoke.id);
      return c.json({ id: selectedJoke.id, text: selectedJoke.text, premise: selectedJoke.premise });
    }
  } catch (e) {
    console.error("Vault selection failed:", e);
  }

  return c.json({ error: 'Failed to retrieve joke from database' }, 500);
});

// 1.5 Comedian Reaction Endpoint
app.post('/api/comedian/react', async (c) => {
  const { jokeId, rating } = await c.req.json();

  let jokeText = "";
  try {
    const { results } = await c.env.DB.prepare('SELECT text FROM jokes WHERE id = ?').bind(jokeId).all();
    if (results && results.length > 0) {
      jokeText = (results[0] as any).text;
    }
  } catch (e) {}

  const systemPrompt = `You are a cynical, deadpan, and sharp stand-up comedian (like Anthony Jeselnik). 
An audience member just rated your joke as a "${rating}" (meaning they thought it ${rating === 'bomb' ? 'sucked/failed' : 'was hilarious/killed'}).
Provide a very short, sharp, 1-sentence deadpan response or roast. If they rated it a bomb, roast them or use self-deprecating humor. If they rated it a kill, give a brief, arrogant, or dry acknowledgment. 
Do not include any intro, markdown, or commentary. Only output the spoken response itself.`;
  
  const userInstruction = `React to them rating this joke as a "${rating}": "${jokeText}"`;

  let reactionText = "";
  try {
    const aiResponse = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInstruction }
      ]
    });
    reactionText = aiResponse.response || aiResponse.text || "";
  } catch (err) {
    console.error("Workers AI reaction failed, using fallback", err);
    if (rating === 'bomb') {
      const roasts = [
        "Yeah, well, let's see you write a better one.",
        "Oh, tough crowd. Did I hit too close to home?",
        "Don't worry, comedy is subjective. For example, you think you have good taste.",
        "I'd roast you, but nature clearly already did a number on you."
      ];
      reactionText = roasts[Math.floor(Math.random() * roasts.length)];
    } else {
      reactionText = "Yeah, I know, I'm a genius. Hold your applause.";
    }
  }

  const reactionId = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO jokes (id, text, premise) VALUES (?, ?, ?)'
  ).bind(reactionId, reactionText, `[comeback] ${rating}`).run();

  return c.json({ id: reactionId, text: reactionText });
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
    // StreamElements is a highly reliable, low-latency, free TTS service (Brian voice)
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(truncatedText)}`;
    const ttsResponse = await fetch(ttsUrl);
    
    if (!ttsResponse.ok) {
      throw new Error(`StreamElements returned status ${ttsResponse.status}`);
    }

    return new Response(ttsResponse.body, {
      headers: { 'Content-Type': 'audio/mpeg' }
    });
  } catch (err) {
    console.error("StreamElements TTS failed, attempting Cloudflare AI fallback...", err);
    
    try {
      const audioResponse = await c.env.AI.run("@cf/deepgram/aura-1", {
        text: truncatedText
      });
      return new Response(audioResponse, {
        headers: { 'Content-Type': 'audio/wav' }
      });
    } catch (cfError) {
      console.error("All audio generation paths failed:", cfError);
      return c.json({ error: 'Audio generation failed' }, 500);
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
