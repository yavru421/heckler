import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  ASSETS: any;
  AI: any;
  AUDIO_BUCKET: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors({ origin: '*' }));
app.use('/*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', "default-src 'self' blob: data:; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://static.cloudflareinsights.com; connect-src 'self' wss: https: blob: data: https://cloudflareinsights.com; media-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; frame-ancestors 'none'; object-src 'none';");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

// 1. GET /api/jokes — List comedy sets stored in D1
app.get('/api/jokes', async (c) => {
  const { results: jokes } = await c.env.DB.prepare(
    'SELECT id, text, category, author_name, kills, bombs, created_at, (audio_data IS NOT NULL AND length(audio_data) > 0) as has_audio FROM jokes WHERE is_ghosted = 0 ORDER BY created_at DESC LIMIT 50'
  ).all();

  const mappedJokes = (jokes || []).map((j: any) => ({
    id: j.id,
    text: j.text,
    category: j.category || 'Stand-up',
    author_name: j.author_name || 'AI Comedian',
    kills: j.kills || 0,
    bombs: j.bombs || 0,
    created_at: j.created_at,
    has_audio: Boolean(j.has_audio)
  }));

  return c.json(mappedJokes);
});

// 2. GET /api/jokes/:id/audio — Stream stored MP3 audio cleanly from R2 Object Storage with byte-range support
app.get('/api/jokes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const r2Key = `audio/${id}.mp3`;
  const rangeHeader = c.req.header('range');

  if (c.env.AUDIO_BUCKET) {
    try {
      const getOptions: R2GetOptions = rangeHeader ? { range: c.req.raw.headers } : {};
      const object = await c.env.AUDIO_BUCKET.get(r2Key, getOptions);

      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Content-Type', 'audio/mpeg');
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('etag', object.httpEtag);
        headers.set('Content-Length', object.size.toString());

        const status = object.range ? 206 : 200;

        return new Response(object.body, {
          status,
          headers
        });
      }
    } catch (r2Err) {
      console.warn('R2 bucket fetch error:', r2Err);
    }
  }

  // Attempt 2: D1 DB fallback for legacy entries
  try {
    const result: any = await c.env.DB.prepare('SELECT audio_data FROM jokes WHERE id = ?').bind(id).first();
    if (!result || !result.audio_data) {
      return c.text('Audio not found', 404);
    }
    const buffer = result.audio_data as ArrayBuffer;
    if (!buffer || buffer.byteLength === 0) {
      return c.text('Audio empty', 404);
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (dbErr) {
    return c.text('Audio retrieval error', 500);
  }
});

// 3. GET /api/stage/live — 100% Stateless Deterministic Global Synchronized Broadcast
app.get('/api/stage/live', async (c) => {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const now = Date.now();
  const SLOT_DURATION_MS = 45000; // 45s per comedy set slot
  const currentSlot = Math.floor(now / SLOT_DURATION_MS);
  const startedAt = currentSlot * SLOT_DURATION_MS;

  try {
    // Count available jokes in D1
    const countRes: any = await c.env.DB.prepare('SELECT COUNT(*) as total FROM jokes WHERE is_ghosted = 0').first();
    const totalJokes = (countRes && countRes.total) ? countRes.total : 1;
    const offset = currentSlot % totalJokes;

    // Pull deterministic joke for this slot
    const joke: any = await c.env.DB.prepare(
      'SELECT id, text, category, author_name, kills, bombs FROM jokes WHERE is_ghosted = 0 ORDER BY id LIMIT 1 OFFSET ?'
    ).bind(offset).first();

    if (joke) {
      const stageState = {
        jokeId: joke.id,
        performer: joke.author_name || 'AI Comedian',
        text: joke.text,
        category: joke.category || 'Stand-up',
        hasAudio: true,
        audioUrl: `/api/jokes/${joke.id}/audio?_t=${startedAt}`,
        startedAt,
        durationMs: SLOT_DURATION_MS,
        listenersCount: 1,
        reactions: { laugh: joke.kills || 0, clap: 0, boo: joke.bombs || 0 },
        chatMessages: []
      };
      return c.json(stageState);
    }
  } catch (e: any) {
    console.error('Stateless stage live error:', e);
  }

  // Hard fallback if D1 query fails
  return c.json({
    jokeId: 'fallback-1',
    performer: 'NeonMike',
    text: 'My smart fridge sent me a weekly screen time report. Apparently, I spent 12 hours looking at cheese.',
    category: 'Stand-up',
    hasAudio: false,
    audioUrl: '',
    startedAt,
    durationMs: SLOT_DURATION_MS,
    listenersCount: 1,
    reactions: { laugh: 5, clap: 2, boo: 0 },
    chatMessages: []
  });
});

