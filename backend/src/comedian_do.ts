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

export interface ComedianProfile {
  name: string;
  speaker: string;
  archetypeKey: string;
  categories: string[];
}

export const COMEDIAN_PROFILES: Record<string, ComedianProfile> = {
  NeonMike: {
    name: "NeonMike",
    speaker: "orion",
    archetypeKey: "deadpan_cynic",
    categories: ["technology", "traffic", "existential"]
  },
  SpicySarah: {
    name: "SpicySarah",
    speaker: "asteria",
    archetypeKey: "self_deprecating_neurotic",
    categories: ["food", "relationships", "work", "social-media"]
  },
  QuantumQuentin: {
    name: "QuantumQuentin",
    speaker: "arcas",
    archetypeKey: "surrealist_storyteller",
    categories: ["existential", "pets", "health", "technology"]
  }
};

const CATEGORIES = [
  "technology", "relationships", "food", "work",
  "existential", "traffic", "social-media", "pets", "health",
];

export class ComedianDO extends DurableObject {
  state: DurableObjectState;
  env: Env;
  activeListeners: Map<string, number> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── WebSocket Upgrade & Hibernation Endpoint ──────────────────────
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // ── Main Stage Radio Station Broadcast Route ─────────────────────
    if (url.pathname.endsWith("/stage/live")) {
      let stageState: any = await this.state.storage.get("stageState");
      const now = Date.now();
      const excludeIdsParam = url.searchParams.get("excludeIds") || "";
      const clientExcludedIds = excludeIdsParam ? excludeIdsParam.split(",") : [];
      const clientIdParam = url.searchParams.get("clientId") || "";

      if (clientIdParam) {
        this.activeListeners.set(clientIdParam, now);
      }
      for (const [cid, lastTime] of this.activeListeners.entries()) {
        if (now - lastTime > 10000) {
          this.activeListeners.delete(cid);
        }
      }

      // Check if current stage performance finished or stage not initialized
      if (!stageState || (stageState.startedAt + stageState.durationMs < now)) {
        // Kick off background pre-generator alarm if not already running
        const activeAlarm = await this.state.storage.getAlarm();
        if (activeAlarm === null) {
          await this.state.storage.setAlarm(Date.now() + 1000);
        }

        const comedians = ["NeonMike", "SpicySarah", "QuantumQuentin"];
        const comic = comedians[Math.floor(Math.random() * comedians.length)];
        let joke: any = null;

        const todayKey = `dailyGenCount_${new Date().toISOString().split("T")[0]}`;
        const dailyCount: number = (await this.state.storage.get(todayKey)) || 0;
        let lastPlayedIds: string[] = (await this.state.storage.get("lastPlayedIds")) || [];
        let lastPlayedTexts: string[] = (await this.state.storage.get("lastPlayedTexts")) || [];

        // 1. AI generation disabled to prevent RTN token burn (serving static pool only)
        if (false) {
          try {
            joke = await this.generateJokeAndTTS(comic);
            await this.state.storage.put("lastGenAt", now);
            await this.state.storage.put(todayKey, dailyCount + 1);
          } catch (e) {
            console.warn("LLM/TTS gen error, falling back to D1/R2 pool:", e);
          }
        }

        // 2. Fallback: Query D1 for least-recently-played jokes with audio in R2 (grouped by text to eliminate duplicate text entries)
        if (!joke) {
          try {
            const combinedExclusions = Array.from(new Set([...lastPlayedIds, ...clientExcludedIds])).filter(Boolean);
            let placeholders = combinedExclusions.map(() => "?").join(",");
            let sql = `SELECT MIN(id) as id, text, category, author_name FROM jokes WHERE is_ghosted = 0`;
            if (placeholders.length > 0) {
              sql += ` AND id NOT IN (${placeholders})`;
            }
            sql += ` GROUP BY LOWER(TRIM(text)) ORDER BY RANDOM() LIMIT 50`;

            const stmt = combinedExclusions.length > 0
              ? this.env.DB.prepare(sql).bind(...combinedExclusions)
              : this.env.DB.prepare(sql);
            const candidates: any = await stmt.all();

            if (candidates && candidates.results && candidates.results.length > 0) {
              for (const cand of candidates.results) {
                const normText = (cand.text || "").toLowerCase().trim();
                if (lastPlayedTexts.includes(normText)) {
                  continue; // Skip if text was played recently regardless of ID
                }

                joke = {
                  id: cand.id,
                  text: cand.text,
                  category: cand.category || "Stand-up",
                  has_audio: true,
                  author_name: cand.author_name || comic
                };
                break;
              }
            }
          } catch (dbErr) {
            console.warn("D1/R2 pool query fallback error:", dbErr);
          }

          // Emergency fallback if all items excluded: pick entry not in lastPlayedTexts
          if (!joke) {
            try {
              const fallbackCand: any = await this.env.DB.prepare(
                "SELECT MIN(id) as id, text, category, author_name FROM jokes WHERE is_ghosted = 0 GROUP BY LOWER(TRIM(text)) ORDER BY RANDOM() LIMIT 20"
              ).all();
              if (fallbackCand && fallbackCand.results && fallbackCand.results.length > 0) {
                const unplayed = fallbackCand.results.filter((c: any) => !lastPlayedTexts.includes((c.text || "").toLowerCase().trim()));
                const pick = unplayed.length > 0 ? unplayed[Math.floor(Math.random() * unplayed.length)] : fallbackCand.results[Math.floor(Math.random() * fallbackCand.results.length)];
                joke = {
                  id: pick.id,
                  text: pick.text,
                  category: pick.category || "Stand-up",
                  has_audio: true,
                  author_name: pick.author_name || comic
                };
              }
            } catch (e) {}
          }
        }

        // Expanded history window: maintain up to 200 recently played set IDs and texts to prevent repeats
        if (joke) {
          lastPlayedIds.push(joke.id);
          if (lastPlayedIds.length > 200) lastPlayedIds.shift();
          await this.state.storage.put("lastPlayedIds", lastPlayedIds);

          const normText = (joke.text || "").toLowerCase().trim();
          if (normText) {
            lastPlayedTexts.push(normText);
            if (lastPlayedTexts.length > 200) lastPlayedTexts.shift();
            await this.state.storage.put("lastPlayedTexts", lastPlayedTexts);
          }

          // Dynamic Audio Duration: compute set length based on joke word count (approx 150 words/min + 5s intro padding)
          const wordCount = (joke.text || "").split(/\s+/).length;
          const estimatedSpeechMs = Math.max(Math.ceil((wordCount / 2.5) * 1000), 12000);
          const durationMs = estimatedSpeechMs + 6000; // speech + 6s inter-set applause/MC intro

          const hostIntros = [
            `👏 Give it up for ${joke.author_name || comic}! Taking the stage now...`,
            `🔥 Up next on the Heckler Live Stage... ${joke.author_name || comic}!`,
            `🎙️ Welcome back to Heckler Radio! Here comes ${joke.author_name || comic}...`
          ];
          const chosenIntro = hostIntros[Math.floor(Math.random() * hostIntros.length)];

          stageState = {
            jokeId: joke.id,
            performer: joke.author_name || comic,
            text: joke.text,
            category: joke.category,
            hasAudio: Boolean(joke.has_audio),
            audioUrl: `/api/jokes/${joke.id}/audio`,
            startedAt: now,
            durationMs,
            listenersCount: Math.max(1, this.activeListeners.size, this.ctx.getWebSockets().length),
            reactions: { laugh: 0, clap: 0, boo: 0 },
            chatMessages: stageState?.chatMessages || []
          };
          await this.state.storage.put("stageState", stageState);

          // Fan-out update over WebSocket
          const sockets = this.ctx.getWebSockets();
          const wsPayload = JSON.stringify({ type: "stage_change", stageState });
          for (const socket of sockets) {
            try { socket.send(wsPayload); } catch(e) {}
          }
        }
      }

      if (stageState) {
        stageState.listenersCount = Math.max(1, this.activeListeners.size, this.ctx.getWebSockets().length);
      }

      return new Response(JSON.stringify(stageState), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (url.pathname.endsWith("/stage/react")) {
      try {
        const body: any = await request.json();
        let stageState: any = await this.state.storage.get("stageState");
        if (stageState) {
          const type = body.type || "laugh";
          stageState.reactions[type] = (stageState.reactions[type] || 0) + 1;
          await this.state.storage.put("stageState", stageState);

          // Atomic D1 increment
          if (type === "laugh" || type === "clap") {
            await this.env.DB.prepare("UPDATE jokes SET kills = kills + 1 WHERE id = ?").bind(stageState.jokeId).run();
          } else if (type === "boo") {
            await this.env.DB.prepare("UPDATE jokes SET bombs = bombs + 1 WHERE id = ?").bind(stageState.jokeId).run();
          }
        }
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400 });
      }
    }

