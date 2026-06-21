import { describe, test, expect } from "bun:test";
import {
  detectConflicts,
  resolveConflict,
  autoResolveConflicts,
  formatConflictWarning,
} from "../src/conflict-detection.js";
import type { TraitWeights, TraitConflict, WorkspaceContext } from "../src/types.js";

function baseWeights(overrides: Partial<TraitWeights> = {}): TraitWeights {
  return {
    long_context: 0.3,
    deep_reasoning: 0.3,
    tool_use_accuracy: 0.3,
    speed_priority: 0.3,
    frontend_taste: 0.3,
    cost_efficiency: 0.3,
    ...overrides,
  };
}

describe("conflict-detection", () => {
  describe("detectConflicts", () => {
    test("returns empty when no high-weight conflicts", () => {
      const conflicts = detectConflicts(baseWeights());
      expect(conflicts).toEqual([]);
    });

    test("detects deep_reasoning vs speed_priority conflict", () => {
      const weights = baseWeights({ deep_reasoning: 0.85, speed_priority: 0.82 });
      const conflicts = detectConflicts(weights);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0]!.trait_a).toBe("deep_reasoning");
      expect(conflicts[0]!.trait_b).toBe("speed_priority");
    });

    test("classifies severe conflicts (avg > 0.9)", () => {
      const weights = baseWeights({ deep_reasoning: 0.95, speed_priority: 0.92 });
      const conflicts = detectConflicts(weights);
      expect(conflicts[0]!.severity).toBe("severe");
    });

    test("classifies moderate conflicts (avg > 0.8)", () => {
      const weights = baseWeights({ deep_reasoning: 0.85, speed_priority: 0.82 });
      const conflicts = detectConflicts(weights);
      expect(conflicts[0]!.severity).toBe("moderate");
    });

    test("classifies mild conflicts (avg > 0.7)", () => {
      const weights = baseWeights({ deep_reasoning: 0.75, speed_priority: 0.78 });
      const conflicts = detectConflicts(weights);
      expect(conflicts[0]!.severity).toBe("mild");
    });

    test("detects multiple conflicts simultaneously", () => {
      const weights = baseWeights({
        deep_reasoning: 0.85,
        speed_priority: 0.82,
        long_context: 0.8,
        cost_efficiency: 0.78,
      });
      const conflicts = detectConflicts(weights);
      expect(conflicts.length).toBe(2);
    });

    test("no conflict when only one trait is high", () => {
      const weights = baseWeights({ deep_reasoning: 0.9, speed_priority: 0.3 });
      const conflicts = detectConflicts(weights);
      expect(conflicts).toEqual([]);
    });
  });

  describe("resolveConflict", () => {
    test("balance strategy averages both traits", () => {
      const weights = baseWeights({ deep_reasoning: 0.9, speed_priority: 0.8 });
      const conflict: TraitConflict = {
        trait_a: "deep_reasoning",
        trait_b: "speed_priority",
        severity: "moderate",
        resolution: "balance",
        description: "thorough vs fast",
      };
      const resolved = resolveConflict(conflict, weights, "balance");
      expect(resolved.deep_reasoning).toBeCloseTo(0.85, 5);
      expect(resolved.speed_priority).toBeCloseTo(0.85, 5);
    });

    test("favor_a reduces trait_b", () => {
      const weights = baseWeights({ deep_reasoning: 0.9, speed_priority: 0.8 });
      const conflict: TraitConflict = {
        trait_a: "deep_reasoning",
        trait_b: "speed_priority",
        severity: "moderate",
        resolution: "favor_a",
        description: "thorough vs fast",
      };
      const resolved = resolveConflict(conflict, weights, "favor_a");
      expect(resolved.deep_reasoning).toBeCloseTo(0.9, 5);
      expect(resolved.speed_priority).toBeCloseTo(0.6, 5);
    });

    test("favor_b reduces trait_a", () => {
      const weights = baseWeights({ deep_reasoning: 0.9, speed_priority: 0.8 });
      const conflict: TraitConflict = {
        trait_a: "deep_reasoning",
        trait_b: "speed_priority",
        severity: "moderate",
        resolution: "favor_b",
        description: "thorough vs fast",
      };
      const resolved = resolveConflict(conflict, weights, "favor_b");
      expect(resolved.deep_reasoning).toBe(0.7);
      expect(resolved.speed_priority).toBe(0.8);
    });
  });

  describe("autoResolveConflicts", () => {
    test("favors deep_reasoning when workspace has tests", () => {
      const weights = baseWeights({ deep_reasoning: 0.9, speed_priority: 0.85 });
      const conflicts = detectConflicts(weights);
      const ctx: WorkspaceContext = {
        languages: {}, total_files: 0, repo_detected: false,
        has_tests: true, has_frontend: false, has_backend: false, summary: "",
      };
      const resolved = autoResolveConflicts(conflicts, weights, ctx);
      expect(resolved.speed_priority).toBeLessThan(weights.speed_priority);
    });

    test("favors frontend_taste when workspace has frontend", () => {
      const weights = baseWeights({ frontend_taste: 0.85, deep_reasoning: 0.82 });
      const conflicts = detectConflicts(weights);
      const ctx: WorkspaceContext = {
        languages: {}, total_files: 0, repo_detected: false,
        has_tests: false, has_frontend: true, has_backend: false, summary: "",
      };
      const resolved = autoResolveConflicts(conflicts, weights, ctx);
      expect(resolved.deep_reasoning).toBeLessThan(weights.deep_reasoning);
    });
  });

  describe("formatConflictWarning", () => {
    test("formats conflict warning string", () => {
      const conflicts = detectConflicts(
        baseWeights({ deep_reasoning: 0.85, speed_priority: 0.82 }),
      );
      const warning = formatConflictWarning(conflicts);
      expect(warning).toContain("[CONFLICT]");
      expect(warning).toContain("deep_reasoning");
      expect(warning).toContain("speed_priority");
    });
  });
});
