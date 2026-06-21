import { describe, test, expect } from "bun:test";
import { evaluateRules, applyRuleResult } from "../src/routing-rules.js";
import type { RoutingRule, TraitWeights } from "../src/types.js";

function baseWeights(overrides: Partial<TraitWeights> = {}): TraitWeights {
  return {
    long_context: 0.3,
    deep_reasoning: 0.5,
    tool_use_accuracy: 0.5,
    speed_priority: 0.5,
    frontend_taste: 0.3,
    cost_efficiency: 0.5,
    ...overrides,
  };
}

const sampleRules: RoutingRule[] = [
  {
    name: "opus for architecture",
    when: { task_contains: ["architecture", "system design"] },
    then: { prefer: "anthropic/claude-opus-4-7", boost: { deep_reasoning: 0.3 } },
  },
  {
    name: "flash for simple questions",
    when: { task_matches: "^(what is|how to|explain).{0,50}\\?$", max_length: 80 },
    then: { prefer: "google/gemini-flash-latest", boost: { cost_efficiency: 0.4 } },
  },
  {
    name: "exclude hermes for frontend",
    when: { task_contains: ["react", "css"] },
    then: { exclude: ["openrouter/hermes-3-llama-3.1-405b"] },
  },
];

describe("routing-rules", () => {
  describe("evaluateRules", () => {
    test("matches task_contains rule", () => {
      const result = evaluateRules(sampleRules, "design the system architecture for this app");
      expect(result).not.toBeNull();
      expect(result!.matched_rule).toBe("opus for architecture");
      expect(result!.action.prefer).toBe("anthropic/claude-opus-4-7");
    });

    test("matches regex rule with max_length", () => {
      const result = evaluateRules(sampleRules, "what is TypeScript?");
      expect(result).not.toBeNull();
      expect(result!.matched_rule).toBe("flash for simple questions");
    });

    test("rejects regex when text too long", () => {
      const longQuestion = "what is " + "a".repeat(80) + "?";
      const result = evaluateRules(sampleRules, longQuestion);
      expect(result).toBeNull();
    });

    test("matches exclude rule", () => {
      const result = evaluateRules(sampleRules, "create a react component with css");
      expect(result).not.toBeNull();
      expect(result!.action.exclude).toContain("openrouter/hermes-3-llama-3.1-405b");
    });

    test("returns null when no rules match", () => {
      const result = evaluateRules(sampleRules, "write a database query");
      expect(result).toBeNull();
    });

    test("returns null for empty rules", () => {
      expect(evaluateRules([], "any task")).toBeNull();
    });

    test("first matching rule wins", () => {
      const result = evaluateRules(sampleRules, "architecture with react and css");
      expect(result!.matched_rule).toBe("opus for architecture");
    });
  });

  describe("applyRuleResult", () => {
    test("applies prefer as pinnedModelId", () => {
      const result = { matched_rule: "test", action: { prefer: "model-a" } };
      const applied = applyRuleResult(result, baseWeights());
      expect(applied.pinnedModelId).toBe("model-a");
    });

    test("applies boost to weights", () => {
      const result = { matched_rule: "test", action: { boost: { deep_reasoning: 0.3 } as Partial<TraitWeights> } };
      const applied = applyRuleResult(result, baseWeights({ deep_reasoning: 0.5 }));
      expect(applied.weights.deep_reasoning).toBe(0.8);
    });

    test("caps boosted weights at 1.0", () => {
      const result = { matched_rule: "test", action: { boost: { deep_reasoning: 0.8 } as Partial<TraitWeights> } };
      const applied = applyRuleResult(result, baseWeights({ deep_reasoning: 0.5 }));
      expect(applied.weights.deep_reasoning).toBe(1);
    });

    test("passes through exclude list", () => {
      const result = { matched_rule: "test", action: { exclude: ["model-x", "model-y"] } };
      const applied = applyRuleResult(result, baseWeights());
      expect(applied.excludedModels).toEqual(["model-x", "model-y"]);
    });
  });
});
