import { describe, test, expect } from "bun:test";
import { readSharedState, writeSharedState, pruneUnavailable, EMPTY_STATE } from "../src/shared-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("shared-state", () => {
  test("reads empty state when file missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const state = await readSharedState(join(dir, "state.json"));
    expect(state).toEqual(EMPTY_STATE);
  });

  test("writes and reads state round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    await writeSharedState(path, {
      pinned_model_id: "google/gemini-flash",
      last_label: "gemini (speed)",
      last_classifier: null,
      unavailable: [],
    });
    const state = await readSharedState(path);
    expect(state.pinned_model_id).toBe("google/gemini-flash");
    expect(state.last_label).toBe("gemini (speed)");
    expect(state.unavailable).toEqual([]);
  });

  test("fills missing fields with defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    await writeSharedState(path, { pinned_model_id: "x", last_label: null, last_classifier: null, unavailable: [] });
    const state = await readSharedState(path);
    expect(state.last_classifier).toBeNull();
    expect(state.unavailable).toEqual([]);
  });

  test("preserves unavailable marks across round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    const future = Date.now() + 60_000;
    await writeSharedState(path, {
      pinned_model_id: null,
      last_label: null,
      last_classifier: null,
      unavailable: [
        { id: "huggingface/moonshotai/Kimi-K2.6", expiresAt: future },
        { id: "huggingface/Qwen/Qwen3-Coder-Next", expiresAt: future },
      ],
    });
    const state = await readSharedState(path);
    expect(state.unavailable).toHaveLength(2);
    expect(state.unavailable[0]!.id).toBe("huggingface/moonshotai/Kimi-K2.6");
  });

  test("backward-compat: state.json from older versions without `unavailable` field", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    // Simulate an older state.json that predates v0.1.5.
    await Bun.write(path, JSON.stringify({ pinned_model_id: "x", last_label: null, last_classifier: null }));
    const state = await readSharedState(path);
    expect(state.unavailable).toEqual([]);
  });
});

describe("pruneUnavailable", () => {
  test("drops expired entries", () => {
    const now = Date.now();
    const marks = [
      { id: "fresh", expiresAt: now + 60_000 },
      { id: "expired", expiresAt: now - 1000 },
      { id: "also-fresh", expiresAt: now + 1 },
    ];
    expect(pruneUnavailable(marks, now).map((m) => m.id)).toEqual(["fresh", "also-fresh"]);
  });

  test("returns all entries when none have expired", () => {
    const now = Date.now();
    const marks = [
      { id: "a", expiresAt: now + 60_000 },
      { id: "b", expiresAt: now + 60_000 },
    ];
    expect(pruneUnavailable(marks, now)).toHaveLength(2);
  });

  test("returns empty when all expired", () => {
    const now = Date.now();
    const marks = [
      { id: "a", expiresAt: now - 1 },
      { id: "b", expiresAt: now - 1000 },
    ];
    expect(pruneUnavailable(marks, now)).toEqual([]);
  });
});
