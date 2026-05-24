/**
 * Multi-model ensemble for critical tasks.
 * When enabled, routes critical tasks to both the top-1 and top-2 models,
 * using the secondary as a silent fallback.
 */

import type { RouteDecision, RankedModel } from "./types.js";

export interface EnsembleConfig {
  enabled: boolean;
  criticalityThreshold: number;
}

export function isCriticalTask(weights: { deep_reasoning: number; tool_use_accuracy: number }): boolean {
  return weights.deep_reasoning + weights.tool_use_accuracy >= 1.4;
}

export function buildEnsembleDecision(
  primary: RouteDecision,
  ranking: RankedModel[],
): { primary: RouteDecision; fallback?: RankedModel } {
  const fallback = ranking.find((r, i) => i > 0 && r.model.id !== primary.picked.id);
  return { primary, fallback };
}
