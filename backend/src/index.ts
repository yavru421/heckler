import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  ASSETS: any;
  AI: any;
  COMEDIAN_DO: DurableObjectNamespace;
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

// 2. GET /api/jokes/:id/audio — Stream stored MP3 audio cleanly
app.get('/api/jokes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const result: any = await c.env.DB.prepare('SELECT audio_data FROM jokes WHERE id = ?').bind(id).first();
  if (!result || !result.audio_data) {
    return c.text('Audio not found', 404);
  }
  const buffer = result.audio_data as ArrayBuffer;
  if (!buffer || buffer.byteLength === 0) {
    return c.text('Audio empty', 404);
  }

  const bytes = new Uint8Array(buffer.slice(0, 4));
  let contentType = 'audio/mpeg';
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    contentType = 'audio/webm';
  }

  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*'
    }
  });
});

// 3. GET /api/stage/live — Active MMO Main Stage Broadcast State
app.get('/api/stage/live', async (c) => {
  const id = c.env.COMEDIAN_DO.idFromName('MAIN_STAGE');
  const stub = c.env.COMEDIAN_DO.get(id);
  return stub.fetch(new Request('http://do/stage/live', { method: 'GET' }));
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

app.notFound((c) => {
  if (c.env.ASSETS && typeof c.env.ASSETS.fetch === 'function') {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Not Found', 404);
});

export default app;