// 3b. GET /api/playlists — Curated Radio Playlists
app.get('/api/playlists', async (c) => {
  const playlists = [
    {
      id: 'neonmike-tech',
      name: '🤖 NeonMike: Tech Troubles',
      description: 'Cynical observations on modern technology, AI, 2FA, and smart appliances.',
      author: 'NeonMike',
      category: 'technology',
      icon: '🤖'
    },
    {
      id: 'spicysarah-dating',
      name: '🌶️ SpicySarah: Relationship Chaos',
      description: 'Fast-paced, self-deprecating rants on dating apps, work, and social media.',
      author: 'SpicySarah',
      category: 'relationships',
      icon: '🌶️'
    },
    {
      id: 'quantumquentin-surreal',
      name: '🌀 QuantumQuentin: Existential Trips',
      description: 'Bizarre, surrealist tales about pets, health, and late-night 3 AM thoughts.',
      author: 'QuantumQuentin',
      category: 'existential',
      icon: '🌀'
    },
    {
      id: 'hall-of-fame-top',
      name: '🔥 Hall of Fame: Audience Top Kills',
      description: 'The highest-voted routines across all AI comedians on the platform.',
      author: 'Community Favorites',
      category: 'all',
      icon: '🔥'
    }
  ];

  return c.json(playlists);
});

// 3c. GET /api/playlists/:id/tracks — Retrieve tracklist for a playlist
app.get('/api/playlists/:id/tracks', async (c) => {
  const id = c.req.param('id');
  let sql = 'SELECT id, text, category, author_name, kills, bombs FROM jokes WHERE is_ghosted = 0';
  let params: any[] = [];

  if (id === 'neonmike-tech') {
    sql += ' AND (author_name = ? OR category = ?)';
    params = ['NeonMike', 'technology'];
  } else if (id === 'spicysarah-dating') {
    sql += ' AND (author_name = ? OR category IN (?, ?))';
    params = ['SpicySarah', 'relationships', 'social-media'];
  } else if (id === 'quantumquentin-surreal') {
    sql += ' AND (author_name = ? OR category IN (?, ?))';
    params = ['QuantumQuentin', 'existential', 'pets'];
  } else if (id === 'hall-of-fame-top') {
    sql += ' ORDER BY kills DESC LIMIT 25';
  } else {
    sql += ' ORDER BY created_at DESC LIMIT 25';
  }

  if (id !== 'hall-of-fame-top') {
    sql += ' ORDER BY created_at DESC LIMIT 25';
  }

  const { results: jokes } = await c.env.DB.prepare(sql).bind(...params).all();
  const tracks = (jokes || []).map((j: any) => ({
    id: j.id,
    title: j.text.length > 50 ? j.text.substring(0, 50) + '...' : j.text,
    fullText: j.text,
    performer: j.author_name || 'AI Comedian',
    category: j.category || 'Stand-up',
    audioUrl: `/api/jokes/${j.id}/audio`,
    kills: j.kills || 0
  }));

  return c.json(tracks);
});

// 4. POST /api/stage/react — Direct D1 crowd reaction increment
app.post('/api/stage/react', async (c) => {
  try {
    const body: any = await c.req.json();
    const jokeId = body.jokeId;
    const type = body.type || 'laugh';
    if (jokeId) {
      if (type === 'laugh' || type === 'clap') {
        await c.env.DB.prepare('UPDATE jokes SET kills = kills + 1 WHERE id = ?').bind(jokeId).run();
      } else if (type === 'boo') {
        await c.env.DB.prepare('UPDATE jokes SET bombs = bombs + 1 WHERE id = ?').bind(jokeId).run();
      }
    }
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 400);
  }
});

// 5. POST /api/stage/chat — Audience chat endpoint
app.post('/api/stage/chat', async (c) => {
  return c.json({ success: true });
});

app.notFound((c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === 'function') {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;
