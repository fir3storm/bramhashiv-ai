import { describe, test, expect } from "bun:test";
import {
  shouldBenchmark,
  computeScoreDelta,
  analyzeResults,
  BENCHMARK_TASKS,
} from "../src/benchmarker.js";
import type { BenchmarkResult, BenchmarkTask, Catalog, ModelEntry } from "../src/types.js";

// Enable benchmark feature for tests
process.env.BRAMHASHIV_BENCHMARK_ENABLED = "1";

function makeModel(id: string): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 },
  };
}

describe("benchmarker", () => {
  describe("shouldBenchmark", () => {
    test("returns true when never benchmarked", () => {
      expect(shouldBenchmark(0, 86400000)).toBe(true);
    });

    test("returns false when benchmarked recently", () => {
      expect(shouldBenchmark(Date.now(), 86400000)).toBe(false);
    });

    test("returns true when interval has passed", () => {
      expect(shouldBenchmark(Date.now() - 90000000, 86400000)).toBe(true);
    });
  });

  describe("computeScoreDelta", () => {
    test("returns negative delta for failed task", () => {
      const result: BenchmarkResult = {
        model_id: "test", task_name: "speed_ping",
        latency_ms: 5000, success: false, timestamp: Date.now(),
      };
      const task = BENCHMARK_TASKS[0]!;
      expect(computeScoreDelta(result, task, 8)).toBe(-0.5);
    });

    test("returns positive delta for fast success", () => {
      const result: BenchmarkResult = {
        model_id: "test", task_name: "speed_ping",
        latency_ms: 1000, success: true, timestamp: Date.now(),
      };
      const task = BENCHMARK_TASKS[0]!;
      expect(computeScoreDelta(result, task, 8)).toBeGreaterThan(0);
    });

    test("returns negative delta for slow success", () => {
      const result: BenchmarkResult = {
        model_id: "test", task_name: "speed_ping",
        latency_ms: 8000, success: true, timestamp: Date.now(),
      };
      const task = BENCHMARK_TASKS[0]!;
      expect(computeScoreDelta(result, task, 8)).toBeLessThan(0);
    });
  });

  describe("analyzeResults", () => {
    test("computes benchmark scores per model", () => {
      const catalog: Catalog = { models: [makeModel("model-a")] };
      const results: BenchmarkResult[] = [
        { model_id: "model-a", task_name: "speed_ping", latency_ms: 1000, success: true, timestamp: Date.now() },
        { model_id: "model-a", task_name: "code_gen", latency_ms: 5000, success: true, timestamp: Date.now() },
      ];
      const scores = analyzeResults(results, catalog);
      expect(scores.length).toBe(1);
      expect(scores[0]!.model_id).toBe("model-a");
      expect(scores[0]!.success_rate).toBe(1);
    });

    test("handles empty results", () => {
      const catalog: Catalog = { models: [makeModel("model-a")] };
      const scores = analyzeResults([], catalog);
      expect(scores).toEqual([]);
    });
  });

  describe("BENCHMARK_TASKS", () => {
    test("has at least 3 tasks", () => {
      expect(BENCHMARK_TASKS.length).toBeGreaterThanOrEqual(3);
    });

    test("all tasks have required fields", () => {
      for (const task of BENCHMARK_TASKS) {
        expect(task.name).toBeTruthy();
        expect(task.prompt).toBeTruthy();
        expect(task.max_expected_ms).toBeGreaterThan(0);
        expect(Object.keys(task.expected_traits).length).toBeGreaterThan(0);
      }
    });
  });
});