    if (url.pathname.endsWith("/stage/chat")) {
      try {
        const body: any = await request.json();
        let stageState: any = await this.state.storage.get("stageState");
        if (stageState) {
          const userMsgText = body.message || "";
          const msg = {
            username: body.username || "Listener",
            message: userMsgText,
            timestamp: new Date().toLocaleTimeString()
          };
          stageState.chatMessages.push(msg);
          if (stageState.chatMessages.length > 25) stageState.chatMessages.shift();
          await this.state.storage.put("stageState", stageState);

          // Asynchronously reply as the performing AI Comedian (ComedianDO)
          const comicName = stageState.performer || "NeonMike";
          const profile = COMEDIAN_PROFILES[comicName];
          const archetypeKey = profile ? profile.archetypeKey : "deadpan_cynic";
          const archetype = ARCHETYPES[archetypeKey] || ARCHETYPES["deadpan_cynic"];

          this.ctx.waitUntil((async () => {
            try {
              const replyResp = await this.env.AI.run(
                "@cf/meta/llama-3.1-8b-instruct-fast",
                {
                  messages: [
                    { role: "system", content: `${archetype.systemPrompt}\nYou are currently performing live on stage as ${comicName}. An audience member named ${msg.username} just heckled or said: "${userMsgText}". Respond with a fast, funny, witty 1-2 sentence comeback in your comedic character. Stay in character! No emojis.` },
                    { role: "user", content: userMsgText }
                  ],
                  temperature: 0.9,
                  max_tokens: 80
                }
              );

              let comebackText = "";
              if (typeof replyResp === "string") comebackText = replyResp;
              else if (replyResp && typeof replyResp === "object") comebackText = replyResp.response || replyResp.result || "";

              comebackText = comebackText.trim();
              if (comebackText) {
                let currentStage: any = await this.state.storage.get("stageState");
                if (currentStage) {
                  currentStage.chatMessages.push({
                    username: comicName,
                    message: comebackText,
                    timestamp: new Date().toLocaleTimeString()
                  });
                  if (currentStage.chatMessages.length > 25) currentStage.chatMessages.shift();
                  await this.state.storage.put("stageState", currentStage);
                }
              }
            } catch (e) {
              console.error("Comedian chat response error:", e);
            }
          })());
        }
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400 });
      }
    }

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
    console.log("Alarm disabled to stop billable usage.");
    return;
  }

  // ── Core Generation Pipeline ─────────────────────────────────────
  async generateJokeAndTTS(username: string, customTopic?: string): Promise<any> {
    const profile = COMEDIAN_PROFILES[username];
    const archetypeKey = profile ? profile.archetypeKey : ARCHETYPE_KEYS[Math.abs(this.hashCode(username)) % ARCHETYPE_KEYS.length];
    const archetype = ARCHETYPES[archetypeKey] || ARCHETYPES["deadpan_cynic"];

    const categories = profile ? profile.categories : CATEGORIES;
    const baseCategory = customTopic || categories[Math.floor(Math.random() * categories.length)];

    const subTopics: Record<string, string[]> = {
      technology: ["smart appliances judging you", "software updates at bad times", "AI replacing ridiculous jobs", "passwords and 2FA nightmare", "Bluetooth dropping connection", "smart watches warning about heart rate"],
      relationships: ["online dating profile lies", "unwritten rules of texting back", "meeting the in-laws", "couples grocery shopping arguments", "being single in your 30s", "first dates at loud restaurants"],
      food: ["artisanal coffee shop sizes", "meal prep containers taking over fridge", "ghost kitchens and food delivery apps", "fancy restaurants with tiny portions", "diet trends that make no sense", "grocery store self-checkout machines"],
      work: ["corporate buzzwords and emails", "zoom calls with background noise", "open-plan offices", "performance reviews", "leaving work early on Friday", "slacking off on company Wi-Fi"],
      existential: ["getting old suddenly", "staring at ceiling at 3 AM", "realizing nobody knows what they are doing", "time moving faster every year", "buying things to feel fulfilled"],
      traffic: ["roundabouts nobody knows how to use", "parallel parking with witnesses", "navigation GPS recalculating", "people who don't use turn signals", "gas station pumps asking questions"],
      "social-media": ["people posting workout videos", "targeted ads knowing your thoughts", "unfollowing high school classmates", "doomscrolling at midnight", "influencer apology videos"],
      pets: ["cats staring at blank walls", "dogs barking at air", "vet bill costs", "buying expensive pet beds they ignore", "dog owners talking for their pets"],
      health: ["going to gym for first time in years", "web doctor diagnosing mild cough", "stretching and injuring yourself", "buying supplements you never take", "drinking 8 glasses of water"]
    };

    const topicList = subTopics[baseCategory] || subTopics["technology"];
    const specificPremise = topicList[Math.floor(Math.random() * topicList.length)];

    // ── 1. Generate joke text via Llama 3.1 ──────────────────────
    const userPrompt = `You are ${username}, a standup comedian performing live in a comedy club.
Style: ${archetype.name}
Category: ${baseCategory}
Specific Premise: ${specificPremise}

[RULES]
1. NEVER write puns. Puns bomb every time.
2. NEVER use cliché openings like "Have you ever noticed...", "So I was thinking...", "Why do they call it...", "What's the deal with...".
3. Write a BRAND NEW, completely original 2 to 4 sentence standup routine about ${specificPremise}.
4. The joke MUST have a clear SETUP (relatable premise) and PUNCHLINE (unforeseen misdirection).
5. Insert [PAUSE:1.0] or [PAUSE:1.5] tags right before the punchline lands.
6. Output ONLY the raw joke text with embedded [PAUSE] tags. Nothing else.`;

    const aiResponse = await this.env.AI.run(
      "@cf/meta/llama-3.1-8b-instruct-fast",
      {
        messages: [
          { role: "system", content: archetype.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.85 + Math.random() * 0.13,
        max_tokens: 220
      }
    );

    let rawJokeText = "";
    if (typeof aiResponse === "string") {
      rawJokeText = aiResponse;
    } else if (aiResponse && typeof aiResponse === "object") {
      rawJokeText = aiResponse.response || aiResponse.result || aiResponse.content || "";
    }

    const fallbackJokes = [
      "My smart fridge sent me a weekly screen time report. [PAUSE:1.5] Apparently, I spent 12 hours looking at cheese.",
      "I tried using facial recognition to log into my bank. [PAUSE:1.2] It told me 'Account locked due to severe morning face.'",
      "My doctor told me I need to lower my stress levels. [PAUSE:1.5] So I uninstalled my work email and threw my router in the ocean.",
      "I asked AI to write my wedding vows. [PAUSE:1.5] It suggested 'As an AI language model, I promise to hallucinate a future together.'",
      "Parallel parking in front of a outdoor patio crowd is the ultimate test of human dignity. [PAUSE:1.5] I failed so hard the waiter brought me a pity dessert.",
      "My smartwatch told me to stand up for 1 minute every hour. [PAUSE:1.2] So I stood up, walked to the pantry, and ate three cookies."
    ];
    const jokeText = rawJokeText.trim() || fallbackJokes[Math.floor(Math.random() * fallbackJokes.length)];
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
        // Attempt 1: Deepgram Aura-2 English (Higher Quality, 40+ Voices)
        try {
          const ttsResponse = await this.env.AI.run(
            "@cf/deepgram/aura-2-en",
            { text: cleanText, speaker },
            { returnRawResponse: true }
          );
          if (ttsResponse.ok) {
            const buf = await ttsResponse.arrayBuffer();
            if (buf.byteLength > 500) {
              audioBuffer = buf;
            }
          }
        } catch (auraErr) {
          console.warn("Aura-1 TTS failed, trying MeloTTS:", auraErr);
        }

        // Attempt 2: MeloTTS fallback
        if (!audioBuffer) {
          try {
            const meloResp: any = await this.env.AI.run(
              "@cf/myshell-ai/melotts",
              { prompt: cleanText, lang: "en" }
            );
            if (meloResp && meloResp.audio) {
              const binary = atob(meloResp.audio);
              const bytes = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              audioBuffer = bytes.buffer;
            }
          } catch (meloErr) {
            console.error("MeloTTS fallback failed:", meloErr);
          }
        }
      }
    } catch (e) {
      console.error("TTS synthesis pipeline error:", e);
    }

    // ── 4. Persist Audio to R2 Bucket & Metadata to D1 ─────────────
    if (audioBuffer && this.env.AUDIO_BUCKET) {
      try {
        await this.env.AUDIO_BUCKET.put(`audio/${jokeId}.mp3`, audioBuffer, {
          httpMetadata: { contentType: "audio/mpeg" }
        });
      } catch (r2Err) {
        console.error("Failed to upload audio to R2 bucket:", r2Err);
      }
    }

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
        baseCategory,
        username,
        audioBuffer,
        JSON.stringify(segmentMeta)
      )
      .run();

    return {
      id: jokeId,
      text: jokeText,
      category: baseCategory,
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

  private hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return hash;
  }

  private pickSpeaker(username: string): string {
    const key = Object.keys(COMEDIAN_PROFILES).find(
      (k) => k.toLowerCase() === username.toLowerCase()
    );
    if (key && COMEDIAN_PROFILES[key]) {
      return COMEDIAN_PROFILES[key].speaker;
    }
    if (username.toLowerCase().includes("sarah")) return "asteria";
    return VALID_SPEAKERS[Math.abs(this.hashCode(username)) % VALID_SPEAKERS.length];
  }

  // ── Durable Object WebSocket Hibernation Life-Cycle ─────────────────
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (data.type === "react") {
        let stageState: any = await this.state.storage.get("stageState");
        if (stageState) {
          const reactionType = data.reaction || "laugh";
          stageState.reactions[reactionType] = (stageState.reactions[reactionType] || 0) + 1;
          await this.state.storage.put("stageState", stageState);
        }
      }
      
      // Fan out real-time broadcast event to all connected WebSockets in venue
      const sockets = this.ctx.getWebSockets();
      const broadcastMsg = typeof message === "string" ? message : new TextDecoder().decode(message);
      for (const socket of sockets) {
        try { socket.send(broadcastMsg); } catch(e) {}
      }
    } catch (e) {}
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
    ws.close(code, "Closed by server");
  }
}

