import { TRAIT_NAMES, type Catalog, type ClassifierResult, type ModelEntry, type OverrideState, type RouteDecision, type TraitName } from "./types.js";
import { scoreAndRank } from "./scorer.js";

const SAFE_DEFAULT_ID = "anthropic/claude-sonnet-4-6";

export interface DecideRouteInput {
  catalog: Catalog;
  classifier: ClassifierResult;
  override: OverrideState;
  unavailable: Set<string>;
}

function topTwoTraits(weights: ClassifierResult["weights"]): TraitName[] {
  return [...TRAIT_NAMES]
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, 2);
}

function findById(catalog: Catalog, id: string): ModelEntry | undefined {
  return catalog.models.find((m) => m.id === id);
}

export function decideRoute(input: DecideRouteInput): RouteDecision {
  const { catalog, classifier, override, unavailable } = input;
  const ranking = scoreAndRank(catalog, classifier.weights);
  const top_traits = topTwoTraits(classifier.weights);

  if (override.pinned_model_id) {
    const pinned = findById(catalog, override.pinned_model_id);
    if (pinned && !unavailable.has(pinned.id)) {
      return { picked: pinned, top_traits, ranking, classifier, override_source: "user" };
    }
  }

  const topRankedId = ranking[0]?.model.id;
  for (const candidate of ranking) {
    if (!unavailable.has(candidate.model.id)) {
      const override_source = candidate.model.id !== topRankedId ? "fallback" as const : undefined;
      return { picked: candidate.model, top_traits, ranking, classifier, override_source };
    }
  }

  const safe = findById(catalog, SAFE_DEFAULT_ID) ?? catalog.models[0];
  if (!safe) throw new Error("catalog is empty");
  return { picked: safe, top_traits, ranking, classifier, override_source: "fallback" };
}
