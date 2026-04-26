import { describe, test, expect } from "bun:test";
import { classify } from "../src/classifier.js";
import { TRAIT_NAMES } from "../src/types.js";

function mockRunner(response: string, delayMs = 0) {
  return async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return response;
  };
}

describe("classify", () => {
  test("parses valid JSON response", async () => {
    const json = JSON.stringify({
      long_context: 0.8,
      deep_reasoning: 0.6,
      tool_use_accuracy: 0.9,
      speed_priority: 0.2,
      frontend_taste: 0.1,
      cost_efficiency: 0.3,
    });
    const result = await classify("refactor this file", { runCompletion: mockRunner(json) });
    expect(result.fallback).toBe(false);
    expect(result.weights.long_context).toBe(0.8);
    expect(result.raw).toBe(json);
  });

  test("strips markdown code fences if present", async () => {
    const json = JSON.stringify({
      long_context: 0.5, deep_reasoning: 0.5, tool_use_accuracy: 0.5,
      speed_priority: 0.5, frontend_taste: 0.5, cost_efficiency: 0.5,
    });
    const wrapped = "```json\n" + json + "\n```";
    const result = await classify("task", { runCompletion: mockRunner(wrapped) });
    expect(result.fallback).toBe(false);
  });

  test("returns fallback weights when JSON is malformed", async () => {
    const result = await classify("task", { runCompletion: mockRunner("not json") });
    expect(result.fallback).toBe(true);
    for (const t of TRAIT_NAMES) {
      expect(result.weights[t]).toBeGreaterThanOrEqual(0);
      expect(result.weights[t]).toBeLessThanOrEqual(1);
    }
  });

  test("returns fallback on missing trait in response", async () => {
    const partial = JSON.stringify({ long_context: 0.5 });
    const result = await classify("task", { runCompletion: mockRunner(partial) });
    expect(result.fallback).toBe(true);
  });

  test("returns fallback on timeout", async () => {
    const result = await classify("task", {
      runCompletion: mockRunner("{}", 500),
      timeoutMs: 50,
    });
    expect(result.fallback).toBe(true);
  });

  test("clamps out-of-range weights to 0..1", async () => {
    const json = JSON.stringify({
      long_context: 1.5, deep_reasoning: -0.2, tool_use_accuracy: 0.5,
      speed_priority: 0.5, frontend_taste: 0.5, cost_efficiency: 0.5,
    });
    const result = await classify("task", { runCompletion: mockRunner(json) });
    expect(result.weights.long_context).toBe(1);
    expect(result.weights.deep_reasoning).toBe(0);
  });
});
