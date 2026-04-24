import { describe, test, expect } from "bun:test";
import { createTelemetryLogger } from "../src/telemetry.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("telemetry", () => {
  test("writes a JSONL line per event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-tel-"));
    const path = join(dir, "overrides.log");
    const logger = createTelemetryLogger(path);

    await logger.logOverride({
      timestamp: "2026-04-23T12:00:00Z",
      task_excerpt: "refactor foo",
      routed_to: "anthropic/claude-opus-4-7",
      user_picked: "google/gemini-flash",
      top_traits: ["long_context", "deep_reasoning"],
    });
    await logger.flush();

    const contents = readFileSync(path, "utf8").trim().split("\n");
    expect(contents).toHaveLength(1);
    const parsed = JSON.parse(contents[0]!);
    expect(parsed.routed_to).toBe("anthropic/claude-opus-4-7");
    expect(parsed.user_picked).toBe("google/gemini-flash");
  });

  test("appends across calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-tel-"));
    const path = join(dir, "overrides.log");
    const logger = createTelemetryLogger(path);
    await logger.logOverride({ timestamp: "t1", task_excerpt: "a", routed_to: "x", user_picked: "y", top_traits: [] });
    await logger.logOverride({ timestamp: "t2", task_excerpt: "b", routed_to: "x", user_picked: "z", top_traits: [] });
    await logger.flush();
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
  });
});
