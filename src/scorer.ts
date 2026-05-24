import { TRAIT_NAMES, type Catalog, type ModelEntry, type RankedModel, type TraitWeights } from "./types.js";
import { getHealthPenalty } from "./health-monitor.js";
import { getRegenerationPenalty } from "./regeneration-tracker.js";
import { getAdjustmentScore } from "./learning.js";
import { getBudgetPenalty, estimateTaskCost } from "./budget.js";
import { latencySlo } from "./config.js";
import type { HealthRecord, RegenerationRecord, ScoreAdjustment, TraitBreakdown, ModelScoreExplanation, BudgetState } from "./types.js";

const LONG_CONTEXT_THRESHOLD = 0.7;

export interface ScoringContext {
  healthRecords?: HealthRecord[];
  regenerationRecords?: RegenerationRecord[];
  adjustments?: ScoreAdjustment[];
  taskExcerpt?: string;
  budgetState?: BudgetState;
}

export interface ScoreResult {
  ranked: RankedModel[];
  explanations: ModelScoreExplanation[];
}

function passesHardFilters(m: ModelEntry, w: TraitWeights): boolean {
  if (m.hard_filters?.min_context !== undefined && w.long_context > LONG_CONTEXT_THRESHOLD) {
    if (m.hard_filters.min_context < 200_000) return false;
  }
  return true;
}

function calculateTraitBreakdown(
  model: ModelEntry,
  weights: TraitWeights,
  adjustments: ScoreAdjustment[],
): TraitBreakdown[] {
  const breakdown: TraitBreakdown[] = [];
  for (const trait of TRAIT_NAMES) {
    const baseScore = model.scores[trait];
    const learnedAdjustment = getAdjustmentScore(adjustments, model.id, trait);
    const adjustedScore = baseScore + learnedAdjustment;
    const contribution = weights[trait] * adjustedScore;
    breakdown.push({
      trait,
      weight: weights[trait],
      base_score: baseScore,
      learned_adjustment: learnedAdjustment,
      contribution,
    });
  }
  return breakdown;
}

function getLatencySloPenalty(health?: HealthRecord): number {
  if (latencySlo.target_ms <= 0 || !health || health.latency_samples.length === 0) return 0;
  const ema = health.latency_samples.reduce((a, b, i) =>
    i === 0 ? b : latencySlo.decay_alpha * b + (1 - latencySlo.decay_alpha) * a,
    0
  );
  if (ema <= latencySlo.target_ms) return 0;
  const overMs = ema - latencySlo.target_ms;
  return Math.min(overMs * latencySlo.penalty_per_ms_over, 0.5);
}

export function scoreAndRank(
  catalog: Catalog,
  weights: TraitWeights,
  ctx?: ScoringContext,
): ScoreResult {
  const ranked: RankedModel[] = [];
  const explanations: ModelScoreExplanation[] = [];

  for (const model of catalog.models) {
    if (!passesHardFilters(model, weights)) {
      explanations.push({
        model_id: model.id,
        final_score: 0,
        trait_breakdown: calculateTraitBreakdown(model, weights, ctx?.adjustments ?? []),
        health_penalty: 0,
        regeneration_penalty: 0,
        hard_filter_excluded: true,
      });
      continue;
    }

    let score = 0;
    const traitBreakdown = calculateTraitBreakdown(model, weights, ctx?.adjustments ?? []);

    for (const trait of TRAIT_NAMES) {
      let traitScore = model.scores[trait];
      traitScore += getAdjustmentScore(
        ctx?.adjustments ?? [],
        model.id,
        trait,
      );
      score += weights[trait] * traitScore;
    }

    let healthPenalty = 0;
    let regenPenalty = 0;
    let budgetPenalty = 0;
    let sloPenalty = 0;

    if (ctx) {
      const health = ctx.healthRecords?.find((h) => h.model_id === model.id);
      if (health) {
        healthPenalty = getHealthPenalty(health.health_score);
        score *= (1 - healthPenalty);
      }

      regenPenalty = getRegenerationPenalty(
        ctx.regenerationRecords ?? [],
        model.id,
        ctx.taskExcerpt ?? "",
      );
      score *= (1 - regenPenalty);

      if (ctx.budgetState) {
        const estimatedCost = estimateTaskCost(model);
        budgetPenalty = getBudgetPenalty(ctx.budgetState, model, estimatedCost);
        score *= (1 - budgetPenalty);
      }

      sloPenalty = getLatencySloPenalty(health);
      if (sloPenalty > 0) {
        score *= (1 - sloPenalty);
      }
    }

    explanations.push({
      model_id: model.id,
      final_score: score,
      trait_breakdown: traitBreakdown,
      health_penalty: healthPenalty,
      regeneration_penalty: regenPenalty,
      budget_penalty: budgetPenalty > 0 ? budgetPenalty : undefined,
      slo_penalty: sloPenalty > 0 ? sloPenalty : undefined,
    });

    ranked.push({ model, score });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.model.scores.cost_efficiency - a.model.scores.cost_efficiency;
  });

  // Sort explanations to match ranking order
  explanations.sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    const aModel = catalog.models.find((m) => m.id === a.model_id);
    const bModel = catalog.models.find((m) => m.id === b.model_id);
    return (bModel?.scores.cost_efficiency ?? 0) - (aModel?.scores.cost_efficiency ?? 0);
  });

  return { ranked, explanations };
}
