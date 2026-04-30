import { describe, test, expect } from "bun:test";
import {
  recordRegenerationHit,
  getRegenerationPenalty,
  getRegenerationCount,
} from "../src/regeneration-tracker.js";
import type { RegenerationRecord } from "../src/types.js";

function rec(
  modelId: string,
  task: string,
  count: number = 1,
  offsetMs: number = 0,
): RegenerationRecord {
  return {
    model_id: modelId,
    task_excerpt: task.slice(0, 120),
    count,
    last_seen: Date.now() + offsetMs,
  };
}

describe("regeneration-tracker", () => {
  describe("recordRegenerationHit", () => {
    test("creates first record for a task", () => {
      const result = recordRegenerationHit([], "claude", "Fix the login bug in auth module");
      expect(result).toHaveLength(1);
      expect(result[0]!.model_id).toBe("claude");
      expect(result[0]!.count).toBe(1);
    });

    test("increments count for similar task on same model", () => {
      const existing = recordRegenerationHit([], "claude", "Fix the login bug in auth module");
      const result = recordRegenerationHit(existing, "claude", "Fix login bug in auth module");
      expect(result).toHaveLength(1);
      expect(result[0]!.count).toBe(2);
    });

    test("same task but fully different text creates new entry", () => {
      const existing = recordRegenerationHit([], "claude", "Fix the login bug in auth module");
      const result = recordRegenerationHit(existing, "claude", "How many golf balls fit inside a jetta");
      expect(result).toHaveLength(2);
      expect(result[0]!.count).toBe(1);
    });

    test("same task on different model creates separate entry", () => {
      const existing = recordRegenerationHit([], "claude", "Fix the login bug in auth module");
      const result = recordRegenerationHit(existing, "gpt", "Fix the login bug in auth module");
      expect(result).toHaveLength(2);
      expect(result[0]!.model_id === "gpt" || result[1]!.model_id === "gpt").toBe(true);
    });

    test("caps records at 100", () => {
      let records: RegenerationRecord[] = [];
      for (let i = 0; i < 110; i++) {
        records = recordRegenerationHit(records, "model", `Unique task number ${i}`);
      }
      expect(records.length).toBeLessThanOrEqual(100);
    });

    test("trims task excerpt to 120 chars", () => {
      const longTask = "x".repeat(300);
      const records = recordRegenerationHit([], "claude", longTask);
      expect(records[0]!.task_excerpt.length).toBeLessThanOrEqual(120);
    });
  });

  describe("getRegenerationPenalty", () => {
    test("returns 0 for unknown task", () => {
      expect(getRegenerationPenalty([], "claude", "some task")).toBe(0);
    });

    test("returns 0.1 for first regeneration (count=2)", () => {
      let records = recordRegenerationHit([], "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module please");
      const penalty = getRegenerationPenalty(records, "claude", "Write comprehensive unit tests for the auth module");
      expect(penalty).toBe(0.1);
    });

    test("returns 0.2 for second regeneration (count=3)", () => {
      let records = recordRegenerationHit([], "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module quickly");
      const penalty = getRegenerationPenalty(records, "claude", "Write comprehensive unit tests for the auth module");
      expect(penalty).toBe(0.2);
    });

    test("returns 0.3 for third regeneration (count=4)", () => {
      let records = recordRegenerationHit([], "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module");
      records = recordRegenerationHit(records, "claude", "Write comprehensive unit tests for the auth module now");
      const penalty = getRegenerationPenalty(records, "claude", "Write comprehensive unit tests for the auth module");
      expect(penalty).toBe(0.3);
    });

    test("returns 0.3 for 4+ regenerations", () => {
      let records = recordRegenerationHit([], "claude", "Write tests for auth module");
      records = recordRegenerationHit(records, "claude", "Write tests for auth module");
      records = recordRegenerationHit(records, "claude", "Write tests for auth module");
      records = recordRegenerationHit(records, "claude", "Write tests for auth module");
      records = recordRegenerationHit(records, "claude", "Write tests for auth module");
      const penalty = getRegenerationPenalty(records, "claude", "Write tests for auth module");
      expect(penalty).toBe(0.3);
    });

    test("different model not affected", () => {
      let records = recordRegenerationHit([], "claude", "Write tests");
      records = recordRegenerationHit(records, "claude", "Write tests");
      records = recordRegenerationHit(records, "claude", "Write tests");
      const penalty = getRegenerationPenalty(records, "gpt", "Write tests");
      expect(penalty).toBe(0);
    });
  });

  describe("getRegenerationCount", () => {
    test("returns 0 for unknown task", () => {
      expect(getRegenerationCount([], "claude", "task")).toBe(0);
    });

    test("returns correct count after hits", () => {
      let records = recordRegenerationHit([], "claude", "Fix the login bug");
      records = recordRegenerationHit(records, "claude", "Fix login bug");
      records = recordRegenerationHit(records, "claude", "Fix the login bug again");
      expect(getRegenerationCount(records, "claude", "Fix login bug")).toBe(3);
    });
  });

  describe("jaccard similarity edge cases", () => {
    test("single-word tasks match partially", () => {
      let records = recordRegenerationHit([], "claude", "refactor");
      records = recordRegenerationHit(records, "claude", "refactor");
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
