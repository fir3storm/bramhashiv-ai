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

  const base = {
    schema_version: 1,
    learned_adjustments: [] as never[],
    task_history: [] as never[],
    regeneration_records: [] as never[],
    provider_health: [] as never[],
  } as const;

  test("writes and reads state round-trip", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    await writeSharedState(path, {
      pinned_model_id: "google/gemini-flash",
      last_label: "gemini (speed)",
      last_classifier: null,
      unavailable: [],
      ...base,
    });
    const state = await readSharedState(path);
    expect(state.pinned_model_id).toBe("google/gemini-flash");
    expect(state.last_label).toBe("gemini (speed)");
    expect(state.unavailable).toEqual([]);
  });

  test("fills missing fields with defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    await writeSharedState(path, { pinned_model_id: "x", last_label: null, last_classifier: null, unavailable: [], ...base });
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
      ...base,
    });
    const state = await readSharedState(path);
    expect(state.unavailable.map((u) => u.id).sort()).toEqual([
      "huggingface/Qwen/Qwen3-Coder-Next",
      "huggingface/moonshotai/Kimi-K2.6",
    ]);
  });

  test("prunes expired unavailable marks", () => {
    const now = Date.now();
    const marks = [
      { id: "a", expiresAt: now - 1000 },
      { id: "b", expiresAt: now + 1000 },
      { id: "c", expiresAt: now - 500 },
    ];
    const pruned = pruneUnavailable(marks, now);
    expect(pruned.map((m) => m.id)).toEqual(["b"]);
  });
});
