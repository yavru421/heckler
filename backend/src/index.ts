import { Hono } from 'hono';
import { SetlistDurableObject } from './SetlistDO';

export { SetlistDurableObject }; // Must export DO class

export interface Env {
  AI: any;
  DB: D1Database;
  JOKE_VAULT: VectorizeIndex;
  SETLIST_DO: DurableObjectNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// 1. AI Joke Generation
app.post('/api/jokes/generate', async (c) => {
  const { prompt } = await c.req.json();
  
  // Call Workers AI
  const response = await c.env.AI.run('@cf/meta/llama-3-8b-instruct', {
    messages: [
      { role: 'system', content: 'You are a stand-up comedian. Write a short, punchy joke based on the prompt.' },
      { role: 'user', content: prompt }
    ]
  });

  const jokeText = response.response;
  
  // TODO: Generate embedding, store in Vectorize and D1

  return c.json({ joke: jokeText });
});

// 2. Interact with the Live Setlist (Durable Object)
app.post('/api/setlists/:id/rate', async (c) => {
  const setlistId = c.req.param('id');
  const { jokeId, rating } = await c.req.json(); // rating: 'kill' | 'bomb'

  // Get or create the Durable Object instance for this setlist
  const id = c.env.SETLIST_DO.idFromName(setlistId);
  const stub = c.env.SETLIST_DO.get(id);

  // Forward the rating request to the Durable Object
  const doRequest = new Request(`http://do/rate`, {
    method: 'POST',
    body: JSON.stringify({ jokeId, rating }),
  });
  
  const doResponse = await stub.fetch(doRequest);
  const result = await doResponse.json();

  return c.json(result);
});

export default app;
