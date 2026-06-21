import { describe, test, expect } from "bun:test";
import { createHistoryBuffer, computeMetrics, buildHealthSnapshots } from "../src/dashboard.js";
import type { RoutingHistoryEntry, TraitName } from "../src/types.js";

function makeEntry(overrides: Partial<RoutingHistoryEntry> = {}): RoutingHistoryEntry {
  return {
    timestamp: Date.now(),
    task_excerpt: "test task",
    picked_model: "anthropic/claude-sonnet-4-6",
    score: 8.5,
    top_traits: ["deep_reasoning", "tool_use_accuracy"] as TraitName[],
    was_fallback: false,
    was_ab_test: false,
    ...overrides,
  };
}

describe("dashboard", () => {
  describe("createHistoryBuffer", () => {
    test("pushes and retrieves entries", () => {
      const buffer = createHistoryBuffer(10);
      buffer.push(makeEntry());
      buffer.push(makeEntry({ picked_model: "google/gemini-flash-latest" }));
      expect(buffer.getAll().length).toBe(2);
    });

    test("newest entries first", () => {
      const buffer = createHistoryBuffer(10);
      buffer.push(makeEntry({ picked_model: "first" }));
      buffer.push(makeEntry({ picked_model: "second" }));
      expect(buffer.getAll()[0]!.picked_model).toBe("second");
    });

    test("respects max size", () => {
      const buffer = createHistoryBuffer(3);
      for (let i = 0; i < 5; i++) buffer.push(makeEntry());
      expect(buffer.getAll().length).toBe(3);
    });

    test("clear empties buffer", () => {
      const buffer = createHistoryBuffer(10);
      buffer.push(makeEntry());
      buffer.clear();
      expect(buffer.getAll()).toEqual([]);
    });
  });

  describe("computeMetrics", () => {
    test("computes correct totals", () => {
      const history = [
        makeEntry({ cost_usd: 0.01, latency_ms: 1000, success: true }),
        makeEntry({ cost_usd: 0.02, latency_ms: 2000, success: false }),
      ];
      const metrics = computeMetrics(history, Date.now() - 60000);
      expect(metrics.total_tasks).toBe(2);
      expect(metrics.success_rate).toBe(0.5);
      expect(metrics.avg_latency_ms).toBe(1500);
      expect(metrics.total_spend_usd).toBeCloseTo(0.03, 4);
    });

    test("tracks model usage", () => {
      const history = [
        makeEntry({ picked_model: "model-a" }),
        makeEntry({ picked_model: "model-a" }),
        makeEntry({ picked_model: "model-b" }),
      ];
      const metrics = computeMetrics(history, Date.now());
      expect(metrics.model_usage["model-a"]).toBe(2);
      expect(metrics.model_usage["model-b"]).toBe(1);
    });

    test("tracks trait distribution", () => {
      const history = [
        makeEntry({ top_traits: ["deep_reasoning"] as TraitName[] }),
        makeEntry({ top_traits: ["deep_reasoning", "speed_priority"] as TraitName[] }),
      ];
      const metrics = computeMetrics(history, Date.now());
      expect(metrics.trait_distribution["deep_reasoning"]).toBe(2);
      expect(metrics.trait_distribution["speed_priority"]).toBe(1);
    });

    test("handles empty history", () => {
      const metrics = computeMetrics([], Date.now());
      expect(metrics.total_tasks).toBe(0);
      expect(metrics.success_rate).toBe(0);
    });
  });

  describe("buildHealthSnapshots", () => {
    test("builds snapshots from health records", () => {
      const records = [{
        model_id: "test-model",
        provider: "anthropic",
        health_score: 0.95,
        success_count: 19,
        error_count: 1,
        latency_samples: [1000, 2000],
      }];
      const unavailable = new Set<string>();
      const snapshots = buildHealthSnapshots(records, unavailable);
      expect(snapshots.length).toBe(1);
      expect(snapshots[0]!.health_score).toBe(0.95);
      expect(snapshots[0]!.success_rate).toBe(0.95);
      expect(snapshots[0]!.avg_latency_ms).toBe(1500);
      expect(snapshots[0]!.is_unavailable).toBe(false);
    });

    test("marks unavailable models", () => {
      const records = [{
        model_id: "test-model",
        provider: "anthropic",
        health_score: 0.5,
        success_count: 5,
        error_count: 5,
        latency_samples: [],
      }];
      const unavailable = new Set(["test-model"]);
      const snapshots = buildHealthSnapshots(records, unavailable);
      expect(snapshots[0]!.is_unavailable).toBe(true);
    });
  });
});
