import type { ModelEntry, ContextPressureResult } from "./types.js";
import { contextPressure } from "./config.js";

export function estimateConversationTokens(
  conversationHistory: string[],
  currentTask: string,
): number {
  let totalChars = currentTask.length;
  for (const msg of conversationHistory) {
    totalChars += msg.length;
  }
  return Math.ceil(totalChars / 4);
}

export function getContextWindow(model: ModelEntry): number {
  return model.context_window ?? contextPressure.default_context_window;
}

export function computeContextPressure(
  model: ModelEntry,
  estimatedTokens: number,
): ContextPressureResult {
  const window = getContextWindow(model);
  const utilization = Math.min(1, estimatedTokens / window);

  let penalty = 0;
  if (utilization >= contextPressure.threshold_critical) {
    penalty = contextPressure.penalty_critical;
  } else if (utilization >= contextPressure.threshold_high) {
    penalty = contextPressure.penalty_high;
  } else if (utilization >= contextPressure.threshold_warn) {
    penalty = contextPressure.penalty_warn;
  }

  return {
    model_id: model.id,
    estimated_tokens: estimatedTokens,
    context_window: window,
    utilization,
    penalty,
  };
}

export function getContextPenalty(
  model: ModelEntry,
  estimatedTokens: number,
): number {
  if (!contextPressure.enabled) return 0;
  return computeContextPressure(model, estimatedTokens).penalty;
}

export function rankByContextFit(
  models: ModelEntry[],
  estimatedTokens: number,
): { model_id: string; penalty: number }[] {
  return models
    .map((m) => ({
      model_id: m.id,
      penalty: getContextPenalty(m, estimatedTokens),
    }))
    .sort((a, b) => a.penalty - b.penalty);
}
