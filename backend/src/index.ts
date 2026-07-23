import { Hono } from 'hono';
import { cors } from 'hono/cors';

export interface Env {
  DB: D1Database;
  ASSETS: any;
  AI: any;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());
app.use('/*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' blob: data:; script-src * 'unsafe-inline' 'unsafe-eval' blob:; connect-src * blob: data:; media-src * blob: data:; style-src * 'unsafe-inline'; worker-src * blob:;");
  c.header('Access-Control-Allow-Origin', '*');
});

// 1. GET /api/jokes — List comedy shows/sets
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

// 2. GET /api/jokes/:id/audio — Stream MP3 audio cleanly
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

// 3. POST /api/tts — Direct fallback audio stream over HTML5 Audio
app.post('/api/tts', async (c) => {
  try {
    const body = await c.req.json();
    const text = body.text;
    if (!text) {
      return c.text('Text is required', 400);
    }

    const cleanText = text
      .replace(/\[PAUSE\]/gi, " ")
      .replace(/[#*$_[\](){}]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    try {
      const ttsResponse = await c.env.AI.run("@cf/deepgram/aura-1", {
        text: cleanText,
        speaker: 'orion'
      }, { returnRawResponse: true });
      
      if (ttsResponse.ok) {
        const audioBuffer = await ttsResponse.arrayBuffer();
        if (audioBuffer.byteLength > 500) {
          return new Response(audioBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      }
    } catch (e) {
      console.warn("Aura-1 TTS failed:", e);
    }

    return c.text('TTS Generation Failed', 500);
  } catch (err: any) {
    return c.text(`TTS Generation Error: ${err.message}`, 500);
  }
});

// 4. POST /api/jokes/generate — Produce a fresh comedy show set on demand using Llama 3.1 & Aura-1
app.post('/api/jokes/generate', async (c) => {
  try {
    let topic = 'everyday life';
    try {
      const body = await c.req.json();
      if (body && body.topic) topic = body.topic;
    } catch (e) {}

    const llamaResponse = await c.env.AI.run(
      '@cf/meta/llama-3.1-8b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: 'You are a hilarious stand-up comedian. Write a short, punchy, hilarious 2-sentence stand-up joke. Make it clever and extremely funny.'
          },
          {
            role: 'user',
            content: `Write a stand-up joke about ${topic}.`
          }
        ]
      }
    );

    const jokeText = (llamaResponse as any).response || `Why did the programmer switch to clean architecture? Because complex state synchronization was giving them headaches!`;

    // Synthesize audio using Aura-1
    let audioBuffer: ArrayBuffer | null = null;
    try {
      const cleanText = jokeText.replace(/[#*$_[\](){}]/g, "").trim();
      const ttsResponse = await c.env.AI.run("@cf/deepgram/aura-1", {
        text: cleanText,
        speaker: 'orion'
      }, { returnRawResponse: true });

      if (ttsResponse.ok) {
        audioBuffer = await ttsResponse.arrayBuffer();
      }
    } catch (ttsErr) {
      console.warn('Aura-1 audio generation failed during show creation:', ttsErr);
    }

    const id = crypto.randomUUID();
    const comedianNames = ['Dave Light', 'Sarah Spark', 'Max Chuckle', 'Luna Laughs', 'RoboComedian'];
    const authorName = comedianNames[Math.floor(Math.random() * comedianNames.length)];

    await c.env.DB.prepare(
      'INSERT INTO jokes (id, text, category, author_name, audio_data) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, jokeText, topic, authorName, audioBuffer).run();

    return c.json({
      id,
      text: jokeText,
      category: topic,
      author_name: authorName,
      has_audio: Boolean(audioBuffer && audioBuffer.byteLength > 0)
    });
  } catch (err: any) {
    return c.json({ error: `Show generation failed: ${err.message}` }, 500);
  }
});

app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;

