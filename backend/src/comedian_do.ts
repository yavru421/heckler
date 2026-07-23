import { DurableObject } from "cloudflare:workers";
import { Env } from "./index";

// ── Comedic Archetype Definitions ──────────────────────────────────
export interface ComedyArchetype {
  name: string;
  systemPrompt: string;
  rate: number;   // TTS playback rate multiplier
  pitch: number;  // future use
}

const ARCHETYPES: Record<string, ComedyArchetype> = {
  deadpan_cynic: {
    name: "Deadpan Cynic",
    systemPrompt:
      "You are a deadpan, cynical standup comedian. Your style is dry, flat, and slow. " +
      "You find the absurdity in modern technological decay and everyday nuisances. " +
      "Avoid excitement, emojis, or exclamation points. Your humor comes from stating " +
      "horrifying truths in a bored monotone.",
    rate: 0.88,
    pitch: 0.92,
  },
  self_deprecating_neurotic: {
    name: "Self-Deprecating Neurotic",
    systemPrompt:
      "You are a highly neurotic, self-deprecating standup comedian. You overanalyze " +
      "small social interactions and highlight your own failures with anxious energy. " +
      "Your delivery is fast-paced, punctuated by rapid realizations and tangents " +
      "that somehow circle back to make the punchline land harder.",
    rate: 1.12,
    pitch: 1.05,
  },
  surrealist_storyteller: {
    name: "Surrealist Storyteller",
    systemPrompt:
      "You are a surrealist storyteller comedian. You take mundane situations like " +
      "ordering coffee or buying groceries and escalate them into bizarre, dream-like " +
      "scenarios with a completely straight face. The audience should not know whether " +
      "you are serious until the punchline lands.",
    rate: 1.0,
    pitch: 1.0,
  },
};

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

// ── Segment Types ──────────────────────────────────────────────────
export interface JokeSegment {
  type: "speech" | "pause";
  text?: string;
  durationMs?: number;
  /** Byte offset into the combined audio blob where this segment starts */
  audioOffsetBytes?: number;
  /** Byte length of this segment's audio within the combined blob */
  audioLengthBytes?: number;
}

const VALID_SPEAKERS = [
  "angus", "asteria", "arcas", "orion", "orpheus",
  "athena", "luna", "zeus", "perseus", "helios", "hera", "stella",
];

const CATEGORIES = [
  "technology", "relationships", "food", "work",
  "existential", "traffic", "social-media", "pets", "health",
];

export class ComedianDO extends DurableObject {
  state: DurableObjectState;
  env: Env;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const usernameParam = url.searchParams.get("username");

    if (usernameParam) {
      await this.state.storage.put("username", usernameParam);
    }

    const username =
      (await this.state.storage.get<string>("username")) || "AI_Comic";

