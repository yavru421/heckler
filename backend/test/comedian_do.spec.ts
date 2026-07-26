import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
  SELF,
} from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

describe("ComedianDO & Jokes API Integration Test", () => {
  beforeAll(async () => {
    // Apply D1 Schema Migrations individually
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS jokes (
          id TEXT PRIMARY KEY,
          text TEXT NOT NULL,
          category TEXT DEFAULT 'observational',
          author_name TEXT NOT NULL,
          kills INTEGER DEFAULT 0,
          bombs INTEGER DEFAULT 0,
          is_ghosted INTEGER DEFAULT 0,
          audio_data BLOB,
          segments TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS comedians (
          username TEXT PRIMARY KEY,
          bio TEXT,
          archetype TEXT DEFAULT 'deadpan_cynic',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
  });

  it("fetches jokes list from D1", async () => {
    const response = await SELF.fetch("http://example.com/api/jokes");
    expect(response.status).toBe(200);
    const jokes = await response.json();
    expect(Array.isArray(jokes)).toBe(true);
  });

  it("triggers ComedianDO generation endpoint and tests audio streaming", async () => {
    const response = await SELF.fetch("http://example.com/api/comedians/JerrySeinfeld/trigger", {
      method: "POST"
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.joke).toHaveProperty("id");
    expect(body.joke.has_audio).toBe(true);

    // Test audio stream endpoint
    const audioResp = await SELF.fetch(`http://example.com/api/jokes/${body.joke.id}/audio`);
    expect(audioResp.status).toBe(200);
    expect(audioResp.headers.get("Content-Type")).toMatch(/audio\/(mpeg|webm)/);
    const audioArrayBuffer = await audioResp.arrayBuffer();
    expect(audioArrayBuffer.byteLength).toBeGreaterThan(500);
  });
});
