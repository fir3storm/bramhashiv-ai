import { describe, test, expect } from "bun:test";
import {
  createHealthRecord,
  recordLatency,
  recordSuccess,
  recordError,
  findOrCreateHealth,
  getHealthPenalty,
} from "../src/health-monitor.js";
import type { HealthRecord } from "../src/types.js";

function baseRecord(overrides: Partial<HealthRecord> = {}): HealthRecord {
  return {
    provider: "anthropic",
    model_id: "claude-sonnet",
    latency_samples: [],
    error_count: 0,
    success_count: 0,
    last_used: 0,
    health_score: 1.0,
    ...overrides,
  };
}

describe("health-monitor", () => {
  describe("createHealthRecord", () => {
    test("creates fresh record with score 1.0", () => {
      const r = createHealthRecord("anthropic", "claude-sonnet");
      expect(r.health_score).toBe(1.0);
      expect(r.provider).toBe("anthropic");
      expect(r.model_id).toBe("claude-sonnet");
      expect(r.latency_samples).toEqual([]);
      expect(r.error_count).toBe(0);
      expect(r.success_count).toBe(0);
    });
  });

  describe("recordLatency", () => {
    test("appends latency and updates health score", () => {
      const r = baseRecord();
      const updated = recordLatency(r, 5000);
      expect(updated.latency_samples).toEqual([5000]);
      expect(updated.last_used).toBeGreaterThan(0);
      expect(updated.health_score).toBe(1.0);
    });

    test("caps samples at 20", () => {
      let r = baseRecord();
      for (let i = 0; i < 25; i++) {
        r = recordLatency(r, 1000 * (i + 1));
      }
      expect(r.latency_samples.length).toBeLessThanOrEqual(20);
    });

    test("tracks higher latency as newer entries", () => {
      let r = baseRecord();
      r = recordLatency(r, 1000);
      r = recordLatency(r, 10000);
      r = recordLatency(r, 20000);
      expect(r.latency_samples.length).toBe(3);
    });
  });

  describe("recordSuccess", () => {
    test("increments success_count and records latency", () => {
      const r = baseRecord();
      const updated = recordSuccess(r, 3000);
      expect(updated.success_count).toBe(1);
      expect(updated.error_count).toBe(0);
      expect(updated.latency_samples).toEqual([3000]);
      expect(updated.health_score).toBeGreaterThanOrEqual(0.9);
    });

    test("multiple successes keep health high", () => {
      let r = baseRecord();
      for (let i = 0; i < 10; i++) {
        r = recordSuccess(r, 3000);
      }
      expect(r.success_count).toBe(10);
      expect(r.health_score).toBeGreaterThanOrEqual(0.95);
    });

    test("health degrades with very high latency", () => {
      let r = baseRecord({ success_count: 5, error_count: 0 });
      for (let i = 0; i < 10; i++) {
        r = recordSuccess(r, 50000);
      }
      expect(r.health_score).toBeLessThan(1.0);
      expect(r.health_score).toBeGreaterThan(0.4);
    });
  });

  describe("recordError", () => {
    test("increments error_count and lowers health", () => {
      const r = baseRecord({ success_count: 9 });
      const updated = recordError(r);
      expect(updated.error_count).toBe(1);
      expect(updated.success_count).toBe(9);
      expect(updated.health_score).toBeLessThan(1.0);
    });

    test("50% error rate gives health around 0.65", () => {
      let r = baseRecord();
      for (let i = 0; i < 5; i++) r = recordSuccess(r, 1000);
      for (let i = 0; i < 5; i++) r = recordError(r);
      expect(r.health_score).toBeGreaterThan(0.5);
      expect(r.health_score).toBeLessThan(0.8);
    });

    test("100% errors gives very low health", () => {
      let r = baseRecord();
      for (let i = 0; i < 5; i++) r = recordError(r);
      expect(r.health_score).toBeLessThan(0.4);
    });
  });

  describe("findOrCreateHealth", () => {
    test("returns existing record by index", () => {
      const existing = createHealthRecord("google", "gemini-flash");
      const result = findOrCreateHealth([existing], "google", "gemini-flash");
      expect(result.index).toBe(0);
      expect(result.record.model_id).toBe("gemini-flash");
    });

    test("creates new record when not found", () => {
      const result = findOrCreateHealth([], "openrouter", "llama-70b");
      expect(result.index).toBe(0);
      expect(result.record.model_id).toBe("llama-70b");
      expect(result.record.health_score).toBe(1.0);
      expect(result.records).toHaveLength(1);
    });

    test("appends new record after existing ones", () => {
      const a = createHealthRecord("a", "a-model");
      const b = createHealthRecord("b", "b-model");
      const result = findOrCreateHealth([a, b], "c", "c-model");
      expect(result.index).toBe(2);
      expect(result.records).toHaveLength(3);
    });
  });

  describe("getHealthPenalty", () => {
    test("zero penalty for health >= 0.8", () => {
      expect(getHealthPenalty(1.0)).toBe(0);
      expect(getHealthPenalty(0.8)).toBe(0);
    });

    test("5% penalty for health 0.5-0.8", () => {
      expect(getHealthPenalty(0.5)).toBe(0.05);
      expect(getHealthPenalty(0.79)).toBe(0.05);
    });

    test("12% penalty for health 0.3-0.5", () => {
      expect(getHealthPenalty(0.3)).toBe(0.12);
      expect(getHealthPenalty(0.49)).toBe(0.12);
    });

    test("25% penalty for health < 0.3", () => {
      expect(getHealthPenalty(0.29)).toBe(0.25);
      expect(getHealthPenalty(0)).toBe(0.25);
    });
  });

  describe("health score edge cases", () => {
    test("recordLatency on empty does not crash", () => {
      const r = baseRecord();
      const updated = recordLatency(r, 1000);
      expect(updated.latency_samples).toHaveLength(1);
    });

    test("health stays >= 0 even with massive errors and latency", () => {
      let r = baseRecord({ success_count: 0, error_count: 0 });
      for (let i = 0; i < 20; i++) {
        r = recordError(recordLatency(r, 60000));
      }
      expect(r.health_score).toBeGreaterThanOrEqual(0);
    });
  });
});
