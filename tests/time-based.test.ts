import { describe, test, expect } from "bun:test";
import { isNightMode, applyTimeBasedWeights } from "../src/time-based.js";
import type { TraitWeights } from "../src/types.js";

describe("time-based", () => {
  describe("isNightMode", () => {
    test("returns boolean", () => {
      const result = isNightMode();
      expect(typeof result).toBe("boolean");
    });

    test("returns consistent result across calls", () => {
      const a = isNightMode();
      const b = isNightMode();
      expect(a).toBe(b);
    });
  });

  describe("applyTimeBasedWeights", () => {
    const baseWeights: TraitWeights = {
      long_context: 0.3,
      deep_reasoning: 0.5,
      tool_use_accuracy: 0.4,
      speed_priority: 0.1,
      frontend_taste: 0.2,
      cost_efficiency: 0.3,
    };

    test("returns same weights when not night mode (verifiable structure)", () => {
      // We can't control the clock in unit tests easily, but verify the structure
      const result = applyTimeBasedWeights(baseWeights);
      expect(result.long_context).toBeDefined();
      expect(result.deep_reasoning).toBeDefined();
      expect(result.tool_use_accuracy).toBeDefined();
      expect(result.speed_priority).toBeDefined();
      expect(result.frontend_taste).toBeDefined();
      expect(result.cost_efficiency).toBeDefined();
      // All weights should be within valid range
      for (const [trait, value] of Object.entries(result)) {
        expect(value).toBeWithin(0, 1);
      }
    });

    test("boosts cost_efficiency and speed_priority if night mode is active", () => {
      const result = applyTimeBasedWeights(baseWeights);
      // If night mode is active, cost_efficiency and speed_priority get boosted
      if (isNightMode()) {
        expect(result.cost_efficiency).toBeGreaterThan(baseWeights.cost_efficiency);
        expect(result.speed_priority).toBeGreaterThan(baseWeights.speed_priority);
      } else {
        expect(result.cost_efficiency).toBe(baseWeights.cost_efficiency);
        expect(result.speed_priority).toBe(baseWeights.speed_priority);
      }
    });

    test("does not modify non-boost traits (long_context, deep_reasoning, tool_use_accuracy, frontend_taste)", () => {
      const result = applyTimeBasedWeights(baseWeights);
      expect(result.long_context).toBe(baseWeights.long_context);
      expect(result.deep_reasoning).toBe(baseWeights.deep_reasoning);
      expect(result.tool_use_accuracy).toBe(baseWeights.tool_use_accuracy);
      expect(result.frontend_taste).toBe(baseWeights.frontend_taste);
    });

    test("boosted weights capped at 1.0", () => {
      const maxWeights: TraitWeights = {
        long_context: 0.3,
        deep_reasoning: 0.5,
        tool_use_accuracy: 0.4,
        speed_priority: 0.95,
        frontend_taste: 0.2,
        cost_efficiency: 0.95,
      };
      const result = applyTimeBasedWeights(maxWeights);
      expect(result.speed_priority).toBeLessThanOrEqual(1);
      expect(result.cost_efficiency).toBeLessThanOrEqual(1);
    });
  });
});
