import { describe, test, expect } from "bun:test";
import { runRouterPipeline } from "../src/pipeline.js";
import type { Catalog } from "../src/types.js";

function mockRunner(response: string) {
  return async () => response;
}

const catalog: Catalog = {
  models: [
    {
      id: "anthropic/claude-opus-4-7",
      provider: "anthropic",
      scores: { long_context: 10, deep_reasoning: 10, tool_use_accuracy: 9, speed_priority: 4, frontend_taste: 8, cost_efficiency: 3 },
    },
    {
      id: "google/gemini-flash",
      provider: "google",
      scores: { long_context: 8, deep_reasoning: 6, tool_use_accuracy: 6, speed_priority: 10, frontend_taste: 6, cost_efficiency: 10 },
    },
  ],
};

describe("runRouterPipeline", () => {
  test("runs classifier and picks best model when no pin", async () => {
    const runner = mockRunner(JSON.stringify({
      long_context: 1, deep_reasoning: 1, tool_use_accuracy: 1,
      speed_priority: 0, frontend_taste: 0, cost_efficiency: 0,
    }));
    const { decision, classifier } = await runRouterPipeline({
      text: "deep multi-file refactor",
      catalog,
      pinnedModelId: null,
      unavailable: new Set(),
      runner,
    });
    expect(classifier.fallback).toBe(false);
    expect(decision.picked.id).toBe("anthropic/claude-opus-4-7");
  });

  test("skips classifier when pinned and honours pin", async () => {
    let classifierCalled = false;
    const runner = async () => {
      classifierCalled = true;
      return "{}";
    };
    const { decision, classifier } = await runRouterPipeline({
      text: "some task",
      catalog,
      pinnedModelId: "google/gemini-flash",
      unavailable: new Set(),
      runner,
    });
    expect(classifierCalled).toBe(false);
    expect(classifier.fallback).toBe(true);
    expect(decision.picked.id).toBe("google/gemini-flash");
    expect(decision.override_source).toBe("user");
  });

  test("skips classifier when no runner and uses neutral weights", async () => {
    const { decision, classifier } = await runRouterPipeline({
      text: "anything",
      catalog,
      pinnedModelId: null,
      unavailable: new Set(),
      runner: null,
    });
    expect(classifier.fallback).toBe(true);
    expect(decision.picked).toBeDefined();
  });

  test("rate-limit fallback picks next-ranked", async () => {
    const runner = mockRunner(JSON.stringify({
      long_context: 1, deep_reasoning: 1, tool_use_accuracy: 1,
      speed_priority: 0, frontend_taste: 0, cost_efficiency: 0,
    }));
    const { decision } = await runRouterPipeline({
      text: "task",
      catalog,
      pinnedModelId: null,
      unavailable: new Set(["anthropic/claude-opus-4-7"]),
      runner,
    });
    expect(decision.picked.id).toBe("google/gemini-flash");
    expect(decision.override_source).toBe("fallback");
  });
});
