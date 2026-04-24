import { describe, test, expect } from "bun:test";
import { scoreAndRank } from "../src/scorer.js";
import type { Catalog, TraitWeights } from "../src/types.js";

function model(id: string, scores: Partial<Record<string, number>>, hard?: { min_context?: number }) {
  const base = {
    long_context: 5,
    deep_reasoning: 5,
    tool_use_accuracy: 5,
    speed_priority: 5,
    frontend_taste: 5,
    cost_efficiency: 5,
    ...scores,
  };
  return {
    id,
    provider: "anthropic" as const,
    scores: base as never,
    ...(hard ? { hard_filters: hard } : {}),
  };
}

const weights: TraitWeights = {
  long_context: 1,
  deep_reasoning: 0,
  tool_use_accuracy: 0,
  speed_priority: 0,
  frontend_taste: 0,
  cost_efficiency: 0,
};

describe("scoreAndRank", () => {
  test("ranks by weighted dot product", () => {
    const cat: Catalog = {
      models: [model("a", { long_context: 3 }), model("b", { long_context: 9 })],
    };
    const ranked = scoreAndRank(cat, weights);
    expect(ranked[0]!.model.id).toBe("b");
    expect(ranked[1]!.model.id).toBe("a");
  });

  test("filters out models failing hard filters when relevant trait dominant", () => {
    const cat: Catalog = {
      models: [
        model("short", { long_context: 9 }, { min_context: 50000 }),
        model("long", { long_context: 8 }, { min_context: 200000 }),
      ],
    };
    const w = { ...weights, long_context: 0.8 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked.map((r) => r.model.id)).toEqual(["long"]);
  });

  test("does not apply long-context filter when trait weight is low", () => {
    const cat: Catalog = {
      models: [model("short", { long_context: 9 }, { min_context: 50000 })],
    };
    const w = { ...weights, long_context: 0.3 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked).toHaveLength(1);
  });

  test("tie-breaks by cost_efficiency descending", () => {
    const cat: Catalog = {
      models: [
        model("cheap", { long_context: 5, cost_efficiency: 10 }),
        model("expensive", { long_context: 5, cost_efficiency: 1 }),
      ],
    };
    const ranked = scoreAndRank(cat, weights);
    expect(ranked[0]!.model.id).toBe("cheap");
  });

  test("returns empty list if all models filtered", () => {
    const cat: Catalog = {
      models: [model("short", {}, { min_context: 50000 })],
    };
    const w = { ...weights, long_context: 0.9 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked).toEqual([]);
  });
});
