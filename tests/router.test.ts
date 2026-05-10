import { describe, test, expect } from "bun:test";
import { decideRoute } from "../src/router.js";
import type { Catalog, ClassifierResult, ModelEntry, TraitWeights } from "../src/types.js";

function model(id: string, overrides: Partial<Record<string, number>> = {}): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: {
      long_context: 5, deep_reasoning: 5, tool_use_accuracy: 5,
      speed_priority: 5, frontend_taste: 5, cost_efficiency: 5,
      ...overrides,
    } as never,
  };
}

const catalog: Catalog = {
  models: [
    model("top", { long_context: 10 }),
    model("second", { long_context: 7 }),
    model("third", { long_context: 3 }),
  ],
};

const weights: TraitWeights = {
  long_context: 1, deep_reasoning: 0, tool_use_accuracy: 0,
  speed_priority: 0, frontend_taste: 0, cost_efficiency: 0,
};

const classifierResult: ClassifierResult = { weights, fallback: false };

describe("decideRoute", () => {
  test("picks top-ranked model when no override and none unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set() });
    expect(decision.picked.id).toBe("top");
    expect(decision.top_traits[0]).toBe("long_context");
  });

  test("falls back to next model when top is unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set(["top"]) });
    expect(decision.picked.id).toBe("second");
    expect(decision.override_source).toBe("fallback");
  });

  test("respects user pin over classifier", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: "third" }, unavailable: new Set() });
    expect(decision.picked.id).toBe("third");
    expect(decision.override_source).toBe("user");
  });

  test("ignores invalid pin and falls through to auto", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: "ghost" }, unavailable: new Set() });
    expect(decision.picked.id).toBe("top");
  });

  test("returns safe default when all models unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set(["top", "second", "third"]) });
    expect(decision.override_source).toBe("fallback");
    expect(decision.unavailable_exhausted).toBe(true);
    expect(decision.picked).toBeDefined();
  });

  test("top_traits lists the two highest weights", () => {
    const w: TraitWeights = {
      long_context: 0.9, deep_reasoning: 0.8, tool_use_accuracy: 0.1,
      speed_priority: 0.1, frontend_taste: 0.1, cost_efficiency: 0.1,
    };
    const decision = decideRoute({
      catalog,
      classifier: { weights: w, fallback: false },
      override: { pinned_model_id: null },
      unavailable: new Set(),
    });
    expect(decision.top_traits).toEqual(["long_context", "deep_reasoning"]);
  });
});
