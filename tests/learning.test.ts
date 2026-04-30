import { describe, test, expect } from "bun:test";
import {
  recordTaskOutcome,
  updateAdjustments,
  getAdjustmentScore,
  getTopPerformingModels,
} from "../src/learning.js";
import type { ScoreAdjustment, TaskOutcome, TraitName } from "../src/types.js";
import { TRAIT_NAMES } from "../src/types.js";

function outcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    task_excerpt: "fix a bug",
    model_id: "claude-sonnet",
    success: true,
    latency_ms: 2000,
    regeneration_count: 0,
    diff_size: 50,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("learning", () => {
  describe("recordTaskOutcome", () => {
    test("adds outcome to front of history", () => {
      const o1 = outcome({ timestamp: "2024-01-01" });
      const o2 = outcome({ timestamp: "2024-01-02" });
      const history = recordTaskOutcome([o1], o2);
      expect(history).toHaveLength(2);
      expect(history[0]!.timestamp).toBe("2024-01-02");
      expect(history[1]!.timestamp).toBe("2024-01-01");
    });

    test("caps history at 200", () => {
      let history: TaskOutcome[] = [];
      for (let i = 0; i < 250; i++) {
        history = recordTaskOutcome(history, outcome({ task_excerpt: `task ${i}` }));
      }
      expect(history.length).toBeLessThanOrEqual(200);
    });

    test("empty history is handled", () => {
      const history = recordTaskOutcome([], outcome());
      expect(history).toHaveLength(1);
    });
  });

  describe("updateAdjustments", () => {
    test("empty adjustments with successful outcome creates new entries", () => {
      const result = updateAdjustments([], outcome({ success: true, latency_ms: 2000 }));
      expect(result.length).toBeGreaterThan(0);
      // Fast success should boost speed_priority
      const speedAdj = result.find((a) => a.trait === "speed_priority");
      expect(speedAdj).toBeDefined();
      expect(speedAdj!.delta).toBeGreaterThan(0);
    });

    test("slow success gives smaller speed boost", () => {
      const fasts = updateAdjustments([], outcome({ success: true, latency_ms: 2000 }));
      const slow = updateAdjustments([], outcome({ success: true, latency_ms: 10000 }));
      const fastSpeed = fasts.find((a) => a.trait === "speed_priority");
      const slowSpeed = slow.find((a) => a.trait === "speed_priority");
      expect(fastSpeed!.delta).toBeGreaterThan(slowSpeed!.delta);
    });

    test("failed outcome penalizes tool_use_accuracy and deep_reasoning", () => {
      const result = updateAdjustments([], outcome({ success: false }));
      const toolAdj = result.find((a) => a.trait === "tool_use_accuracy");
      const reasonAdj = result.find((a) => a.trait === "deep_reasoning");
      expect(toolAdj!.delta).toBeLessThan(0);
      expect(reasonAdj!.delta).toBeLessThan(0);
    });

    test("regenerations amplify penalties", () => {
      const base = updateAdjustments([], outcome({ success: false, regeneration_count: 3 }));
      const toolAdj = base.find((a) => a.trait === "tool_use_accuracy");
      // Should be more negative than simple failure
      expect(toolAdj!.delta).toBeLessThan(-0.003);
    });

    test("large diffs boost long_context", () => {
      const result = updateAdjustments([], outcome({ diff_size: 500 }));
      const ctxAdj = result.find((a) => a.trait === "long_context");
      expect(ctxAdj).toBeDefined();
      expect(ctxAdj!.delta).toBeGreaterThan(0);
    });

    test("small diffs do not boost long_context", () => {
      const result = updateAdjustments([], outcome({ diff_size: 50 }));
      const ctxAdj = result.find((a) => a.trait === "long_context");
      expect(ctxAdj).toBeUndefined();
    });

    test("accumulates deltas across multiple outcomes", () => {
      let adjustments: ScoreAdjustment[] = [];
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1500 }));
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 2000 }));
      adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 1000 }));
      const speedAdj = adjustments.find((a) => a.trait === "speed_priority");
      expect(speedAdj).toBeDefined();
      // After 3 fast successes, should have positive delta
      expect(speedAdj!.delta).toBeGreaterThan(0);
    });

    test("decays existing adjustments over time", () => {
      let adjustments: ScoreAdjustment[] = [
        { model_id: "claude-sonnet", trait: "speed_priority" as TraitName, delta: 0.5 },
      ];
      // Call with unrelated model — existing adjustments should decay
      adjustments = updateAdjustments(adjustments, outcome({ model_id: "gpt", success: true, latency_ms: 5000 }));
      const decayed = adjustments.find((a) => a.trait === "speed_priority" && a.model_id === "claude-sonnet");
      expect(decayed).toBeDefined();
      expect(decayed!.delta).toBeLessThan(0.5);
    });

    test("deltas are capped at ±2.0", () => {
      let adjustments: ScoreAdjustment[] = [];
      for (let i = 0; i < 200; i++) {
        adjustments = updateAdjustments(adjustments, outcome({ success: true, latency_ms: 500 }));
      }
      for (const adj of adjustments) {
        expect(Math.abs(adj.delta)).toBeLessThanOrEqual(2.0);
      }
    });

    test("different models get separate adjustments", () => {
      let adjustments: ScoreAdjustment[] = [];
      adjustments = updateAdjustments(adjustments, outcome({ model_id: "claude", success: true, latency_ms: 2000 }));
      adjustments = updateAdjustments(adjustments, outcome({ model_id: "gpt", success: false }));
      const claudeEntries = adjustments.filter((a) => a.model_id === "claude");
      const gptEntries = adjustments.filter((a) => a.model_id === "gpt");
      expect(claudeEntries.length).toBeGreaterThan(0);
      expect(gptEntries.length).toBeGreaterThan(0);
    });
  });

  describe("getAdjustmentScore", () => {
    test("returns 0 when no adjustments exist", () => {
      expect(getAdjustmentScore([], "claude", "speed_priority")).toBe(0);
    });

    test("returns matching delta for model + trait", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "claude", trait: "speed_priority" as TraitName, delta: 0.15 },
      ];
      expect(getAdjustmentScore(adj, "claude", "speed_priority")).toBe(0.15);
    });

    test("returns 0 for non-matching trait", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "claude", trait: "speed_priority" as TraitName, delta: 0.15 },
      ];
      expect(getAdjustmentScore(adj, "claude", "deep_reasoning")).toBe(0);
    });

    test("returns 0 for non-matching model", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "claude", trait: "speed_priority" as TraitName, delta: 0.15 },
      ];
      expect(getAdjustmentScore(adj, "gpt", "speed_priority")).toBe(0);
    });
  });

  describe("getTopPerformingModels", () => {
    test("returns top models for a trait by cumulative delta", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "a", trait: "speed_priority" as TraitName, delta: 0.5 },
        { model_id: "b", trait: "speed_priority" as TraitName, delta: 0.3 },
        { model_id: "c", trait: "speed_priority" as TraitName, delta: 0.7 },
        { model_id: "d", trait: "speed_priority" as TraitName, delta: 0.1 },
      ];
      const top = getTopPerformingModels(adj, "speed_priority", 2);
      expect(top).toEqual(["c", "a"]);
    });

    test("returns empty array for trait with no adjustments", () => {
      expect(getTopPerformingModels([], "speed_priority")).toEqual([]);
    });

    test("handles model with multiple entries per trait", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "a", trait: "speed_priority" as TraitName, delta: 0.5 },
        { model_id: "a", trait: "speed_priority" as TraitName, delta: 0.3 },
        { model_id: "b", trait: "speed_priority" as TraitName, delta: 0.1 },
      ];
      const top = getTopPerformingModels(adj, "speed_priority", 1);
      expect(top).toEqual(["a"]);
    });

    test("ignores non-matching traits", () => {
      const adj: ScoreAdjustment[] = [
        { model_id: "a", trait: "speed_priority" as TraitName, delta: 0.5 },
        { model_id: "a", trait: "deep_reasoning" as TraitName, delta: 0.3 },
      ];
      const top = getTopPerformingModels(adj, "speed_priority");
      expect(top).toEqual(["a"]);
    });
  });
});
