import { TRAIT_NAMES, type Catalog, type ModelEntry, type RankedModel, type TraitWeights } from "./types.js";

const LONG_CONTEXT_THRESHOLD = 0.7;

function passesHardFilters(m: ModelEntry, w: TraitWeights): boolean {
  if (m.hard_filters?.min_context !== undefined && w.long_context > LONG_CONTEXT_THRESHOLD) {
    if (m.hard_filters.min_context < 200_000) return false;
  }
  return true;
}

export function scoreAndRank(catalog: Catalog, weights: TraitWeights): RankedModel[] {
  const ranked: RankedModel[] = [];
  for (const model of catalog.models) {
    if (!passesHardFilters(model, weights)) continue;
    let score = 0;
    for (const trait of TRAIT_NAMES) {
      score += weights[trait] * model.scores[trait];
    }
    ranked.push({ model, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.model.scores.cost_efficiency - a.model.scores.cost_efficiency;
  });
  return ranked;
}
