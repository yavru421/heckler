import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  ASSETS: any;
  AI: any;
  COMEDIAN_DO: DurableObjectNamespace;
  AUDIO_BUCKET: R2Bucket;
}

export { ComedianDO } from './comedian_do';

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

// 2. GET /api/jokes/:id/audio — Stream stored MP3 audio cleanly from R2 Object Storage
app.get('/api/jokes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const r2Key = `audio/${id}.mp3`;

  // Attempt 1: Fetch directly from Cloudflare R2 bucket (fastest, zero DB lag)
  if (c.env.AUDIO_BUCKET) {
    const object = await c.env.AUDIO_BUCKET.get(r2Key);
    if (object) {
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Content-Type', 'audio/mpeg');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('etag', object.httpEtag);
      return new Response(object.body, { headers });
    }
  }

  // Attempt 2: D1 DB fallback for legacy entries
  const result: any = await c.env.DB.prepare('SELECT audio_data FROM jokes WHERE id = ?').bind(id).first();
  if (!result || !result.audio_data) {
    return c.text('Audio not found', 404);
  }
  const buffer = result.audio_data as ArrayBuffer;
  if (!buffer || buffer.byteLength === 0) {
    return c.text('Audio empty', 404);
  }

  return new Response(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    }
  });
});

// 3. GET /api/stage/live — Active MMO Main Stage Broadcast State
app.get('/api/stage/live', async (c) => {
  const url = new URL(c.req.url);
  const excludeIds = url.searchParams.get("excludeIds") || "";
  const id = c.env.COMEDIAN_DO.idFromName('MAIN_STAGE');
  const stub = c.env.COMEDIAN_DO.get(id);
  return stub.fetch(new Request(`http://do/stage/live?excludeIds=${encodeURIComponent(excludeIds)}`, { method: 'GET' }));
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

// 3b. GET /api/stage/ws — Active MMO Main Stage WebSocket Connection
app.get('/api/stage/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') {
    return c.text('Expected Upgrade: websocket', 426);
  }
  const id = c.env.COMEDIAN_DO.idFromName('MAIN_STAGE');
  const stub = c.env.COMEDIAN_DO.get(id);
  return stub.fetch(c.req.raw);
});


// 4. POST /api/stage/react — Broadcast live crowd reaction
app.post('/api/stage/react', async (c) => {
  const id = c.env.COMEDIAN_DO.idFromName('MAIN_STAGE');
  const stub = c.env.COMEDIAN_DO.get(id);
  return stub.fetch(new Request('http://do/stage/react', { method: 'POST', body: c.req.raw.body }));
});

// 5. POST /api/stage/chat — Post audience chat message
app.post('/api/stage/chat', async (c) => {
  const id = c.env.COMEDIAN_DO.idFromName('MAIN_STAGE');
  const stub = c.env.COMEDIAN_DO.get(id);
  return stub.fetch(new Request('http://do/stage/chat', { method: 'POST', body: c.req.raw.body }));
});

// 6. POST /api/comedians/:username/trigger — Direct ComedianDO generation
app.post('/api/comedians/:username/trigger', async (c) => {
  const username = c.req.param('username');
  const id = c.env.COMEDIAN_DO.idFromName(username);
  const stub = c.env.COMEDIAN_DO.get(id);
  const url = new URL(c.req.url);
  url.pathname = `/trigger`;
  url.searchParams.set('username', username);
  return stub.fetch(new Request(url.toString(), { method: 'POST' }));
});

// 7. POST /api/comedians/:username/schedule — Schedule autonomous generation alarm
app.post('/api/comedians/:username/schedule', async (c) => {
  const username = c.req.param('username');
  const id = c.env.COMEDIAN_DO.idFromName(username);
  const stub = c.env.COMEDIAN_DO.get(id);
  const url = new URL(c.req.url);
  url.pathname = `/schedule`;
  url.searchParams.set('username', username);
  return stub.fetch(new Request(url.toString(), { method: 'POST' }));
});

// 4. POST /api/tts — Direct TTS endpoint fallback
app.post('/api/tts', async (c) => {
  try {
    const body = await c.req.json();
    const text = body.text;
    const performer = body.performer || body.speaker || 'orion';
    let speaker = performer.toLowerCase().includes('sarah') ? 'asteria' : performer;
    if (!text) return c.text('Text is required', 400);

    const cleanText = text.replace(/\[PAUSE(?::[0-9.]+)?\]/gi, " ").replace(/[#*$_[\](){}]/g, "").replace(/\s+/g, " ").trim();
    const ttsResponse = await c.env.AI.run("@cf/deepgram/aura-2-en", { text: cleanText, speaker }, { returnRawResponse: true });
    
    if (ttsResponse.ok) {
      const audioBuffer = await ttsResponse.arrayBuffer();
      if (audioBuffer.byteLength > 500) {
        return new Response(audioBuffer, {
          headers: { 'Content-Type': 'audio/mpeg', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    return c.text('TTS Generation Failed', 500);
  } catch (err: any) {
    return c.text(`TTS Generation Error: ${err.message}`, 500);
  }
});

// 5. POST /api/migrate-d1-to-r2 — Migrate existing audio blobs from D1 to R2 bucket
app.post('/api/migrate-d1-to-r2', async (c) => {
  try {
    const { results: jokes } = await c.env.DB.prepare(
      'SELECT id, audio_data FROM jokes WHERE audio_data IS NOT NULL AND length(audio_data) > 500'
    ).all();

    let migratedCount = 0;
    if (jokes && jokes.length > 0) {
      for (const joke of jokes) {
        const id = joke.id;
        const buffer = joke.audio_data as ArrayBuffer;
        if (buffer && buffer.byteLength > 500) {
          const r2Key = `audio/${id}.mp3`;
          await c.env.AUDIO_BUCKET.put(r2Key, buffer, {
            httpMetadata: { contentType: 'audio/mpeg' }
          });
          migratedCount++;
        }
      }
    }

    return c.json({
      success: true,
      migratedCount,
      message: `Successfully migrated ${migratedCount} historical audio tracks from D1 to R2 storage.`
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.notFound((c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === 'function') {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;

