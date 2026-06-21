import { describe, test, expect } from "bun:test";
import { buildExplanation, formatExplanationForDisplay } from "../src/explanation.js";
import type { RouteExplanation, TraitWeights, ModelScoreExplanation, TraitBreakdown } from "../src/types.js";

function makeWeights(overrides: Partial<TraitWeights> = {}): TraitWeights {
  return {
    long_context: 0.3,
    deep_reasoning: 0.8,
    tool_use_accuracy: 0.9,
    speed_priority: 0.1,
    frontend_taste: 0.2,
    cost_efficiency: 0.4,
    ...overrides,
  };
}

function makeBreakdown(trait: string, weight: number, baseScore: number, contribution: number, adj: number = 0): TraitBreakdown {
  return { trait, weight, base_score: baseScore, learned_adjustment: adj, contribution };
}

function makeModelExplanation(id: string, score: number, breakdowns: TraitBreakdown[] = []): ModelScoreExplanation {
  return {
    model_id: id,
    final_score: score,
    trait_breakdown: breakdowns,
    health_penalty: 0,
    regeneration_penalty: 0,
  };
}

describe("explanation", () => {
  const picked = makeModelExplanation("anthropic/opus", 8.5, [
    makeBreakdown("deep_reasoning", 0.8, 8, 6.4),
    makeBreakdown("tool_use_accuracy", 0.9, 7, 6.3),
    makeBreakdown("cost_efficiency", 0.4, 5, 2.0),
    makeBreakdown("long_context", 0.1, 0, 0),
  ]);

  const baseWeights = makeWeights();
  const baseExplanation: RouteExplanation = {
    picked_model: picked,
    all_models: [
      picked,
      makeModelExplanation("google/gemini", 7.2, [
        makeBreakdown("speed_priority", 0.1, 9, 0.9),
        makeBreakdown("cost_efficiency", 0.4, 8, 3.2),
      ]),
    ],
    top_traits: ["deep_reasoning", "tool_use_accuracy"],
    classifier_weights: baseWeights,
    classifier_fallback: false,
    unavailable_models: [],
  };

  describe("buildExplanation", () => {
    test("returns summary with routed model", () => {
      const result = buildExplanation(baseExplanation);
      expect(result.summary).toContain("anthropic/opus");
    });

    test("marks fallback in summary", () => {
      const result = buildExplanation({ ...baseExplanation, classifier_fallback: true });
      expect(result.summary).toContain("(fallback weights)");
    });

    test("includes top traits in details", () => {
      const result = buildExplanation(baseExplanation);
      expect(result.details).toContain("deep reasoning");
      expect(result.details).toContain("tool use accuracy");
    });

    test("includes override source when present", () => {
      const result = buildExplanation({ ...baseExplanation, override_source: "user" });
      expect(result.details).toContain("[override: user]");
    });

    test("includes unavailable models list", () => {
      const result = buildExplanation({
        ...baseExplanation,
        unavailable_models: ["openai/gpt-5", "huggingface/kimi"],
      });
      expect(result.details).toContain("openai/gpt-5");
      expect(result.details).toContain("huggingface/kimi");
    });

    test("warns when all models exhausted", () => {
      const result = buildExplanation({
        ...baseExplanation,
        unavailable_exhausted: true,
      });
      expect(result.details).toContain("All ranked models were unavailable");
    });

    test("returns top_models as list of IDs", () => {
      const result = buildExplanation(baseExplanation);
      expect(result.top_models).toContain("anthropic/opus");
    });

    test("shows health penalty in model entry", () => {
      const healthPicked = makeModelExplanation("anthropic/opus", 8.5, [makeBreakdown("deep_reasoning", 0.8, 8, 6.4)]);
      healthPicked.health_penalty = 0.25;
      const result = buildExplanation({
        ...baseExplanation,
        picked_model: healthPicked,
        all_models: [healthPicked],
      });
      expect(result.details).toContain("health penalty");
    });

    test("shows regeneration penalty in model entry", () => {
      const regenPicked = makeModelExplanation("anthropic/opus", 8.5, [makeBreakdown("deep_reasoning", 0.8, 8, 6.4)]);
      regenPicked.regeneration_penalty = 0.1;
      const result = buildExplanation({
        ...baseExplanation,
        picked_model: picked,
        all_models: [regenPicked],
      });
      expect(result.details).toContain("regeneration penalty");
    });

    test("hard filter excluded models don't appear in active ranking", () => {
      const filtered = makeModelExplanation("anthropic/haiku", 0, []);
      filtered.hard_filter_excluded = true;
      const result = buildExplanation({
        ...baseExplanation,
        all_models: [picked, filtered],
      });
      // Filtered models don't appear as numbered entries
      expect(result.top_models).not.toContain("anthropic/haiku");
    });

    test("shows learned adjustments in trait breakdowns", () => {
      const adjPicked = makeModelExplanation("anthropic/opus", 8.5, [
        makeBreakdown("deep_reasoning", 0.8, 8, 6.4, 1.5),
      ]);
      const result = buildExplanation({
        ...baseExplanation,
        picked_model: adjPicked,
        all_models: [adjPicked],
      });
      expect(result.details).toContain("learned: +");
    });

    test("limits non-excluded ranking to 5 models in details", () => {
      const models: ModelScoreExplanation[] = Array.from({ length: 10 }, (_, i) =>
        makeModelExplanation(`model-${i}`, 10 - i)
      );
      const result = buildExplanation({ ...baseExplanation, picked_model: picked, all_models: [picked, ...models] });
      // Should have model entries numbered 1 through 5
      const matches = result.details.match(/^\d\./gm);
      expect(matches?.length).toBe(5);
    });
  });

  describe("formatExplanationForDisplay", () => {
    test("prepends bramhashiv tag", () => {
      const result = formatExplanationForDisplay(baseExplanation);
      expect(result).toContain("[bramhashiv]");
    });

    test("includes summary and details", () => {
      const result = formatExplanationForDisplay(baseExplanation);
      expect(result).toContain("Routed to");
      expect(result).toContain("deep reasoning");
    });
  });
});
