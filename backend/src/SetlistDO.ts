import { Hono } from 'hono';
import { DurableObject } from "cloudflare:workers";

interface JokeState {
  id: string;
  kills: number;
  bombs: number;
  probabilityWeight: number; // Adjusted based on kills/bombs
}

export class SetlistDurableObject extends DurableObject {
  app: Hono;
  activeJokes: Map<string, JokeState>;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.activeJokes = new Map();
    this.app = new Hono();

    // Initialize DO state from storage if it exists
    this.ctx.blockConcurrencyWhile(async () => {
      const storedJokes = await this.ctx.storage.get<Map<string, JokeState>>('activeJokes');
      if (storedJokes) {
        // Stored value might be an Object if serialized/deserialized, convert back to Map
        if (storedJokes instanceof Map) {
          this.activeJokes = storedJokes;
        } else {
          this.activeJokes = new Map(Object.entries(storedJokes));
        }
      }
    });

    this.setupRoutes();
  }

  setupRoutes() {
    // Route to handle live ratings
    this.app.post('/rate', async (c) => {
      const { jokeId, rating } = await c.req.json();

      let joke = this.activeJokes.get(jokeId) || { 
        id: jokeId, kills: 0, bombs: 0, probabilityWeight: 1.0 
      };

      // Process "Kill" or "Bomb"
      if (rating === 'kill') {
        joke.kills += 1;
        joke.probabilityWeight *= 1.15; // Increase visibility by 15%
      } else if (rating === 'bomb') {
        joke.bombs += 1;
        joke.probabilityWeight *= 0.80; // Decrease visibility by 20%
      }

      // Ensure weights stay in reasonable bounds (e.g. 0.05 to 10.0)
      joke.probabilityWeight = Math.max(0.05, Math.min(10.0, joke.probabilityWeight));

      this.activeJokes.set(jokeId, joke);

      // Persist state to Durable Object storage
      await this.ctx.storage.put('activeJokes', this.activeJokes);

      return c.json({ success: true, updatedState: joke });
    });

    // Add a new joke to the active setlist pool
    this.app.post('/add', async (c) => {
      const { jokeId } = await c.req.json();
      if (!this.activeJokes.has(jokeId)) {
        this.activeJokes.set(jokeId, { 
          id: jokeId, kills: 0, bombs: 0, probabilityWeight: 1.0 
        });
        await this.ctx.storage.put('activeJokes', this.activeJokes);
      }
      return c.json({ success: true });
    });

    // List all active jokes and weights
    this.app.get('/jokes', async (c) => {
      return c.json(Array.from(this.activeJokes.values()));
    });

    // Pick the next joke using weighted random selection
    this.app.get('/next', async (c) => {
      if (this.activeJokes.size === 0) {
        return c.json({ nextJokeId: null });
      }

      const jokeList = Array.from(this.activeJokes.values());
      const totalWeight = jokeList.reduce((sum, j) => sum + j.probabilityWeight, 0);
      
      let random = Math.random() * totalWeight;
      for (const joke of jokeList) {
        random -= joke.probabilityWeight;
        if (random <= 0) {
          return c.json({ nextJokeId: joke.id });
        }
      }

      // Fallback
      return c.json({ nextJokeId: jokeList[0].id });
    });
  }

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}

