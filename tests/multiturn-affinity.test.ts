import { describe, test, expect } from "bun:test";
import { computeAffinityBonus, updateAffinity, traitDrift } from "../src/multiturn-affinity.js";
import type { TraitWeights, ConversationAffinity } from "../src/types.js";

function baseWeights(overrides: Partial<TraitWeights> = {}): TraitWeights {
  return {
    long_context: 0.3,
    deep_reasoning: 0.5,
    tool_use_accuracy: 0.5,
    speed_priority: 0.5,
    frontend_taste: 0.3,
    cost_efficiency: 0.5,
    ...overrides,
  };
}

describe("multiturn-affinity", () => {
  describe("traitDrift", () => {
    test("returns 0 for identical weights", () => {
      const w = baseWeights();
      expect(traitDrift(w, w)).toBeCloseTo(0, 2);
    });

    test("returns near 1 for orthogonal weights", () => {
      const a = baseWeights({ deep_reasoning: 1, speed_priority: 0, long_context: 0, tool_use_accuracy: 0, frontend_taste: 0, cost_efficiency: 0 });
      const b = baseWeights({ deep_reasoning: 0, speed_priority: 0, long_context: 0, tool_use_accuracy: 0, frontend_taste: 1, cost_efficiency: 0 });
      expect(traitDrift(a, b)).toBeGreaterThan(0.8);
    });

    test("returns small value for similar weights", () => {
      const a = baseWeights({ deep_reasoning: 0.5 });
      const b = baseWeights({ deep_reasoning: 0.55 });
      expect(traitDrift(a, b)).toBeLessThan(0.1);
    });
  });

  describe("computeAffinityBonus", () => {
    test("returns 0 when no affinity exists", () => {
      expect(computeAffinityBonus(null, baseWeights())).toBe(0);
    });

    test("returns bonus when same model and low drift", () => {
      const weights = baseWeights();
      const affinity: ConversationAffinity = {
        model_id: "test",
        turn_count: 2,
        last_weights: weights,
        affinity_bonus: 0.08,
      };
      expect(computeAffinityBonus(affinity, weights)).toBe(0.08);
    });

    test("returns 0 when turn count exceeds max", () => {
      const affinity: ConversationAffinity = {
        model_id: "test",
        turn_count: 15,
        last_weights: baseWeights(),
        affinity_bonus: 0.08,
      };
      expect(computeAffinityBonus(affinity, baseWeights())).toBe(0);
    });

    test("returns 0 when trait drift exceeds threshold", () => {
      const affinity: ConversationAffinity = {
        model_id: "test",
        turn_count: 2,
        last_weights: baseWeights({ deep_reasoning: 1, speed_priority: 0, long_context: 0, tool_use_accuracy: 0, frontend_taste: 0, cost_efficiency: 0 }),
        affinity_bonus: 0.08,
      };
      const shifted = baseWeights({ deep_reasoning: 0, speed_priority: 0, long_context: 0, tool_use_accuracy: 0, frontend_taste: 1, cost_efficiency: 0 });
      expect(computeAffinityBonus(affinity, shifted)).toBe(0);
    });
  });

  describe("updateAffinity", () => {
    test("creates new affinity when none exists", () => {
      const affinity = updateAffinity(null, "model-a", baseWeights());
      expect(affinity.model_id).toBe("model-a");
      expect(affinity.turn_count).toBe(1);
      expect(affinity.affinity_bonus).toBeGreaterThan(0);
    });

    test("increments turn count for same model", () => {
      const initial = updateAffinity(null, "model-a", baseWeights());
      const updated = updateAffinity(initial, "model-a", baseWeights());
      expect(updated.turn_count).toBe(2);
    });

    test("decays affinity bonus each turn", () => {
      const initial = updateAffinity(null, "model-a", baseWeights());
      const updated = updateAffinity(initial, "model-a", baseWeights());
      expect(updated.affinity_bonus).toBeLessThan(initial.affinity_bonus);
    });

    test("resets affinity when model changes", () => {
      const initial = updateAffinity(null, "model-a", baseWeights());
      const initialAfterSecond = updateAffinity(initial, "model-a", baseWeights());
      const switched = updateAffinity(initialAfterSecond, "model-b", baseWeights());
      expect(switched.model_id).toBe("model-b");
      expect(switched.turn_count).toBe(1);
    });
  });
});
