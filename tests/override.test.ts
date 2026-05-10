import { describe, test, expect } from "bun:test";
import { createOverrideStore, handleModelCommand, handleRouteCommand } from "../src/override.js";
import type { Catalog, ClassifierResult, RouteDecision } from "../src/types.js";

const catalog: Catalog = {
  models: [
    { id: "anthropic/claude-opus-4-7", provider: "anthropic", scores: { long_context: 10, deep_reasoning: 10, tool_use_accuracy: 9, speed_priority: 4, frontend_taste: 8, cost_efficiency: 3 } },
    { id: "google/gemini-flash", provider: "google", scores: { long_context: 8, deep_reasoning: 6, tool_use_accuracy: 6, speed_priority: 10, frontend_taste: 6, cost_efficiency: 10 } },
  ],
};

describe("override store", () => {
  test("starts with no pin", () => {
    const s = createOverrideStore();
    expect(s.get().pinned_model_id).toBeNull();
  });

  test("/model <id> pins the model", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model google/gemini-flash", s, catalog);
    expect(s.get().pinned_model_id).toBe("google/gemini-flash");
    expect(msg).toMatch(/pinned/i);
  });

  test("/model auto clears pin", () => {
    const s = createOverrideStore();
    handleModelCommand("/model google/gemini-flash", s, catalog);
    const msg = handleModelCommand("/model auto", s, catalog);
    expect(s.get().pinned_model_id).toBeNull();
    expect(msg).toMatch(/auto/i);
  });

  test("/model with unknown id returns error message", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model fake/model", s, catalog);
    expect(s.get().pinned_model_id).toBeNull();
    expect(msg).toMatch(/not in catalog/i);
  });

  test("/model with no args lists available models", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model", s, catalog);
    expect(msg).toContain("anthropic/claude-opus-4-7");
    expect(msg).toContain("google/gemini-flash");
  });
});

describe("handleRouteCommand", () => {
  test("explains full route decisions with candidates and skipped models", () => {
    const classifier: ClassifierResult = {
      weights: {
        long_context: 0.9, deep_reasoning: 0.3, tool_use_accuracy: 0.7,
        speed_priority: 0.2, frontend_taste: 0.1, cost_efficiency: 0.4,
      },
      fallback: true,
      raw: "{...}",
    };
    const decision: RouteDecision = {
      picked: catalog.models[1]!,
      top_traits: ["long_context", "tool_use_accuracy"],
      ranking: [
        { model: catalog.models[0]!, score: 8.75 },
        { model: catalog.models[1]!, score: 7.25 },
      ],
      classifier,
      override_source: "fallback",
      unavailable_exhausted: true,
    };

    const msg = handleRouteCommand({
      decision,
      unavailable: new Set(["anthropic/claude-opus-4-7"]),
    });

    expect(msg).toContain("Chosen model: google/gemini-flash");
    expect(msg).toContain("Top traits: long_context, tool_use_accuracy");
    expect(msg).toContain("anthropic/claude-opus-4-7: 8.75");
    expect(msg).toContain("google/gemini-flash: 7.25");
    expect(msg).toContain("Skipped/unavailable: anthropic/claude-opus-4-7");
    expect(msg).toContain("Fallback: yes");
    expect(msg).toContain("Unavailable exhausted: yes");
    expect(msg).toContain("Classifier fallback: yes");
    expect(msg).toContain("raw: {...}");
  });

  test("shows last classifier output", () => {
    const last: ClassifierResult = {
      weights: {
        long_context: 0.9, deep_reasoning: 0.3, tool_use_accuracy: 0.7,
        speed_priority: 0.2, frontend_taste: 0.1, cost_efficiency: 0.4,
      },
      fallback: false,
      raw: "{...}",
    };
    const msg = handleRouteCommand(last);
    expect(msg).toContain("long_context");
    expect(msg).toContain("0.9");
  });

  test("handles no prior classification", () => {
    const msg = handleRouteCommand(null);
    expect(msg).toMatch(/no.*route/i);
  });
});
