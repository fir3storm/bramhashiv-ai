import { describe, test, expect } from "bun:test";
import { readSharedState, writeSharedState, EMPTY_STATE } from "../src/shared-state.js";
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
    });
    const state = await readSharedState(path);
    expect(state.pinned_model_id).toBe("google/gemini-flash");
    expect(state.last_label).toBe("gemini (speed)");
  });

  test("fills missing fields with defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-state-"));
    const path = join(dir, "state.json");
    await writeSharedState(path, { pinned_model_id: "x", last_label: null, last_classifier: null });
    const state = await readSharedState(path);
    expect(state.last_classifier).toBeNull();
  });
});
