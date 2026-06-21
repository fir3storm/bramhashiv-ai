/**
 * Multi-model ensemble for critical tasks.
 * When enabled, routes critical tasks to both the top-1 and top-2 models,
 * using the secondary as a silent fallback.
 */

import type { RouteDecision, RankedModel, ModelEntry } from "./types.js";

export interface EnsembleConfig {
  enabled: boolean;
  criticalityThreshold: number;
}

export function isCriticalTask(weights: { deep_reasoning: number; tool_use_accuracy: number }): boolean {
  return weights.deep_reasoning + weights.tool_use_accuracy >= 1.4;
}

/**
 * Build ensemble decision with fallback model.
 * Returns the fallback model that should be used if the primary fails.
 */
export function buildEnsembleFallback(
  primaryModel: ModelEntry,
  ranking: RankedModel[],
): ModelEntry | undefined {
  // Find the top-ranked model that's different from the primary
  const fallback = ranking.find((r) => r.model.id !== primaryModel.id && r.model.provider !== primaryModel.provider);
  return fallback?.model;
}