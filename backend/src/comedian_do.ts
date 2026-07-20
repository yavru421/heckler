import { DurableObject } from "cloudflare:workers";
import { Env } from "./index";

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

    const username = (await this.state.storage.get<string>("username")) || "AI_Comic";

    if (url.pathname.endsWith("/trigger")) {
      // Trigger a joke manually
      const joke = await this.generateJokeAndTTS(username);
      return new Response(JSON.stringify({ success: true, joke }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname.endsWith("/schedule")) {
      // Schedule an alarm
      const currentAlarm = await this.state.storage.getAlarm();
      if (currentAlarm === null) {
        // Run in 10 seconds for initial demo, then reschedule every 2 hours
        await this.state.storage.setAlarm(Date.now() + 10000);
      }
      return new Response(JSON.stringify({ success: true, alarmSet: true, currentAlarm }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ active: true, username }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  async alarm() {
    const username = (await this.state.storage.get<string>("username")) || "AI_Comic";
    try {
      await this.generateJokeAndTTS(username);
    } catch (e) {
      console.error("Alarm error in ComedianDO:", e);
    }
    // Reschedule alarm in 2 hours
    await this.state.storage.setAlarm(Date.now() + 2 * 60 * 60 * 1000);
  }

  async generateJokeAndTTS(username: string): Promise<any> {
    // 1. Generate text using LLM via AI binding
    const prompt = `You are a professional standup comedian named ${username}.
Deliver a short, single, funny standup joke on a random topic (like technology, coffee, relationships, or traffic).
Format the joke with a single [PAUSE] tag where you would pause for laughter.
Do NOT include any introduction, greetings, stage directions, or metadata. Output ONLY the joke text itself.`;

    const aiResponse = await this.env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        {
          role: "system",
          content: "You are a standup comedian. Deliver only the joke text without any conversational filler."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const jokeText = aiResponse.response || "My smart fridge just sent me a weekly screen time report. [PAUSE] Apparently, I spent 12 hours looking at cheese.";
    const jokeId = crypto.randomUUID();

    // 2. Synthesize speech via Deepgram Aura-1
    let audioBuffer: ArrayBuffer | null = null;
    try {
      const speakers = ["angus", "asteria", "arcas", "orion", "orpheus", "athena", "luna", "zeus", "perseus", "helios", "hera", "stella"];
      let hash = 0;
      for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
      }
      const speaker = speakers[Math.abs(hash) % speakers.length];

      const cleanText = jokeText
        .replace(/\[PAUSE\]/gi, " ")
        .replace(/[#*$_[\](){}]/g, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const ttsResponse = await this.env.AI.run("@cf/deepgram/aura-1", {
        text: cleanText,
        speaker: speaker
      });
      audioBuffer = await ttsResponse.arrayBuffer();
    } catch (e) {
      console.error("Deepgram Aura-1 synthesis failed:", e);
    }

    // 3. Lazy insert comedian profile if it does not exist in D1
    await this.env.DB.prepare(
      "INSERT OR IGNORE INTO comedians (username, bio) VALUES (?, ?)"
    ).bind(username, `An autonomous standup comedian powered by Durable Objects.`).run();

    // 4. Save joke to D1 jokes table
    await this.env.DB.prepare(
      "INSERT INTO jokes (id, text, category, author_name, audio_data) VALUES (?, ?, ?, ?, ?)"
    ).bind(jokeId, jokeText, "observational", username, audioBuffer).run();

    return { id: jokeId, text: jokeText, has_audio: audioBuffer ? true : false };
  }
}
