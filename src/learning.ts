import { TRAIT_NAMES, type ScoreAdjustment, type TaskOutcome, type TraitName } from "./types.js";

const MAX_HISTORY = 200;
const ADJUSTMENT_LEARNING_RATE = 0.05;
const ADJUSTMENT_DECAY = 0.99;
const ADJUSTMENT_CAP = 2.0;

export function recordTaskOutcome(
  history: TaskOutcome[],
  outcome: TaskOutcome,
): TaskOutcome[] {
  const updated = [outcome, ...history];
  return updated.slice(0, MAX_HISTORY);
}

function traitDeltasForOutcome(outcome: TaskOutcome): Partial<Record<TraitName, number>> {
  const deltas: Partial<Record<TraitName, number>> = {};

  if (outcome.success) {
    deltas.speed_priority = outcome.latency_ms < 5000 ? 0.05 : 0.01;
    deltas.tool_use_accuracy = outcome.latency_ms < 3000 ? 0.02 : 0;
  } else {
    deltas.tool_use_accuracy = -0.08;
    deltas.deep_reasoning = -0.05;
  }

  if (outcome.regeneration_count > 0) {
    deltas.tool_use_accuracy = (deltas.tool_use_accuracy ?? 0) - 0.03 * outcome.regeneration_count;
    deltas.deep_reasoning = (deltas.deep_reasoning ?? 0) - 0.02 * outcome.regeneration_count;
  }

  if (outcome.diff_size > 200) {
    deltas.long_context = 0.03;
    deltas.tool_use_accuracy = (deltas.tool_use_accuracy ?? 0) + 0.02;
  }

  return deltas;
}

export function updateAdjustments(
  adjustments: ScoreAdjustment[],
  outcome: TaskOutcome,
): ScoreAdjustment[] {
  const deltas = traitDeltasForOutcome(outcome);
  const result = adjustments.map((a) => ({ ...a, delta: a.delta * ADJUSTMENT_DECAY }));

  for (const trait of TRAIT_NAMES) {
    const delta = deltas[trait] ?? 0;
    if (delta === 0) continue;

    const key = `${outcome.model_id}:${trait}`;
    const idx = result.findIndex((a) => a.model_id === outcome.model_id && a.trait === trait);

    if (idx >= 0) {
      const existing = result[idx]!;
      result[idx] = {
        model_id: existing.model_id,
        trait: existing.trait,
        delta: clamp(existing.delta + delta * ADJUSTMENT_LEARNING_RATE, -ADJUSTMENT_CAP, ADJUSTMENT_CAP),
      };
    } else {
      result.push({
        model_id: outcome.model_id,
        trait: trait as TraitName,
        delta: clamp(delta * ADJUSTMENT_LEARNING_RATE, -ADJUSTMENT_CAP, ADJUSTMENT_CAP),
      });
    }
  }

  return result;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function getAdjustmentScore(
  adjustments: ScoreAdjustment[],
  modelId: string,
  trait: TraitName,
): number {
  const adj = adjustments.find((a) => a.model_id === modelId && a.trait === trait);
  return adj?.delta ?? 0;
}

export function getTopPerformingModels(
  adjustments: ScoreAdjustment[],
  trait: TraitName,
  topN: number = 3,
): string[] {
  const modelScores = new Map<string, number>();
  for (const adj of adjustments) {
    if (adj.trait !== trait) continue;
    const existing = modelScores.get(adj.model_id) ?? 0;
    modelScores.set(adj.model_id, existing + adj.delta);
  }
  return [...modelScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id);
}
