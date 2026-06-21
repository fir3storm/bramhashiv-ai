/**
 * Budget estimation and tracking.
 * Uses model pricing from the catalog and actual task size for cost estimates.
 */

import type { BudgetState, BudgetSpendRecord, ModelEntry, BudgetStatus } from "./types.js";
import { budget as cfg } from "./config.js";

export function createEmptyBudgetState(): BudgetState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    daily_spend: 0,
    monthly_spend: 0,
    last_reset_day: today,
    last_reset_month: today.slice(0, 7),
    records: [],
  };
}

/** Estimate task cost using model pricing and actual task size. */
export function estimateTaskCost(
  model: ModelEntry,
  inputTokens?: number,
  outputTokens?: number,
): number {
  // Use actual token counts when available
  if (inputTokens && model.cost_per_1k_input) {
    const inputCost = (inputTokens / 1000) * model.cost_per_1k_input;
    const outputCost = outputTokens ? (outputTokens / 1000) * (model.cost_per_1k_output ?? model.cost_per_1k_input) : 0;
    return inputCost + outputCost;
  }

  // Fallback: use catalog default
  return model.cost_per_1k_input ?? 0.001;
}

export function recordSpend(
  state: BudgetState,
  model: ModelEntry,
  estimatedCost: number,
  taskExcerpt: string,
  inputTokens?: number,
  outputTokens?: number,
): BudgetState {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  let dailySpend = state.daily_spend;
  let monthlySpend = state.monthly_spend;

  // Reset counters if day/month has changed
  if (state.last_reset_day !== today) {
    dailySpend = 0;
  }
  if (state.last_reset_month !== thisMonth) {
    monthlySpend = 0;
  }

  const record: BudgetSpendRecord = {
    model_id: model.id,
    provider: model.provider,
    estimated_cost_usd: estimatedCost,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    timestamp: now.toISOString(),
    task_excerpt: taskExcerpt.slice(0, 120),
  };

  return {
    daily_spend: dailySpend + estimatedCost,
    monthly_spend: monthlySpend + estimatedCost,
    last_reset_day: today,
    last_reset_month: thisMonth,
    records: [record, ...state.records].slice(0, cfg.max_records),
  };
}

export function getBudgetStatus(state: BudgetState): BudgetStatus {
  return {
    daily_spend: state.daily_spend,
    monthly_spend: state.monthly_spend,
    daily_limit: cfg.daily_limit_usd,
    monthly_limit: cfg.monthly_limit_usd,
    near_limit: state.daily_spend >= cfg.daily_limit_usd * cfg.near_limit_threshold ||
      state.monthly_spend >= cfg.monthly_limit_usd * cfg.near_limit_threshold,
    over_limit: state.daily_spend >= cfg.daily_limit_usd || state.monthly_spend >= cfg.monthly_limit_usd,
  };
}

/** Get budget penalty for scorer. */
export function getBudgetPenalty(state: BudgetState): number {
  const status = getBudgetStatus(state);
  if (status.over_limit) return cfg.penalty_over_limit;
  if (status.near_limit) return cfg.penalty_near_limit;
  return 0;
}

/** Reset budget counters if day/month has changed. */
export function resetBudgetIfNeeded(state: BudgetState): BudgetState {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  if (state.last_reset_day === today && state.last_reset_month === thisMonth) {
    return state;
  }

  return {
    ...state,
    daily_spend: state.last_reset_day !== today ? 0 : state.daily_spend,
    monthly_spend: state.last_reset_month !== thisMonth ? 0 : state.monthly_spend,
    last_reset_day: today,
    last_reset_month: thisMonth,
  };
}