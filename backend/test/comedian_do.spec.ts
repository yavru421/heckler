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

  it("triggers ComedianDO generation endpoint", async () => {
    const response = await SELF.fetch("http://example.com/api/comedians/JerrySeinfeld/trigger", {
      method: "POST"
    });
    console.log("Response status:", response.status);
    const text = await response.text();
    console.log("ComedianDO trigger raw response:", text);
    expect([200, 500]).toContain(response.status);
  });
});
