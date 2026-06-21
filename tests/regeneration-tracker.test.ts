import { describe, test, expect } from "bun:test";
import { recordRegenerationHit, getRegenerationPenalty, getRegenerationCount } from "../src/regeneration-tracker.js";

describe("regeneration-tracker", () => {
  describe("recordRegenerationHit", () => {
    test("creates first record for a task", () => {
      const records = recordRegenerationHit([], "claude", "Fix the login bug");
      expect(records).toHaveLength(1);
      expect(records[0]!.count).toBe(1);
    });

    test("increments count for similar task on same model", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      expect(records).toHaveLength(1);
      expect(records[0]!.count).toBe(2);
    });

    test("same task but fully different text creates new entry", () => {
      let records = recordRegenerationHit([], "claude", "Fix bug");
      records = recordRegenerationHit(records, "claude", "Quicksort performance tuning");
      expect(records).toHaveLength(2);
      expect(records[0]!.count).toBe(1);
      expect(records[1]!.count).toBe(1);
    });

    test("same task on different model creates separate entry", () => {
      let records = recordRegenerationHit([], "claude", "Fix bug");
      records = recordRegenerationHit(records, "claude", "Fix bug");
      records = recordRegenerationHit(records, "gemini", "Fix bug");
      expect(records).toHaveLength(2);
    });

    test("caps records at 100", () => {
      let records: import("../src/types.js").RegenerationRecord[] = [];
      for (let i = 0; i < 150; i++) {
        records = recordRegenerationHit(records, "claude", `Task ${i} with unique text for fingerprinting`);
      }
      expect(records.length).toBeLessThanOrEqual(100);
    });

    test("trims task excerpt to 120 chars", () => {
      const long = "A".repeat(200);
      const records = recordRegenerationHit([], "claude", long);
      expect(records[0]!.task_excerpt.length).toBeLessThanOrEqual(120);
    });
  });

  describe("getRegenerationPenalty", () => {
    test("returns 0 for unknown task", () => {
      expect(getRegenerationPenalty([], "claude", "unknown")).toBe(0);
    });

    test("returns 0.1 for first regeneration (count=2)", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      expect(getRegenerationPenalty(records, "claude", "Refactor the authentication module to use dependency injection")).toBe(0.1);
    });

    test("returns 0.2 for second regeneration (count=3)", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module to use dependency injection");
      expect(getRegenerationPenalty(records, "claude", "Refactor the authentication module to use dependency injection")).toBe(0.2);
    });

    test("returns 0.3 for third regeneration (count=4)", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      expect(getRegenerationPenalty(records, "claude", "Refactor the authentication module to use dependency injection")).toBe(0.3);
    });

    test("returns 0.3 for 4+ regenerations", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      for (let i = 0; i < 5; i++) {
        records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      }
      expect(getRegenerationPenalty(records, "claude", "Refactor the authentication module to use dependency injection")).toBe(0.3);
    });

    test("different model not affected", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      expect(getRegenerationPenalty(records, "gemini", "Refactor the authentication module to use dependency injection")).toBe(0);
    });
  });

  describe("getRegenerationCount", () => {
    test("returns 0 for unknown task", () => {
      expect(getRegenerationCount([], "claude", "unknown")).toBe(0);
    });

    test("returns correct count after hits", () => {
      let records = recordRegenerationHit([], "claude", "Refactor the authentication module to use dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module using dependency injection");
      records = recordRegenerationHit(records, "claude", "Refactor the authentication module to use dependency injection");
      expect(getRegenerationCount(records, "claude", "Refactor the authentication module to use dependency injection")).toBe(3);
    });
  });

  describe("jaccard similarity edge cases", () => {
    test("single-word tasks match partially", () => {
      let records = recordRegenerationHit([], "claude", "fix");
      records = recordRegenerationHit(records, "claude", "fix");
      expect(records[0]!.count).toBe(2);
    });

    test("empty task creates valid entry", () => {
      const records = recordRegenerationHit([], "claude", "");
      expect(records).toHaveLength(1);
      expect(records[0]!.count).toBe(1);
    });

    test("whitespace-only task creates valid entry", () => {
      const records = recordRegenerationHit([], "claude", "   ");
      expect(records).toHaveLength(1);
    });
  });
});
