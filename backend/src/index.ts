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

app.use('/*', cors());

// Helper: generate voter fingerprint
async function getFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ua = request.headers.get('User-Agent') || 'unknown';
  const data = new TextEncoder().encode(ip + '|' + ua);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.substring(0, 16);
}

// 1. GET /api/jokes — feed
app.get('/api/jokes', async (c) => {
  const sort = c.req.query('sort') || 'hot';
  const page = parseInt(c.req.query('page') || '0');
  const category = c.req.query('category');
  const limit = 20;
  const offset = page * limit;

  let query = 'SELECT * FROM jokes WHERE is_ghosted = 0';
  const params: any[] = [];
  
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }

  switch (sort) {
    case 'new':
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      break;
    case 'random':
      query += ' ORDER BY RANDOM() LIMIT ? OFFSET ?';
      break;
    case 'hot':
    default:
      query += ' ORDER BY (kills - bombs) DESC, created_at DESC LIMIT ? OFFSET ?';
      break;
  }

  params.push(limit, offset);

  const { results: jokes } = await c.env.DB.prepare(query).bind(...params).all();

  const jokesWithHeckles = await Promise.all(
    (jokes || []).map(async (joke: any) => {
      const { results: heckles } = await c.env.DB.prepare(
        `SELECT * FROM heckles WHERE joke_id = ? AND is_ghosted = 0 ORDER BY (kills - bombs) DESC LIMIT 1`
      ).bind(joke.id).all();
      
      const topHeckle = heckles?.[0] ? {
        id: heckles[0].id,
        joke_id: heckles[0].joke_id,
        text: heckles[0].text,
        author_name: heckles[0].author_name,
        kills: heckles[0].kills,
        bombs: heckles[0].bombs
      } : null;

      // Check if audio exists
      const hasAudio = joke.audio_data ? true : false;

      return {
        id: joke.id,
        text: joke.text,
        category: joke.category,
        author_name: joke.author_name,
        kills: joke.kills,
        bombs: joke.bombs,
        created_at: joke.created_at,
        has_audio: hasAudio,
        topHeckle
      };
    })
  );

  return c.json(jokesWithHeckles);
});

// 2. GET /api/jokes/:id/audio — retrieve joke audio
app.get('/api/jokes/:id/audio', async (c) => {
  const id = c.req.param('id');
  const result: any = await c.env.DB.prepare('SELECT audio_data FROM jokes WHERE id = ?').bind(id).first();
  if (!result || !result.audio_data) {
    return c.text('Audio not found', 404);
  }
  // D1 returns BLOBs as ArrayBuffer
  return new Response(result.audio_data, {
    headers: { 'Content-Type': 'audio/webm' }
  });
});

// 3. POST /api/jokes — Submit a joke (supports JSON base64 or Multipart)
app.post('/api/jokes', async (c) => {
  let text = '';
  let authorName = '';
  let category = 'observational';
  let audioData: ArrayBuffer | null = null;

  const contentType = c.req.header('Content-Type') || '';
  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    text = (body['text'] as string) || '';
    authorName = (body['authorName'] as string) || '';
    category = (body['category'] as string) || 'observational';
    
    const audioFile = body['audio'] as any;
    if (audioFile && audioFile instanceof File) {
      audioData = await audioFile.arrayBuffer();
    }
  } else {
    // JSON fallback
    const body = await c.req.json();
    text = body.text || '';
    authorName = body.authorName || '';
    category = body.category || 'observational';
    if (body.audioBase64) {
      const binary = atob(body.audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      audioData = bytes.buffer;
    }
  }

  if (!text || !authorName) {
    return c.json({ error: 'text and authorName are required' }, 400);
  }

  const id = crypto.randomUUID();
  
  await c.env.DB.prepare(
    'INSERT INTO jokes (id, text, category, author_name, audio_data) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, text, category, authorName, audioData).run();

  return c.json({
    id,
    text,
    category,
    author_name: authorName,
    kills: 0,
    bombs: 0,
    has_audio: audioData ? true : false
  });
});

// 4. POST /api/jokes/:id/rate — Rate a joke
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
  await c.env.DB.prepare(`UPDATE jokes SET ${column} = ${column} + 1 WHERE id = ?`).bind(jokeId).run();

  return c.json({ success: true });
});

