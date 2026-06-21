import { describe, test, expect } from "bun:test";
import { getIstHour, isIndiaPeakHours, applyIndiaPeakWeights } from "../src/ist-peak.js";
import type { TraitWeights } from "../src/types.js";

describe("ist-peak", () => {
  describe("getIstHour", () => {
    test("returns a number between 0 and 23", () => {
      const hour = getIstHour();
      expect(hour).toBeGreaterThanOrEqual(0);
      expect(hour).toBeLessThanOrEqual(23);
    });

    test("returns integer hour", () => {
      const hour = getIstHour();
      expect(Number.isInteger(hour)).toBe(true);
    });

    test("returns consistent result", () => {
      const a = getIstHour();
      const b = getIstHour();
      expect(a).toBe(b);
    });
  });

  describe("isIndiaPeakHours", () => {
    test("returns boolean", () => {
      expect(typeof isIndiaPeakHours()).toBe("boolean");
    });
  });

  describe("applyIndiaPeakWeights", () => {
    const baseWeights: TraitWeights = {
      long_context: 0.3,
      deep_reasoning: 0.5,
      tool_use_accuracy: 0.4,
      speed_priority: 0.1,
      frontend_taste: 0.2,
      cost_efficiency: 0.3,
    };

    test("returns same non-cost traits regardless of peak", () => {
      const result = applyIndiaPeakWeights(baseWeights);
      expect(result.long_context).toBe(baseWeights.long_context);
      expect(result.deep_reasoning).toBe(baseWeights.deep_reasoning);
      expect(result.tool_use_accuracy).toBe(baseWeights.tool_use_accuracy);
      expect(result.frontend_taste).toBe(baseWeights.frontend_taste);
    });

    test("boosts cost_efficiency during peak hours", () => {
      const result = applyIndiaPeakWeights(baseWeights);
      if (isIndiaPeakHours()) {
        expect(result.cost_efficiency).toBeGreaterThan(baseWeights.cost_efficiency);
      } else {
        expect(result.cost_efficiency).toBe(baseWeights.cost_efficiency);
      }
    });

    test("boosted cost_efficiency never exceeds 1.0", () => {
      const maxWeights: TraitWeights = {
        ...baseWeights,
        cost_efficiency: 0.95,
      };
      const result = applyIndiaPeakWeights(maxWeights);
      expect(result.cost_efficiency).toBeLessThanOrEqual(1.0);
    });

    test("does not boost speed_priority (only cost_efficiency)", () => {
      const result = applyIndiaPeakWeights(baseWeights);
      expect(result.speed_priority).toBe(baseWeights.speed_priority);
    });
  });
});
