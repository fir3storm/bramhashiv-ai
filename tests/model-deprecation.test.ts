import { describe, test, expect } from "bun:test";
import {
  findDeprecatedModels,
  isPastEol,
  daysUntilEol,
  migrateModelState,
  scaleAdjustments,
  formatDeprecationWarning,
} from "../src/model-deprecation.js";
import type { Catalog, ModelEntry, ScoreAdjustment, HealthRecord } from "../src/types.js";

function makeModel(id: string, overrides: Partial<ModelEntry> = {}): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 },
    ...overrides,
  };
}

function makeCatalog(models: ModelEntry[]): Catalog {
  return { models };
}

describe("model-deprecation", () => {
  describe("findDeprecatedModels", () => {
    test("returns empty for catalog with no deprecated models", () => {
      const catalog = makeCatalog([makeModel("model-a")]);
      expect(findDeprecatedModels(catalog)).toEqual([]);
    });

    test("finds models with deprecated flag", () => {
      const catalog = makeCatalog([makeModel("model-a", { deprecated: true, successor: "model-b" })]);
      const notices = findDeprecatedModels(catalog);
      expect(notices.length).toBe(1);
      expect(notices[0]!.model_id).toBe("model-a");
      expect(notices[0]!.successor_id).toBe("model-b");
    });

    test("finds models with eol_date", () => {
      const catalog = makeCatalog([makeModel("model-a", { eol_date: "2026-12-01" })]);
      const notices = findDeprecatedModels(catalog);
      expect(notices.length).toBe(1);
    });
  });

  describe("isPastEol", () => {
    test("returns false for null", () => {
      expect(isPastEol(null)).toBe(false);
    });

    test("returns true for past date", () => {
      expect(isPastEol("2020-01-01")).toBe(true);
    });

    test("returns false for future date", () => {
      expect(isPastEol("2099-01-01")).toBe(false);
    });
  });

  describe("daysUntilEol", () => {
    test("returns null for null", () => {
      expect(daysUntilEol(null)).toBeNull();
    });

    test("returns negative for past date", () => {
      expect(daysUntilEol("2020-01-01")!).toBeLessThan(0);
    });

    test("returns positive for future date", () => {
      expect(daysUntilEol("2099-01-01")!).toBeGreaterThan(0);
    });
  });

  describe("scaleAdjustments", () => {
    test("scales adjustments proportionally", () => {
      const from = makeModel("old", { scores: { long_context: 4, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 } });
      const to = makeModel("new", { scores: { long_context: 8, deep_reasoning: 8, tool_use_accuracy: 8, speed_priority: 8, frontend_taste: 8, cost_efficiency: 8 } });
      const adj: ScoreAdjustment[] = [{ model_id: "old", trait: "long_context", delta: 1.0 }];
      const scaled = scaleAdjustments(from, to, adj);
      expect(scaled[0]!.model_id).toBe("new");
      expect(scaled[0]!.delta).toBe(2.0);
    });

    test("handles missing models gracefully", () => {
      const from = makeModel("old");
      const to = makeModel("new");
      const adj: ScoreAdjustment[] = [{ model_id: "other", trait: "long_context", delta: 1.0 }];
      const scaled = scaleAdjustments(from, to, adj);
      expect(scaled).toEqual([]);
    });
  });

  describe("migrateModelState", () => {
    test("migrates adjustments and health to successor", () => {
      const catalog = makeCatalog([
        makeModel("old", { deprecated: true, successor: "new" }),
        makeModel("new"),
      ]);
      const adj: ScoreAdjustment[] = [{ model_id: "old", trait: "deep_reasoning", delta: 0.5 }];
      const health: HealthRecord[] = [{
        provider: "anthropic", model_id: "old",
        latency_samples: [100], error_count: 0, success_count: 10,
        last_used: Date.now(), health_score: 0.95,
      }];
      const result = migrateModelState("old", "new", adj, health, catalog);
      expect(result.from_model).toBe("old");
      expect(result.to_model).toBe("new");
      expect(result.migrated_adjustments.length).toBe(1);
      expect(result.migrated_health?.model_id).toBe("new");
    });

    test("returns empty result when models not found", () => {
      const catalog = makeCatalog([]);
      const result = migrateModelState("missing", "also-missing", [], [], catalog);
      expect(result.migrated_adjustments).toEqual([]);
      expect(result.migrated_health).toBeNull();
    });
  });

  describe("formatDeprecationWarning", () => {
    test("includes successor in message", () => {
      const warning = formatDeprecationWarning({
        model_id: "old",
        successor_id: "new",
        eol_date: "2026-12-01",
        migrated: false,
      });
      expect(warning).toContain("[DEPRECATION]");
      expect(warning).toContain("old");
      expect(warning).toContain("new");
      expect(warning).toContain("2026-12-01");
    });
  });
});
