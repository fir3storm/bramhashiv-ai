import { TRAIT_NAMES, type Catalog, type ModelEntry, type RankedModel, type TraitWeights } from "./types.js";
import { getHealthPenalty } from "./health-monitor.js";
import { getRegenerationPenalty } from "./regeneration-tracker.js";
import { getAdjustmentScore } from "./learning.js";
import type { HealthRecord, RegenerationRecord, ScoreAdjustment } from "./types.js";

const LONG_CONTEXT_THRESHOLD = 0.7;

export interface ScoringContext {
  healthRecords?: HealthRecord[];
  regenerationRecords?: RegenerationRecord[];
  adjustments?: ScoreAdjustment[];
  taskExcerpt?: string;
}

function passesHardFilters(m: ModelEntry, w: TraitWeights): boolean {
  if (m.hard_filters?.min_context !== undefined && w.long_context > LONG_CONTEXT_THRESHOLD) {
    if (m.hard_filters.min_context < 200_000) return false;
  }
  return true;
}

export function scoreAndRank(
  catalog: Catalog,
  weights: TraitWeights,
  ctx?: ScoringContext,
): RankedModel[] {
  const ranked: RankedModel[] = [];
  for (const model of catalog.models) {
    if (!passesHardFilters(model, weights)) continue;
    let score = 0;
    for (const trait of TRAIT_NAMES) {
      let traitScore = model.scores[trait];
      traitScore += getAdjustmentScore(
        ctx?.adjustments ?? [],
        model.id,
        trait,
      );
      score += weights[trait] * traitScore;
    }

    if (ctx) {
      const health = ctx.healthRecords?.find((h) => h.model_id === model.id);
      if (health) {
        const healthPenalty = getHealthPenalty(health.health_score);
        score *= (1 - healthPenalty);
      }

      const regenPenalty = getRegenerationPenalty(
        ctx.regenerationRecords ?? [],
        model.id,
        ctx.taskExcerpt ?? "",
      );
      score *= (1 - regenPenalty);
    }

    ranked.push({ model, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.model.scores.cost_efficiency - a.model.scores.cost_efficiency;
  });
  return ranked;
}
