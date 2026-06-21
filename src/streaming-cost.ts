import type { ModelEntry, StreamingCostSnapshot } from "./types.js";
import { pricing } from "./config.js";

export function estimateStreamingCost(
  model: ModelEntry,
  inputTokens: number,
  outputTokens: number,
): number {
  const inputCost = (inputTokens / 1000) * (model.cost_per_1k_input ?? 0.001);
  const outputCost =
    (outputTokens / 1000) * (model.cost_per_1k_output ?? model.cost_per_1k_input ?? 0.001);
  return inputCost + outputCost;
}

export function formatCostDisplay(costUsd: number, currency?: "USD" | "INR"): string {
  const cur = currency ?? pricing.display_currency;
  if (cur === "INR") {
    const inr = costUsd * pricing.usd_to_inr_rate;
    return `\u20B9${inr.toFixed(2)}`;
  }
  return `$${costUsd.toFixed(4)}`;
}

export function extrapolateCost(
  model: ModelEntry,
  currentOutputTokens: number,
  expectedTotalTokens: number,
): number {
  if (expectedTotalTokens <= 0 || currentOutputTokens <= 0) return 0;
  const ratio = expectedTotalTokens / currentOutputTokens;
  const currentCost = estimateStreamingCost(model, 0, currentOutputTokens);
  return currentCost * ratio;
}

export function createCostSnapshot(
  model: ModelEntry,
  inputTokens: number,
  outputTokens: number,
  isComplete: boolean,
): StreamingCostSnapshot {
  return {
    model_id: model.id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimateStreamingCost(model, inputTokens, outputTokens),
    is_complete: isComplete,
  };
}
