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
  try {
    const body = await c.req.json();
    prompt = body.prompt || "";
  } catch (e) {
    // Ignore JSON errors if body is empty
  }
  
  // If no prompt, let's select a highly diverse random topic from a massive pool
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    const categories = [
      "existential dread", "weird historical facts", "mundane daily struggles", 
      "relationships & dating", "conspiracy theories", "bizarre animals", 
      "time travel struggles", "customer service nightmares", "childhood memories",
      "superpowers but useless ones", "the absurdity of money", "social awkwardness", 
      "aging and getting older", "modern hygiene habits", "bizarre food combinations",
      "aliens visiting Earth", "life in the 1700s", "bad advice from parents",
      "pet behaviors", "public transport encounters"
    ];
    prompt = categories[Math.floor(Math.random() * categories.length)];
  }

  // To prevent mode collapse (AI getting stuck repeating the same 3 jokes), 
  // we fetch the top 10 best-rated jokes from D1, then pick 3 at random.
  // This keeps the training context dynamic and diverse.
  const { results: topTenJokes } = await c.env.DB.prepare(
    'SELECT text FROM jokes WHERE kills > 0 AND (kills - bombs) >= 0 ORDER BY (kills - bombs) DESC LIMIT 10'
  ).all();

  let learningContext = "";
  if (topTenJokes && topTenJokes.length > 0) {
    // Pick up to 3 random jokes from the top 10
    const shuffled = [...topTenJokes].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);
    
    learningContext = "Here is a rotating sample of jokes the audience rated as 'Kill'. Use them to understand the pacing, style, and punchiness they like:\n";
    selected.forEach((j: any) => {
      learningContext += `- "${j.text}"\n`;
    });
  }

  // 1. Generate Joke
  const systemPrompt = `You are a legendary, incredibly diverse stand-up comedian. You do not hold back—this is an 18+ explicit comedy club. 
Write a short, punchy joke based on the prompt. 
Be creative, unique, and avoid repeating generic setups. Experiment with different comedy styles (e.g., self-deprecating, observational, absurd, dry wit, storytelling).

${learningContext}

Only output the joke itself, no explanations, no setup text, just the joke text.`;

  const response = await c.env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Give me a joke about: ${prompt}` }
    ]
  });

  const jokeText = response.response || response.text;
  if (!jokeText) {
    return c.json({ error: 'Failed to generate joke' }, 500);
  }

  // 2. Generate Embedding (bge-small-en-v1.5 has 384 dimensions)
  const embeddingResponse = await c.env.AI.run('@cf/baai/bge-small-en-v1.5', {
    text: jokeText
  });
  
  const embedding = embeddingResponse.data?.[0];
  if (!embedding) {
    return c.json({ error: 'Failed to generate embedding' }, 500);
  }

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

export default app;

