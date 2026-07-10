import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isGhosted } from './moderation';

export interface Env {
  DB: D1Database;
  ASSETS: any;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

// Helper: generate voter fingerprint from request headers
async function getFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const data = new TextEncoder().encode(ip + '|' + ua);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.substring(0, 16);
}

// 1. GET /api/jokes — Feed with sort modes and pagination
app.get('/api/jokes', async (c) => {
  const sort = c.req.query('sort') || 'hot';
  const page = parseInt(c.req.query('page') || '0');
  const limit = 20;
  const offset = page * limit;

  let query = '';
  switch (sort) {
    case 'new':
      query = `SELECT * FROM jokes WHERE is_ghosted = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      break;
    case 'controversial':
      query = `SELECT * FROM jokes WHERE is_ghosted = 0 AND (kills + bombs) > 3 ORDER BY (kills + bombs) DESC, ABS(kills - bombs) ASC LIMIT ? OFFSET ?`;
      break;
    case 'bombing':
      query = `SELECT * FROM jokes WHERE is_ghosted = 0 AND bombs > 2 ORDER BY (bombs - kills) DESC LIMIT ? OFFSET ?`;
      break;
    case 'hot':
    default:
      query = `SELECT * FROM jokes WHERE is_ghosted = 0 ORDER BY (kills - bombs) DESC, created_at DESC LIMIT ? OFFSET ?`;
      break;
  }

  const { results: jokes } = await c.env.DB.prepare(query).bind(limit, offset).all();

  // Fetch top heckle for each joke
  const jokesWithHeckles = await Promise.all(
    (jokes || []).map(async (joke: any) => {
      const { results: heckles } = await c.env.DB.prepare(
        `SELECT * FROM heckles WHERE joke_id = ? AND is_ghosted = 0 ORDER BY (kills - bombs) DESC LIMIT 1`
      ).bind(joke.id).all();
      return { ...joke, topHeckle: heckles?.[0] || null };
    })
  );

  return c.json(jokesWithHeckles);
});

// 2. POST /api/jokes — Submit a joke
app.post('/api/jokes', async (c) => {
  const { text, authorName, category } = await c.req.json();

  if (!text || !authorName) {
    return c.json({ error: 'text and authorName are required' }, 400);
  }

  if (text.length > 500) {
    return c.json({ error: 'Joke too long (500 char max)' }, 400);
  }

  const validCategories = ['observational', 'roast', 'one-liner', 'dark', 'cringe', 'dictionary'];
  const safeCategory = validCategories.includes(category) ? category : 'observational';

  const id = crypto.randomUUID();
  const ghosted = isGhosted(text) ? 1 : 0;

  await c.env.DB.prepare(
    'INSERT INTO jokes (id, text, category, author_name, is_ghosted) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, text, safeCategory, authorName, ghosted).run();

  return c.json({ id, text, category: safeCategory, authorName, kills: 0, bombs: 0 });
});

// 3. POST /api/jokes/:id/rate — Rate a joke (kill or bomb)
app.post('/api/jokes/:id/rate', async (c) => {
  const jokeId = c.req.param('id');
  const { rating } = await c.req.json();

  if (rating !== 'kill' && rating !== 'bomb') {
    return c.json({ error: 'rating must be kill or bomb' }, 400);
  }

  const fingerprint = await getFingerprint(c.req.raw);
  const ratingId = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      'INSERT INTO ratings (id, target_id, target_type, rating, voter_fingerprint) VALUES (?, ?, ?, ?, ?)'
    ).bind(ratingId, jokeId, 'joke', rating, fingerprint).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Already voted' }, 409);
    }
    throw e;
  }

  const column = rating === 'kill' ? 'kills' : 'bombs';
  await c.env.DB.prepare(
    `UPDATE jokes SET ${column} = ${column} + 1 WHERE id = ?`
  ).bind(jokeId).run();

  return c.json({ success: true });
});

// 4. POST /api/jokes/:id/heckle — Heckle a joke
app.post('/api/jokes/:id/heckle', async (c) => {
  const jokeId = c.req.param('id');
  const { text, authorName } = await c.req.json();

  if (!text || !authorName) {
    return c.json({ error: 'text and authorName are required' }, 400);
  }

  if (text.length > 300) {
    return c.json({ error: 'Heckle too long (300 char max)' }, 400);
  }

  const id = crypto.randomUUID();
  const ghosted = isGhosted(text) ? 1 : 0;

  await c.env.DB.prepare(
    'INSERT INTO heckles (id, joke_id, text, author_name, is_ghosted) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, jokeId, text, authorName, ghosted).run();

  return c.json({ id, jokeId, text, authorName, kills: 0, bombs: 0 });
});

// 5. POST /api/heckles/:id/rate — Rate a heckle
app.post('/api/heckles/:id/rate', async (c) => {
  const heckleId = c.req.param('id');
  const { rating } = await c.req.json();

  if (rating !== 'kill' && rating !== 'bomb') {
    return c.json({ error: 'rating must be kill or bomb' }, 400);
  }

  const fingerprint = await getFingerprint(c.req.raw);
  const ratingId = crypto.randomUUID();

  try {
    await c.env.DB.prepare(
      'INSERT INTO ratings (id, target_id, target_type, rating, voter_fingerprint) VALUES (?, ?, ?, ?, ?)'
    ).bind(ratingId, heckleId, 'heckle', rating, fingerprint).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return c.json({ error: 'Already voted' }, 409);
    }
    throw e;
  }

  const column = rating === 'kill' ? 'kills' : 'bombs';
  await c.env.DB.prepare(
    `UPDATE heckles SET ${column} = ${column} + 1 WHERE id = ?`
  ).bind(heckleId).run();

  return c.json({ success: true });
});

// Bonus: GET /api/jokes/shame — Wall of Shame
app.get('/api/jokes/shame', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT j.*, 
      (SELECT h.text FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_text,
      (SELECT h.author_name FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_author
    FROM jokes j
    WHERE j.is_ghosted = 0 AND j.bombs > 10 AND j.kills < j.bombs / 4
    ORDER BY j.bombs DESC LIMIT 50`
  ).all();
  return c.json(results || []);
});

// Bonus: GET /api/jokes/fame — Hall of Fame
app.get('/api/jokes/fame', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT j.*,
      (SELECT h.text FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_text,
      (SELECT h.author_name FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_author
    FROM jokes j
    WHERE j.is_ghosted = 0 AND j.kills > 10 AND j.kills > j.bombs * 4
    ORDER BY j.kills DESC LIMIT 50`
  ).all();
  return c.json(results || []);
});

// GET /api/jokes/:id/heckles — Get all heckles for a joke
app.get('/api/jokes/:id/heckles', async (c) => {
  const jokeId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM heckles WHERE joke_id = ? AND is_ghosted = 0 ORDER BY (kills - bombs) DESC'
  ).bind(jokeId).all();
  return c.json(results || []);
});

app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
