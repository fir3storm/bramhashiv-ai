import { describe, test, expect } from "bun:test";
import { shouldReuseModel, predictNextModel, getWarmupConfidence } from "../src/model-warmup.js";
import type { RouteDecision, Catalog, TraitWeights, ModelEntry } from "../src/types.js";

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

function makeModel(id: string): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 },
  };
}

function makeDecision(modelId: string): RouteDecision {
  const model = makeModel(modelId);
  return {
    picked: model,
    top_traits: ["deep_reasoning", "tool_use_accuracy"],
    ranking: [{ model, score: 10 }],
    classifier: { weights: baseWeights(), fallback: false },
  };
}

function makeCatalog(): Catalog {
  return { models: [makeModel("anthropic/claude-sonnet-4-6")] };
}

describe("model-warmup", () => {
  describe("shouldReuseModel", () => {
    test("returns false for empty texts", () => {
      expect(shouldReuseModel("", "fix the bug")).toBe(false);
      expect(shouldReuseModel("fix the bug", "")).toBe(false);
    });

    test("returns true for follow-up patterns", () => {
      expect(shouldReuseModel("write a function", "now add tests")).toBe(true);
      expect(shouldReuseModel("create component", "fix the styling")).toBe(true);
      expect(shouldReuseModel("build API", "refactor the code")).toBe(true);
    });

    test("returns false for task shift patterns", () => {
      expect(shouldReuseModel("fix bug", "new task: build login")).toBe(false);
      expect(shouldReuseModel("write code", "let's start over")).toBe(false);
    });

    test("returns true for similar texts", () => {
      expect(shouldReuseModel(
        "implement user authentication",
        "implement user authorization",
      )).toBe(true);
    });
  });

  describe("predictNextModel", () => {
    test("returns null when conversation has less than 2 entries", () => {
      const hint = predictNextModel(makeDecision("anthropic/claude-sonnet-4-6"), ["single"], makeCatalog());
      expect(hint).toBeNull();
    });

    test("returns null when task shift detected", () => {
      const hint = predictNextModel(
        makeDecision("anthropic/claude-sonnet-4-6"),
        ["write a function", "new task: something different"],
        makeCatalog(),
      );
      expect(hint).toBeNull();
    });

    test("returns warmup hint for follow-up conversation", () => {
      const hint = predictNextModel(
        makeDecision("anthropic/claude-sonnet-4-6"),
        ["write a function", "now add tests"],
        makeCatalog(),
      );
      expect(hint).not.toBeNull();
      expect(hint!.predicted_model_id).toBe("anthropic/claude-sonnet-4-6");
      expect(hint!.confidence).toBeGreaterThan(0);
    });

    test("confidence increases with conversation length", () => {
      const hint1 = predictNextModel(
        makeDecision("anthropic/claude-sonnet-4-6"),
        ["msg1", "now fix"],
        makeCatalog(),
      );
      const hint2 = predictNextModel(
        makeDecision("anthropic/claude-sonnet-4-6"),
        ["msg1", "msg2", "msg3", "now fix"],
        makeCatalog(),
      );
      expect(hint2!.confidence).toBeGreaterThanOrEqual(hint1!.confidence);
    });
  });

  describe("getWarmupConfidence", () => {
    test("returns 0 for null hint", () => {
      expect(getWarmupConfidence(null)).toBe(0);
    });

    test("returns 0 for stale hint (>60s old)", () => {
      const hint = {
        predicted_model_id: "test",
        confidence: 0.8,
        predicted_traits: baseWeights(),
        timestamp: Date.now() - 120_000,
      };
      expect(getWarmupConfidence(hint)).toBe(0);
    });

    test("returns positive confidence for fresh hint", () => {
      const hint = {
        predicted_model_id: "test",
        confidence: 0.8,
        predicted_traits: baseWeights(),
        timestamp: Date.now(),
      };
      expect(getWarmupConfidence(hint)).toBeGreaterThan(0);
    });
  });
});