// 5. GET /api/jokes/shame
app.get('/api/jokes/shame', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT j.*, 
      (SELECT h.text FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_text,
      (SELECT h.author_name FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_author
    FROM jokes j
    WHERE j.is_ghosted = 0 AND j.bombs > 5
    ORDER BY j.bombs DESC LIMIT 50`
  ).all();

  const mapped = (results || []).map((row: any) => ({
    id: row.id,
    text: row.text,
    category: row.category,
    author_name: row.author_name,
    kills: row.kills,
    bombs: row.bombs,
    created_at: row.created_at,
    topHeckle: row.top_heckle_text ? {
      text: row.top_heckle_text,
      author_name: row.top_heckle_author
    } : null
  }));

  return c.json(mapped);
});

// 6. GET /api/jokes/fame
app.get('/api/jokes/fame', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT j.*,
      (SELECT h.text FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_text,
      (SELECT h.author_name FROM heckles h WHERE h.joke_id = j.id AND h.is_ghosted = 0 ORDER BY (h.kills - h.bombs) DESC LIMIT 1) as top_heckle_author
    FROM jokes j
    WHERE j.is_ghosted = 0 AND j.kills > 5
    ORDER BY j.kills DESC LIMIT 50`
  ).all();

  const mapped = (results || []).map((row: any) => ({
    id: row.id,
    text: row.text,
    category: row.category,
    author_name: row.author_name,
    kills: row.kills,
    bombs: row.bombs,
    created_at: row.created_at,
    topHeckle: row.top_heckle_text ? {
      text: row.top_heckle_text,
      author_name: row.top_heckle_author
    } : null
  }));

  return c.json(mapped);
});

// 7. LINEUPS (Playlists) Endpoints
app.get('/api/lineups', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM lineups ORDER BY created_at DESC').all();
  return c.json(results || []);
});

app.get('/api/lineups/:id', async (c) => {
  const id = c.req.param('id');
  const lineup: any = await c.env.DB.prepare('SELECT * FROM lineups WHERE id = ?').bind(id).first();
  if (!lineup) return c.text('Lineup not found', 404);

  const { results: jokes } = await c.env.DB.prepare(
    `SELECT j.* FROM jokes j 
     JOIN lineup_jokes lj ON lj.joke_id = j.id 
     WHERE lj.lineup_id = ? 
     ORDER BY lj.position ASC`
  ).bind(id).all();

  const mappedJokes = (jokes || []).map((j: any) => ({
    id: j.id,
    text: j.text,
    category: j.category,
    author_name: j.author_name,
    kills: j.kills,
    bombs: j.bombs,
    created_at: j.created_at,
    has_audio: j.audio_data ? true : false
  }));

  return c.json({
    ...lineup,
    jokes: mappedJokes
  });
});

app.post('/api/lineups', async (c) => {
  const { name, authorName, jokeIds } = await c.req.json();
  if (!name || !authorName || !jokeIds || !Array.isArray(jokeIds)) {
    return c.text('Invalid lineup fields', 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO lineups (id, name, author_name) VALUES (?, ?, ?)')
    .bind(id, name, authorName)
    .run();

  for (let i = 0; i < jokeIds.length; i++) {
    await c.env.DB.prepare('INSERT INTO lineup_jokes (lineup_id, joke_id, position) VALUES (?, ?, ?)')
      .bind(id, jokeIds[i], i)
      .run();
  }

  return c.json({ id, name, authorName });
});

// 8. CO-LISTENING TABLES (Rooms)
app.get('/api/rooms', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM club_rooms ORDER BY created_at DESC').all();
  return c.json(results || []);
});

app.post('/api/rooms', async (c) => {
  const { name, lineupId } = await c.req.json();
  if (!name) return c.text('Room name required', 400);
  const id = crypto.randomUUID();
  
  await c.env.DB.prepare(
    'INSERT INTO club_rooms (id, name, current_lineup_id, joke_started_at) VALUES (?, ?, ?, ?)'
  ).bind(id, name, lineupId || null, new Date().toISOString()).run();

  return c.json({ id, name, current_lineup_id: lineupId });
});

app.get('/api/rooms/:id/poll', async (c) => {
  const id = c.req.param('id');
  const room: any = await c.env.DB.prepare('SELECT * FROM club_rooms WHERE id = ?').bind(id).first();
  if (!room) return c.text('Room not found', 404);

  // Clean old reactions (> 10s old)
  await c.env.DB.prepare("DELETE FROM room_reactions WHERE room_id = ? AND datetime(created_at) < datetime('now', '-10 seconds')")
    .bind(id)
    .run();

  const { results: reactions } = await c.env.DB.prepare('SELECT * FROM room_reactions WHERE room_id = ?').bind(id).all();

  return c.json({
    id: room.id,
    name: room.name,
    current_lineup_id: room.current_lineup_id,
    current_joke_index: room.current_joke_index,
    joke_started_at: room.joke_started_at,
    reactions: (reactions || []).map((r: any) => r.reaction_type)
  });
});

app.post('/api/rooms/:id/react', async (c) => {
  const id = c.req.param('id');
  const { reactionType } = await c.req.json();
  if (!reactionType) return c.text('Reaction type required', 400);

  const reactionId = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO room_reactions (id, room_id, reaction_type) VALUES (?, ?, ?)')
    .bind(reactionId, id, reactionType)
    .run();

  return c.json({ success: true });
});

// Sync track index
app.post('/api/rooms/:id/next', async (c) => {
  const id = c.req.param('id');
  const { index } = await c.req.json();
  
  await c.env.DB.prepare(
    'UPDATE club_rooms SET current_joke_index = ?, joke_started_at = ? WHERE id = ?'
  ).bind(index, new Date().toISOString(), id).run();

  return c.json({ success: true });
});

// 9. COMEDIAN PROFILES
app.get('/api/comedians/:username', async (c) => {
  const username = c.req.param('username');
  let profile: any = await c.env.DB.prepare('SELECT * FROM comedians WHERE username = ?').bind(username).first();
  
  if (!profile) {
    // Create lazy profile
    await c.env.DB.prepare('INSERT INTO comedians (username, bio) VALUES (?, ?)')
      .bind(username, 'New Comedian on the Block')
      .run();
    profile = { username, bio: 'New Comedian on the Block' };
  }

  const followerCount: any = await c.env.DB.prepare('SELECT COUNT(*) as count FROM follows WHERE comedian_username = ?')
    .bind(username)
    .first();

  const { results: jokes } = await c.env.DB.prepare('SELECT * FROM jokes WHERE author_name = ?').bind(username).all();

  const mappedJokes = (jokes || []).map((j: any) => ({
    id: j.id,
    text: j.text,
    category: j.category,
    author_name: j.author_name,
    kills: j.kills,
    bombs: j.bombs,
    created_at: j.created_at,
    has_audio: j.audio_data ? true : false
  }));

  return c.json({
    username: profile.username,
    bio: profile.bio,
    follower_count: followerCount?.count || 0,
    jokes: mappedJokes
  });
});

app.post('/api/comedians/:username/follow', async (c) => {
  const username = c.req.param('username');
  const { followerName } = await c.req.json();
  if (!followerName) return c.text('Follower name required', 400);

  try {
    await c.env.DB.prepare('INSERT INTO follows (follower_username, comedian_username) VALUES (?, ?)')
      .bind(followerName, username)
      .run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      // Unfollow
      await c.env.DB.prepare('DELETE FROM follows WHERE follower_username = ? AND comedian_username = ?')
        .bind(followerName, username)
        .run();
      return c.json({ followed: false });
    }
    throw e;
  }

  return c.json({ followed: true });
});

