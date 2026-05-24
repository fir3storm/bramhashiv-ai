import { TRAIT_NAMES, type Catalog, type ClassifierResult, type ModelEntry, type OverrideState, type RouteDecision, type TraitName, type RouteExplanation } from "./types.js";
import { scoreAndRank, type ScoringContext } from "./scorer.js";
import { abTesting } from "./config.js";

const SAFE_DEFAULT_ID = "anthropic/claude-sonnet-4-6";

export interface DecideRouteInput {
  catalog: Catalog;
  classifier: ClassifierResult;
  override: OverrideState;
  unavailable: Set<string>;
  scoringCtx?: ScoringContext;
}

function topTwoTraits(weights: ClassifierResult["weights"]): TraitName[] {
  return [...TRAIT_NAMES]
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, 2);
}

function findById(catalog: Catalog, id: string): ModelEntry | undefined {
  return catalog.models.find((m) => m.id === id);
}

function shouldAbTest(): boolean {
  if (!abTesting.enabled || abTesting.percentage <= 0) return false;
  return Math.random() * 100 < abTesting.percentage;
}

export function decideRoute(input: DecideRouteInput): RouteDecision {
  const { catalog, classifier, override, unavailable, scoringCtx } = input;
  const { ranked: ranking, explanations } = scoreAndRank(catalog, classifier.weights, scoringCtx);
  const top_traits = topTwoTraits(classifier.weights);

  const unavailable_models = [...unavailable];

  if (override.pinned_model_id) {
    const pinned = findById(catalog, override.pinned_model_id);
    if (pinned && !unavailable.has(pinned.id)) {
      const pickedExplanation = explanations.find((e) => e.model_id === pinned.id) ?? explanations[0]!;
      const routeExplanation: RouteExplanation = {
        picked_model: pickedExplanation,
        all_models: explanations,
        top_traits,
        classifier_weights: classifier.weights,
        classifier_fallback: classifier.fallback,
        override_source: "user",
        unavailable_models,
      };
      return { picked: pinned, top_traits, ranking, classifier, override_source: "user", explanation: routeExplanation };
    }
  }

  const topRankedId = ranking[0]?.model.id;
  let ab_test = false;

  // A/B testing: occasionally pick the #2 ranked model for validation
  if (shouldAbTest() && ranking.length >= 2) {
    const second = ranking[1]!;
    if (second && !unavailable.has(second.model.id)) {
      ab_test = true;
      const pickedExplanation = explanations.find((e) => e.model_id === second.model.id) ?? explanations[0]!;
      const routeExplanation: RouteExplanation = {
        picked_model: pickedExplanation,
        all_models: explanations,
        top_traits,
        classifier_weights: classifier.weights,
        classifier_fallback: classifier.fallback,
        override_source: "fallback",
        unavailable_models,
      };
      return { picked: second.model, top_traits, ranking, classifier, override_source: "fallback", ab_test, explanation: routeExplanation };
    }
  }

  for (const candidate of ranking) {
    if (!unavailable.has(candidate.model.id)) {
      const pickedExplanation = explanations.find((e) => e.model_id === candidate.model.id) ?? explanations[0]!;
      const override_source = candidate.model.id !== topRankedId ? "fallback" as const : undefined;
      const routeExplanation: RouteExplanation = {
        picked_model: pickedExplanation,
        all_models: explanations,
        top_traits,
        classifier_weights: classifier.weights,
        classifier_fallback: classifier.fallback,
        override_source,
        unavailable_models,
      };
      return { picked: candidate.model, top_traits, ranking, classifier, override_source, ab_test, explanation: routeExplanation };
    }
  }

  const safe = findById(catalog, SAFE_DEFAULT_ID) ?? catalog.models[0];
  if (!safe) throw new Error("catalog is empty");
  const pickedExplanation = explanations.find((e) => e.model_id === safe.id) ?? explanations[0]!;
  const routeExplanation: RouteExplanation = {
    picked_model: pickedExplanation,
    all_models: explanations,
    top_traits,
    classifier_weights: classifier.weights,
    classifier_fallback: classifier.fallback,
    override_source: "fallback",
    unavailable_exhausted: true,
    unavailable_models,
  };
  return {
    picked: safe,
    top_traits,
    ranking,
    classifier,
    override_source: "fallback",
    unavailable_exhausted: true,
    ab_test,
    explanation: routeExplanation,
  };
}