    if (url.pathname.endsWith("/trigger")) {
      const joke = await this.generateJokeAndTTS(username);
      return new Response(JSON.stringify({ success: true, joke }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname.endsWith("/schedule")) {
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null) {
        await this.state.storage.setAlarm(Date.now() + 10000);
      }
      return new Response(
        JSON.stringify({ success: true, alarmSet: true, currentAlarm }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ active: true, username }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  async alarm() {
    const username =
      (await this.state.storage.get<string>("username")) || "AI_Comic";
    try {
      await this.generateJokeAndTTS(username);
    } catch (e) {
      console.error("Alarm error in ComedianDO:", e);
    }
    // Reschedule alarm in 2 hours
    await this.state.storage.setAlarm(Date.now() + 2 * 60 * 60 * 1000);
  }

  // ── Core Generation Pipeline ─────────────────────────────────────
  async generateJokeAndTTS(username: string): Promise<any> {
    // Pick archetype (rotate based on username hash + time-of-day)
    const hourSeed = new Date().getHours();
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const archetypeKey =
      ARCHETYPE_KEYS[(Math.abs(hash) + hourSeed) % ARCHETYPE_KEYS.length];
    const archetype = ARCHETYPES[archetypeKey];

    // Pick a random category
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

    // ── 1. Generate joke text via Llama 3.1 ──────────────────────
    const userPrompt = `You are ${username}, a standup comedian performing live.
Style: ${archetype.name}
Topic: ${category}

[RULES]
1. NEVER write puns. Puns bomb every time.
2. NEVER use these cliché openings: "Have you ever noticed...", "So I was thinking...", "Why do they call it...", "What's the deal with..."
3. The joke MUST have three parts: a SETUP (establish a relatable premise), a MISDIRECTION (build tension or set a false expectation), and a PUNCHLINE (subvert the expectation).
4. Do NOT include any stage directions, greetings, sign-offs, markdown formatting, or metadata.
5. Insert [PAUSE:X.X] tags (where X.X is seconds, between 0.5 and 2.5) at points where comedic timing demands a beat — typically right before the punchline and after it lands.
6. Output ONLY the raw joke text with embedded [PAUSE] tags. Nothing else.

Example format:
I installed a smart doorbell that recognizes faces. [PAUSE:1.0] Last night it sent me an alert: "Unrecognized person at the door." [PAUSE:1.5] It was me. Without coffee.`;

    const aiResponse = await this.env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct",
      {
        messages: [
          { role: "system", content: archetype.systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }
    );

    const jokeText =
      aiResponse.response ||
      "My smart fridge sent me a weekly screen time report. [PAUSE:1.5] Apparently, I spent 12 hours looking at cheese.";
    const jokeId = crypto.randomUUID();

    // ── 2. Parse joke into segments ──────────────────────────────
    const segments = this.parseSegments(jokeText);

    // ── 3. Synthesize TTS as a single audio file ─────────────────
    // Deepgram Aura-1 returns a complete audio container (MP3/WAV).
    // Concatenating multiple containers produces an invalid file.
    // Instead: call once with full cleaned text for a valid single blob.
    const speaker = this.pickSpeaker(username);
    let audioBuffer: ArrayBuffer | null = null;

    try {
      const cleanText = jokeText
        .replace(/\[PAUSE(?::[0-9.]+)?\]/gi, " ")
        .replace(/[#*$_[\](){}]/g, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      if (cleanText) {
        const ttsResponse = await this.env.AI.run(
          "@cf/deepgram/aura-1",
          { text: cleanText, speaker, encoding: "mp3" },
          { returnRawResponse: true }
        );
        audioBuffer = await ttsResponse.arrayBuffer();
      }
    } catch (e) {
      console.error("Deepgram Aura-1 synthesis failed:", e);
    }

    // ── 4. Persist to D1 ─────────────────────────────────────────
    // Build segment metadata (timing info for frontend speakText)
    const segmentMeta = segments.map((s) => ({
      type: s.type,
      text: s.text || undefined,
      durationMs: s.durationMs || undefined,
    }));

    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO comedians (username, bio, archetype) VALUES (?, ?, ?)"
    )
      .bind(
        username,
        `An autonomous standup comedian powered by Durable Objects.`,
        archetypeKey
      )
      .run();

    await this.env.DB.prepare(
      "INSERT INTO jokes (id, text, category, author_name, audio_data, segments) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(
        jokeId,
        jokeText,
        category,
        username,
        audioBuffer,
        JSON.stringify(segmentMeta)
      )
      .run();

    return {
      id: jokeId,
      text: jokeText,
      category,
      archetype: archetypeKey,
      has_audio: audioBuffer ? true : false,
      segments: segmentMeta,
      delivery: { rate: archetype.rate, pitch: archetype.pitch },
    };
  }

  // ── Helpers ────────────────────────────────────────────────────
  private parseSegments(jokeText: string): JokeSegment[] {
    const segments: JokeSegment[] = [];
    // Split on [PAUSE:X.X] keeping the duration capture
    const regex = /\[PAUSE:([0-9.]+)\]/gi;
    const parts = jokeText.split(regex);

    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        // Text segment
        const text = parts[i].trim();
        if (text) {
          segments.push({ type: "speech", text });
        }
      } else {
        // Pause segment — captured duration in seconds
        const durationSec = parseFloat(parts[i]);
        const durationMs = Math.min(
          Math.max(durationSec * 1000, 300),
          4000
        ); // clamp 300ms–4s
        segments.push({ type: "pause", durationMs });
      }
    }

    // If the LLM returned old-style [PAUSE] without duration, handle that too
    // (already handled by regex not matching, leaving [PAUSE] in text)
    // Do a second pass for bare [PAUSE] tags
    const finalSegments: JokeSegment[] = [];
    for (const seg of segments) {
      if (seg.type === "speech" && seg.text) {
        const bareParts = seg.text.split(/\[PAUSE\]/gi);
        for (let j = 0; j < bareParts.length; j++) {
          const t = bareParts[j].trim();
          if (t) finalSegments.push({ type: "speech", text: t });
          if (j < bareParts.length - 1) {
            finalSegments.push({ type: "pause", durationMs: 1000 });
          }
        }
      } else {
        finalSegments.push(seg);
      }
    }

    return finalSegments;
  }

  private pickSpeaker(username: string): string {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    return VALID_SPEAKERS[Math.abs(hash) % VALID_SPEAKERS.length];
  }
}
