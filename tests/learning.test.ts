import { describe, test, expect } from "bun:test";
import { recordTaskOutcome, updateAdjustments, getAdjustmentScore, getTopPerformingModels } from "../src/learning.js";
import type { ScoreAdjustment, TaskOutcome, TraitName } from "../src/types.js";

function outcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    task_excerpt: "test task",
    model_id: "claude-sonnet",
    success: true,
    latency_ms: 2000,
    regeneration_count: 0,
    diff_size: 0,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("learning", () => {
  describe("recordTaskOutcome", () => {
    test("adds outcome to front of history", () => {
      const o = outcome();
      const history = recordTaskOutcome([], o);
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(o);
    });

    test("caps history at 200", () => {
      const history = Array.from({ length: 250 }, () => outcome());
      const result = recordTaskOutcome(history, outcome());
      expect(result).toHaveLength(200);
    });

    test("empty history is handled", () => {
      const o = outcome();
      const history = recordTaskOutcome([], o);
      expect(history[0]).toEqual(o);
    });
  });

  describe("updateAdjustments", () => {
    test("empty adjustments with successful outcome creates new entries", () => {
      const adjustments: ScoreAdjustment[] = [];
      const result = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      expect(result.length).toBeGreaterThan(0);
      const speedAdj = result.find((a) => a.trait === "speed_priority");
      expect(speedAdj).toBeDefined();
      expect(speedAdj!.delta).toBeGreaterThan(0);
    });

    test("slow success gives smaller speed boost", () => {
      const adjustments: ScoreAdjustment[] = [];
      const fast = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      const slow = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 10000 }));
      const fastSpeed = fast.find((a) => a.trait === "speed_priority");
      const slowSpeed = slow.find((a) => a.trait === "speed_priority");
      expect(fastSpeed).toBeDefined();
      expect(slowSpeed).toBeDefined();
      expect(fastSpeed!.delta).toBeGreaterThan(slowSpeed!.delta);
    });

    test("failed outcome penalizes tool_use_accuracy and deep_reasoning", () => {
      const adjustments: ScoreAdjustment[] = [];
      const result = updateAdjustments(adjustments, outcome({ success: false }));
      const toolAdj = result.find((a) => a.trait === "tool_use_accuracy");
      const reasonAdj = result.find((a) => a.trait === "deep_reasoning");
      expect(toolAdj).toBeDefined();
      expect(reasonAdj).toBeDefined();
      expect(toolAdj!.delta).toBeLessThan(0);
      expect(reasonAdj!.delta).toBeLessThan(0);
    });

    test("regenerations amplify penalties", () => {
      const adjustments: ScoreAdjustment[] = [];
      const noRegen = updateAdjustments(adjustments, outcome({ success: false, regeneration_count: 0 }));
      const withRegen = updateAdjustments(adjustments, outcome({ success: false, regeneration_count: 3 }));
      const noRegenTool = noRegen.find((a) => a.trait === "tool_use_accuracy");
      const withRegenTool = withRegen.find((a) => a.trait === "tool_use_accuracy");
      expect(noRegenTool).toBeDefined();
      expect(withRegenTool).toBeDefined();
      expect(withRegenTool!.delta).toBeLessThan(noRegenTool!.delta);
    });

    test("large diffs boost long_context", () => {
      const adjustments: ScoreAdjustment[] = [];
      const result = updateAdjustments(adjustments, outcome({ diff_size: 500 }));
      const longCtx = result.find((a) => a.trait === "long_context");
      expect(longCtx).toBeDefined();
      expect(longCtx!.delta).toBeGreaterThan(0);
    });

    test("small diffs do not boost long_context", () => {
      const adjustments: ScoreAdjustment[] = [];
      const result = updateAdjustments(adjustments, outcome({ diff_size: 100 }));
      const longCtx = result.find((a) => a.trait === "long_context");
      expect(longCtx?.delta ?? 0).toBe(0);
    });

    test("accumulates deltas across multiple outcomes", () => {
      let adjustments: ScoreAdjustment[] = [];
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      const speedAdj = adjustments.find((a) => a.trait === "speed_priority");
      expect(speedAdj).toBeDefined();
      // After 3 fast successes, should have positive delta
      expect(speedAdj!.delta).toBeGreaterThan(0);
    });

    test("preserves adjustment when no time has passed (time-based decay)", () => {
      let adjustments: ScoreAdjustment[] = [
        { model_id: "claude-sonnet", trait: "speed_priority" as TraitName, delta: 0.5, last_updated: Date.now() },
      ];
      // Call with unrelated model — existing adjustments should NOT decay immediately
      // since time-based decay uses age in days; 0 days → no decay
      adjustments = updateAdjustments(adjustments, outcome({ model_id: "gpt", success: true, latency_ms: 5000 }));
      const decayed = adjustments.find((a) => a.trait === "speed_priority" && a.model_id === "claude-sonnet");
      expect(decayed).toBeDefined();
      expect(decayed!.delta).toBe(0.5);
    });

    test("deltas are capped at ±2.0", () => {
      let adjustments: ScoreAdjustment[] = [];
      for (let i = 0; i < 200; i++) {
        adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 500 }));
      }
      const speedAdj = adjustments.find((a) => a.trait === "speed_priority");
      expect(speedAdj).toBeDefined();
      expect(Math.abs(speedAdj!.delta)).toBeLessThanOrEqual(2.0);
    });

    test("different models get separate adjustments", () => {
      const adjustments: ScoreAdjustment[] = [];
      const result = updateAdjustments(adjustments, { ...outcome(), model_id: "model-a" });
      const result2 = updateAdjustments(result, { ...outcome(), model_id: "model-b" });
      const aModels = result2.filter((a) => a.model_id === "model-a");
      const bModels = result2.filter((a) => a.model_id === "model-b");
      expect(aModels.length).toBeGreaterThan(0);
      expect(bModels.length).toBeGreaterThan(0);
    });
  });

  describe("getAdjustmentScore", () => {
    test("returns 0 when no adjustments exist", () => {
      expect(getAdjustmentScore([], "any", "speed_priority")).toBe(0);
    });

    test("returns matching delta for model + trait", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "gpt-4", trait: "speed_priority", delta: 0.3 },
      ];
      expect(getAdjustmentScore(adjustments, "gpt-4", "speed_priority")).toBe(0.3);
    });

    test("returns 0 for non-matching trait", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "gpt-4", trait: "speed_priority", delta: 0.3 },
      ];
      expect(getAdjustmentScore(adjustments, "gpt-4", "long_context")).toBe(0);
    });

    test("returns 0 for non-matching model", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "gpt-4", trait: "speed_priority", delta: 0.3 },
      ];
      expect(getAdjustmentScore(adjustments, "claude", "speed_priority")).toBe(0);
    });
  });

  describe("getTopPerformingModels", () => {
    test("returns top models for a trait by cumulative delta", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "a", trait: "speed_priority", delta: 0.1 },
        { model_id: "b", trait: "speed_priority", delta: 0.3 },
        { model_id: "c", trait: "speed_priority", delta: 0.2 },
      ];
      const top = getTopPerformingModels(adjustments, "speed_priority", 2);
      expect(top).toEqual(["b", "c"]);
    });

    test("returns empty array for trait with no adjustments", () => {
      expect(getTopPerformingModels([], "speed_priority")).toEqual([]);
    });

    test("handles model with multiple entries per trait", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "a", trait: "speed_priority", delta: 0.1 },
        { model_id: "a", trait: "speed_priority", delta: 0.3 },
      ];
      const top = getTopPerformingModels(adjustments, "speed_priority");
      expect(top).toEqual(["a"]);
    });

    test("ignores non-matching traits", () => {
      const adjustments: ScoreAdjustment[] = [
        { model_id: "a", trait: "long_context", delta: 0.5 },
        { model_id: "b", trait: "speed_priority", delta: 0.1 },
      ];
      const top = getTopPerformingModels(adjustments, "speed_priority");
      expect(top).toEqual(["b"]);
    });
  });
});