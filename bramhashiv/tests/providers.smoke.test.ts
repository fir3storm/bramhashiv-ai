import { describe, test, expect } from "bun:test";
import { geminiFlashRunner } from "../src/gemini-runner.js";

// Gated behind env vars so unit tests keep running without real auth.
const shouldRun = process.env.BRAMHASHIV_SMOKE === "1";

describe.if(shouldRun)("provider smoke tests (requires real auth)", () => {
  test("Gemini Flash responds to a classification prompt", async () => {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.GEMINI_API_KEY ??
      "";
    if (!apiKey) throw new Error("set GOOGLE_GENERATIVE_AI_API_KEY for smoke tests");
    const runner = geminiFlashRunner({ apiKey });
    const out = await runner({
      systemPrompt: "Reply with the single word OK, nothing else.",
      userPrompt: "ping",
    });
    expect(out.length).toBeGreaterThan(0);
  });

  // Claude / HF smoke tests would go here once the plugin pulls auth from
  // OpenCode's native provider layer (v1.1). For v1 the only classifier
  // dependency that matters is Gemini Flash.
});