// 10. AI HOUSE COMEDIAN (AI Gateway & Workers AI)
app.post('/api/club/generate-set', async (c) => {
  const { theme } = await c.req.json();
  const targetTheme = theme || 'general life';

  try {
    const response = await c.env.AI.run(
      '@cf/meta/llama-3-8b-instruct',
      {
        messages: [
          {
            role: 'system',
            content: 'You are an AI Stand-up Comedian on stage at a comedy club. Deliver a short, funny 3-joke set on the user\'s requested topic. Separate each joke clearly with a [PAUSE] tag for the text-to-speech player. Keep it clean and witty.'
          },
          {
            role: 'user',
            content: `Write a stand-up comedy set about: ${targetTheme}`
          }
        ]
      },
      {
        gateway: {
          id: 'heckler-gateway',
          skipCache: false
        }
      }
    );

    const content = (response as any).response || 'Thank you, you have been a great crowd!';
    return c.json({ content });
  } catch (e: any) {
    // Local fallback in case token is missing / environment not configured
    return c.json({ 
      content: `I wanted to make a joke about ${targetTheme}, but the microphone cut out! [PAUSE] Let's just say it's too funny to print. [PAUSE] Thank you, you have been a great crowd!`
    });
  }
});

// 11. AUDIENCE FEEDBACK CHAT
app.get('/api/chat', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM audience_chat ORDER BY created_at DESC LIMIT 50'
  ).all();
  return c.json(results || []);
});

app.post('/api/chat', async (c) => {
  const { username, message } = await c.req.json();
  if (!username || !message) {
    return c.json({ error: 'username and message are required' }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO audience_chat (id, username, message) VALUES (?, ?, ?)'
  ).bind(id, username, message).run();
  
  return c.json({ id, username, message, success: true });
});

// 12. COMEDIAN DURABLE OBJECT CONTROLS
app.post('/api/comedians/:username/trigger', async (c) => {
  const username = c.req.param('username');
  const id = c.env.COMEDIAN_DO.idFromName(username);
  const stub = c.env.COMEDIAN_DO.get(id);
  const url = new URL(c.req.url);
  url.pathname = `/trigger`;
  url.searchParams.set('username', username);
  return stub.fetch(new Request(url.toString(), { method: 'POST' }));
});

app.post('/api/comedians/:username/schedule', async (c) => {
  const username = c.req.param('username');
  const id = c.env.COMEDIAN_DO.idFromName(username);
  const stub = c.env.COMEDIAN_DO.get(id);
  const url = new URL(c.req.url);
  url.pathname = `/schedule`;
  url.searchParams.set('username', username);
  return stub.fetch(new Request(url.toString(), { method: 'POST' }));
});

app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
