import { describe, test, expect } from "bun:test";
import { isCriticalTask, buildEnsembleFallback } from "../src/ensemble.js";
import type { ModelEntry, RankedModel, TraitScores } from "../src/types.js";

function makeModel(id: string, provider: string = "anthropic"): ModelEntry {
  return {
    id,
    provider: provider as ModelEntry["provider"],
    scores: {
      long_context: 5,
      deep_reasoning: 5,
      tool_use_accuracy: 5,
      speed_priority: 5,
      frontend_taste: 5,
      cost_efficiency: 5,
    },
  };
}

function makeRanked(model: ModelEntry, score: number): RankedModel {
  return { model, score };
}

describe("ensemble", () => {
  describe("isCriticalTask", () => {
    test("returns true when sum >= 1.4", () => {
      expect(isCriticalTask({ deep_reasoning: 0.8, tool_use_accuracy: 0.7 })).toBe(true);
    });

    test("returns true at boundary", () => {
      expect(isCriticalTask({ deep_reasoning: 0.7, tool_use_accuracy: 0.7 })).toBe(true);
    });

    test("returns false when sum is below 1.4", () => {
      expect(isCriticalTask({ deep_reasoning: 0.5, tool_use_accuracy: 0.5 })).toBe(false);
    });

    test("returns false for zero weights", () => {
      expect(isCriticalTask({ deep_reasoning: 0, tool_use_accuracy: 0 })).toBe(false);
    });

    test("returns true when only deep_reasoning is high enough", () => {
      expect(isCriticalTask({ deep_reasoning: 1.4, tool_use_accuracy: 0 })).toBe(true);
    });
  });

  describe("buildEnsembleFallback", () => {
    test("returns different-provider model from ranking", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const fallbackModel = makeModel("google/gemini-pro", "google");
      const ranking: RankedModel[] = [
        makeRanked(primary, 10),
        makeRanked(fallbackModel, 8),
        makeRanked(makeModel("anthropic/sonnet", "anthropic"), 7),
      ];
      const result = buildEnsembleFallback(primary, ranking);
      expect(result).toBeDefined();
      expect(result!.id).toBe("google/gemini-pro");
      expect(result!.provider).toBe("google");
    });

    test("skips same-provider model and picks different one", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const sameProvider = makeModel("anthropic/sonnet", "anthropic");
      const diffProvider = makeModel("google/gemini-pro", "google");
      const ranking: RankedModel[] = [
        makeRanked(primary, 10),
        makeRanked(sameProvider, 8),
        makeRanked(diffProvider, 7),
      ];
      const result = buildEnsembleFallback(primary, ranking);
      expect(result).toBeDefined();
      expect(result!.id).toBe("google/gemini-pro");
    });

    test("returns undefined when all models are same provider", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const ranking: RankedModel[] = [
        makeRanked(primary, 10),
        makeRanked(makeModel("anthropic/sonnet", "anthropic"), 8),
        makeRanked(makeModel("anthropic/haiku", "anthropic"), 7),
      ];
      const result = buildEnsembleFallback(primary, ranking);
      expect(result).toBeUndefined();
    });

    test("returns undefined for single-model ranking", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const ranking: RankedModel[] = [makeRanked(primary, 10)];
      const result = buildEnsembleFallback(primary, ranking);
      expect(result).toBeUndefined();
    });

    test("returns undefined for empty ranking", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const result = buildEnsembleFallback(primary, []);
      expect(result).toBeUndefined();
    });

    test("ignores primary model even if listed again", () => {
      const primary = makeModel("anthropic/opus", "anthropic");
      const fallbackModel = makeModel("google/gemini-pro", "google");
      const ranking: RankedModel[] = [
        makeRanked(primary, 10),
        makeRanked(primary, 10), // duplicate primary
        makeRanked(fallbackModel, 7),
      ];
      const result = buildEnsembleFallback(primary, ranking);
      expect(result).toBeDefined();
      expect(result!.id).toBe("google/gemini-pro");
    });
  });
});
