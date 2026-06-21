import { describe, test, expect } from "bun:test";
import {
  estimateStreamingCost,
  formatCostDisplay,
  extrapolateCost,
  createCostSnapshot,
} from "../src/streaming-cost.js";
import type { ModelEntry } from "../src/types.js";

function makeModel(overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id: "test/model",
    provider: "anthropic",
    scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 },
    cost_per_1k_input: 0.01,
    cost_per_1k_output: 0.03,
    ...overrides,
  };
}

describe("streaming-cost", () => {
  describe("estimateStreamingCost", () => {
    test("calculates cost from input and output tokens", () => {
      const cost = estimateStreamingCost(makeModel(), 1000, 1000);
      expect(cost).toBeCloseTo(0.04, 4);
    });

    test("handles zero tokens", () => {
      expect(estimateStreamingCost(makeModel(), 0, 0)).toBe(0);
    });

    test("uses fallback cost when model has no pricing", () => {
      const model = makeModel({ cost_per_1k_input: undefined, cost_per_1k_output: undefined });
      const cost = estimateStreamingCost(model, 1000, 1000);
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe("formatCostDisplay", () => {
    test("formats USD correctly", () => {
      expect(formatCostDisplay(0.0234, "USD")).toBe("$0.0234");
    });

    test("formats INR correctly", () => {
      const display = formatCostDisplay(0.01, "INR");
      expect(display).toContain("\u20B9");
    });

    test("formats very small costs", () => {
      expect(formatCostDisplay(0.0001, "USD")).toBe("$0.0001");
    });
  });

  describe("extrapolateCost", () => {
    test("extrapolates cost from partial output", () => {
      const cost = extrapolateCost(makeModel(), 500, 2000);
      const currentCost = estimateStreamingCost(makeModel(), 0, 500);
      expect(cost).toBeCloseTo(currentCost * 4, 4);
    });

    test("returns 0 when no tokens yet", () => {
      expect(extrapolateCost(makeModel(), 0, 1000)).toBe(0);
    });

    test("returns 0 when expected tokens is 0", () => {
      expect(extrapolateCost(makeModel(), 500, 0)).toBe(0);
    });
  });

  describe("createCostSnapshot", () => {
    test("creates complete snapshot", () => {
      const snapshot = createCostSnapshot(makeModel(), 1000, 500, true);
      expect(snapshot.model_id).toBe("test/model");
      expect(snapshot.input_tokens).toBe(1000);
      expect(snapshot.output_tokens).toBe(500);
      expect(snapshot.is_complete).toBe(true);
      expect(snapshot.estimated_cost_usd).toBeGreaterThan(0);
    });
  });
});
