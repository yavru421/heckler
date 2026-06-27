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
        this.activeJokes = storedJokes;
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
        joke.probabilityWeight *= 1.1; // Increase visibility
      } else if (rating === 'bomb') {
        joke.bombs += 1;
        joke.probabilityWeight *= 0.9; // Decrease visibility
      }

      this.activeJokes.set(jokeId, joke);

      // Persist state to Durable Object storage
      await this.ctx.storage.put('activeJokes', this.activeJokes);

      // TODO: Schedule an alarm to flush aggregated stats to D1 periodically

      return c.json({ success: true, updatedState: joke });
    });

    this.app.get('/next', async (c) => {
      return c.json({ nextJokeId: "mock-joke-id" });
    });
  }

  async fetch(request: Request) {
    return this.app.fetch(request);
  }
}
