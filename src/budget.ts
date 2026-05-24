import type { BudgetState, BudgetSpendRecord, ModelEntry } from "./types.js";
import { budget as cfg, pricing } from "./config.js";

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function createEmptyBudgetState(): BudgetState {
  return {
    daily_spend: 0,
    monthly_spend: 0,
    last_reset_day: getToday(),
    last_reset_month: getMonth(),
    records: [],
  };
}

export function resetBudgetIfNeeded(state: BudgetState): BudgetState {
  const today = getToday();
  const month = getMonth();
  let dailySpend = state.daily_spend;
  let monthlySpend = state.monthly_spend;

  if (state.last_reset_day !== today) {
    dailySpend = 0;
  }
  if (state.last_reset_month !== month) {
    monthlySpend = 0;
  }

  return {
    ...state,
    daily_spend: dailySpend,
    monthly_spend: monthlySpend,
    last_reset_day: today,
    last_reset_month: month,
  };
}

export function estimateTaskCost(model: ModelEntry, inputTokens?: number, outputTokens?: number): number {
  const inTok = inputTokens ?? cfg.default_input_tokens;
  const outTok = outputTokens ?? cfg.default_output_tokens;
  const inCost = (inTok / 1000) * (model.cost_per_1k_input ?? 0);
  const outCost = (outTok / 1000) * (model.cost_per_1k_output ?? 0);
  return inCost + outCost;
}

export interface CostBreakdown {
  cost_usd: number;
  cost_inr: number;
  rate: number;
}

/** Estimate task cost in both USD and INR. */
export function estimateTaskCostINR(model: ModelEntry, inputTokens?: number, outputTokens?: number): CostBreakdown {
  const cost_usd = estimateTaskCost(model, inputTokens, outputTokens);
  return {
    cost_usd,
    cost_inr: cost_usd * pricing.usd_to_inr_rate,
    rate: pricing.usd_to_inr_rate,
  };
}

export function recordSpend(
  state: BudgetState,
  model: ModelEntry,
  estimatedCostUsd: number,
  taskExcerpt: string,
): BudgetState {
  const reset = resetBudgetIfNeeded(state);
  const record: BudgetSpendRecord = {
    model_id: model.id,
    provider: model.provider,
    estimated_cost_usd: estimatedCostUsd,
    timestamp: new Date().toISOString(),
    task_excerpt: taskExcerpt.slice(0, 120),
  };
  const records = [record, ...reset.records].slice(0, cfg.max_records);
  return {
    ...reset,
    daily_spend: reset.daily_spend + estimatedCostUsd,
    monthly_spend: reset.monthly_spend + estimatedCostUsd,
    records,
  };
}

export function getBudgetPenalty(state: BudgetState, model: ModelEntry, estimatedCost: number): number {
  const reset = resetBudgetIfNeeded(state);
  const projectedDaily = reset.daily_spend + estimatedCost;
  const projectedMonthly = reset.monthly_spend + estimatedCost;

  if (projectedDaily > cfg.daily_limit_usd || projectedMonthly > cfg.monthly_limit_usd) {
    return cfg.penalty_over_limit;
  }

  const dailyRatio = reset.daily_spend / cfg.daily_limit_usd;
  const monthlyRatio = reset.monthly_spend / cfg.monthly_limit_usd;
  const maxRatio = Math.max(dailyRatio, monthlyRatio);

  if (maxRatio >= cfg.near_limit_threshold) {
    return cfg.penalty_near_limit;
  }

  return 0;
}

export function getBudgetStatus(
  state: BudgetState,
  displayCurrency: "USD" | "INR" = pricing.display_currency,
): {
  daily_spend: number;
  monthly_spend: number;
  daily_limit: number;
  monthly_limit: number;
  daily_ratio: number;
  monthly_ratio: number;
  near_limit: boolean;
  over_limit: boolean;
  display_currency: "USD" | "INR";
  daily_spend_inr: number;
  monthly_spend_inr: number;
  daily_limit_inr: number;
  monthly_limit_inr: number;
} {
  const reset = resetBudgetIfNeeded(state);
  const dailyRatio = reset.daily_spend / cfg.daily_limit_usd;
  const monthlyRatio = reset.monthly_spend / cfg.monthly_limit_usd;
  const rate = pricing.usd_to_inr_rate;
  return {
    daily_spend: displayCurrency === "USD" ? reset.daily_spend : reset.daily_spend * rate,
    monthly_spend: displayCurrency === "USD" ? reset.monthly_spend : reset.monthly_spend * rate,
    daily_limit: displayCurrency === "USD" ? cfg.daily_limit_usd : cfg.daily_limit_usd * rate,
    monthly_limit: displayCurrency === "USD" ? cfg.monthly_limit_usd : cfg.monthly_limit_usd * rate,
    daily_ratio: dailyRatio,
    monthly_ratio: monthlyRatio,
    near_limit: Math.max(dailyRatio, monthlyRatio) >= cfg.near_limit_threshold,
    over_limit: dailyRatio >= 1 || monthlyRatio >= 1,
    display_currency: displayCurrency,
    daily_spend_inr: reset.daily_spend * rate,
    monthly_spend_inr: reset.monthly_spend * rate,
    daily_limit_inr: cfg.daily_limit_usd * rate,
    monthly_limit_inr: cfg.monthly_limit_usd * rate,
  };
}
