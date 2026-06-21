import { describe, test, expect } from "bun:test";
import {
  createEmptyBudgetState,
  resetBudgetIfNeeded,
  estimateTaskCost,
  recordSpend,
  getBudgetPenalty,
  getBudgetStatus,
} from "../src/budget.js";
import type { ModelEntry } from "../src/types.js";

function makeModel(costIn?: number, costOut?: number): ModelEntry {
  return {
    id: "test/model",
    provider: "openai",
    scores: {
      long_context: 5,
      deep_reasoning: 5,
      tool_use_accuracy: 5,
      speed_priority: 5,
      frontend_taste: 5,
      cost_efficiency: 5,
    },
    cost_per_1k_input: costIn,
    cost_per_1k_output: costOut,
  };
}

describe("budget", () => {
  test("createEmptyBudgetState initializes with zero spend", () => {
    const state = createEmptyBudgetState();
    expect(state.daily_spend).toBe(0);
    expect(state.monthly_spend).toBe(0);
    expect(state.records).toEqual([]);
  });

  test("resetBudgetIfNeeded resets daily spend on new day", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 10;
    state.monthly_spend = 20;
    state.last_reset_day = "2000-01-01";
    state.last_reset_month = new Date().toISOString().slice(0, 7);

    const reset = resetBudgetIfNeeded(state);
    expect(reset.daily_spend).toBe(0);
    expect(reset.monthly_spend).toBe(20);
  });

  test("resetBudgetIfNeeded resets monthly spend on new month", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 10;
    state.monthly_spend = 20;
    state.last_reset_day = new Date().toISOString().slice(0, 10);
    state.last_reset_month = "2000-01";

    const reset = resetBudgetIfNeeded(state);
    // daily is preserved because it's the same day
    expect(reset.daily_spend).toBe(10);
    expect(reset.monthly_spend).toBe(0);
  });

  test("estimateTaskCost with no cost fields returns default", () => {
    const model = makeModel();
    expect(estimateTaskCost(model)).toBe(0.001);
  });

  test("estimateTaskCost uses model cost_per_1k_input when no actual tokens", () => {
    const model = makeModel(0.01, 0.03);
    expect(estimateTaskCost(model)).toBe(0.01);
  });

  test("estimateTaskCost uses custom token counts", () => {
    const model = makeModel(0.01, 0.03);
    expect(estimateTaskCost(model, 1000, 500)).toBe(1 * 0.01 + 0.5 * 0.03);
  });

  test("recordSpend accumulates daily and monthly spend", () => {
    let state = createEmptyBudgetState();
    const model = makeModel(0.01, 0.03);
    const cost = estimateTaskCost(model);

    state = recordSpend(state, model, cost, "test task");
    expect(state.daily_spend).toBe(cost);
    expect(state.monthly_spend).toBe(cost);
    expect(state.records).toHaveLength(1);
    expect(state.records[0]!.model_id).toBe("test/model");
  });

  test("getBudgetPenalty returns 0 when under budget", () => {
    const state = createEmptyBudgetState();
    const penalty = getBudgetPenalty(state);
    expect(penalty).toBe(0);
  });

  test("getBudgetPenalty returns near-limit penalty when approaching daily limit", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 45; // near 50 default limit
    const penalty = getBudgetPenalty(state);
    expect(penalty).toBe(0.15);
  });

  test("getBudgetPenalty returns over-limit penalty when exceeding budget", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 60; // over 50 default limit
    const penalty = getBudgetPenalty(state);
    expect(penalty).toBe(0.5);
  });

  test("getBudgetStatus returns correct spend and flags", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 40;
    state.monthly_spend = 100;
    const status = getBudgetStatus(state);
    expect(status.daily_spend).toBe(40);
    expect(status.monthly_spend).toBe(100);
    expect(status.daily_limit).toBe(50);
    expect(status.monthly_limit).toBe(500);
    expect(status.near_limit).toBe(true);
    expect(status.over_limit).toBe(false);
  });

  test("getBudgetStatus flags over_limit when daily exceeds limit", () => {
    const state = createEmptyBudgetState();
    state.daily_spend = 60;
    const status = getBudgetStatus(state);
    expect(status.over_limit).toBe(true);
  });
});
