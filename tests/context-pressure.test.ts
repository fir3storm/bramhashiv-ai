import { describe, test, expect } from "bun:test";
import {
  estimateConversationTokens,
  getContextWindow,
  computeContextPressure,
  getContextPenalty,
  rankByContextFit,
} from "../src/context-pressure.js";
import type { ModelEntry } from "../src/types.js";

function makeModel(id: string, contextWindow?: number): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 },
    context_window: contextWindow,
  };
}

describe("context-pressure", () => {
  describe("estimateConversationTokens", () => {
    test("estimates tokens from character count", () => {
      const tokens = estimateConversationTokens(["hello world"], "test task");
      expect(tokens).toBe(Math.ceil(("hello world".length + "test task".length) / 4));
    });

    test("handles empty history", () => {
      const tokens = estimateConversationTokens([], "short");
      expect(tokens).toBeGreaterThan(0);
    });

    test("handles long conversations", () => {
      const history = Array(10).fill("a".repeat(1000));
      const tokens = estimateConversationTokens(history, "task");
      expect(tokens).toBeGreaterThan(2000);
    });
  });

  describe("getContextWindow", () => {
    test("uses model context_window when available", () => {
      expect(getContextWindow(makeModel("test", 200000))).toBe(200000);
    });

    test("uses default when not specified", () => {
      expect(getContextWindow(makeModel("test"))).toBe(128000);
    });
  });

  describe("computeContextPressure", () => {
    test("returns 0 penalty for low utilization", () => {
      const result = computeContextPressure(makeModel("test", 200000), 50000);
      expect(result.penalty).toBe(0);
      expect(result.utilization).toBeLessThan(0.6);
    });

    test("returns warn penalty for medium utilization", () => {
      const result = computeContextPressure(makeModel("test", 100000), 65000);
      expect(result.penalty).toBeGreaterThan(0);
      expect(result.utilization).toBeGreaterThan(0.6);
    });

    test("returns critical penalty for very high utilization", () => {
      const result = computeContextPressure(makeModel("test", 100000), 96000);
      expect(result.penalty).toBeGreaterThan(0.1);
      expect(result.utilization).toBeGreaterThan(0.95);
    });
  });

  describe("getContextPenalty", () => {
    test("returns 0 for small conversations", () => {
      expect(getContextPenalty(makeModel("test", 200000), 1000)).toBe(0);
    });

    test("returns positive penalty for large conversations", () => {
      expect(getContextPenalty(makeModel("test", 100000), 96000)).toBeGreaterThan(0);
    });
  });

  describe("rankByContextFit", () => {
    test("ranks larger context windows first for large conversations", () => {
      const models = [
        makeModel("small", 32000),
        makeModel("large", 200000),
        makeModel("medium", 128000),
      ];
      const ranked = rankByContextFit(models, 100000);
      expect(ranked[0]!.model_id).toBe("large");
      expect(ranked[ranked.length - 1]!.model_id).toBe("small");
    });

    test("returns same order for small conversations", () => {
      const models = [
        makeModel("a", 128000),
        makeModel("b", 128000),
      ];
      const ranked = rankByContextFit(models, 1000);
      expect(ranked[0]!.penalty).toBe(0);
      expect(ranked[1]!.penalty).toBe(0);
    });
  });
});
