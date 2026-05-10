import { describe, test, expect } from "bun:test";
import { parseCatalog, validateCatalog, validateCatalogModelIds } from "../src/catalog.js";

const VALID_YAML = `
models:
  - id: anthropic/claude-opus-4-7
    provider: anthropic
    scores:
      long_context: 10
      deep_reasoning: 10
      tool_use_accuracy: 9
      speed_priority: 4
      frontend_taste: 8
      cost_efficiency: 3
`;

describe("parseCatalog", () => {
  test("parses a valid catalog", () => {
    const cat = parseCatalog(VALID_YAML);
    expect(cat.models).toHaveLength(1);
    expect(cat.models[0]!.id).toBe("anthropic/claude-opus-4-7");
    expect(cat.models[0]!.scores.long_context).toBe(10);
  });

  test("throws on missing required trait", () => {
    const bad = `
models:
  - id: test/model
    provider: anthropic
    scores:
      long_context: 5
`;
    expect(() => parseCatalog(bad)).toThrow(/missing trait/i);
  });

  test("throws on out-of-range score", () => {
    const bad = VALID_YAML.replace("long_context: 10", "long_context: 15");
    expect(() => parseCatalog(bad)).toThrow(/0..10/);
  });

  test("throws on unknown provider", () => {
    const bad = VALID_YAML.replace("provider: anthropic", "provider: martian");
    expect(() => parseCatalog(bad)).toThrow(/provider/i);
  });

  test("allows optional hard_filters", () => {
    const yaml = VALID_YAML + `    hard_filters:\n      min_context: 200000\n`;
    const cat = parseCatalog(yaml);
    expect(cat.models[0]!.hard_filters?.min_context).toBe(200000);
  });
});

describe("validateCatalogModelIds", () => {
  test("returns no issues when providers and models are available", () => {
    const cat = parseCatalog(VALID_YAML);

    const issues = validateCatalogModelIds(cat, {
      anthropic: ["anthropic/claude-opus-4-7"],
    });

    expect(issues).toEqual([]);
  });

  test("returns structured issues for unavailable providers and models", () => {
    const cat = parseCatalog(`
models:
  - id: anthropic/claude-opus-4-7
    provider: anthropic
    scores:
      long_context: 10
      deep_reasoning: 10
      tool_use_accuracy: 9
      speed_priority: 4
      frontend_taste: 8
      cost_efficiency: 3
  - id: google/gemini-3-pro
    provider: google
    scores:
      long_context: 10
      deep_reasoning: 9
      tool_use_accuracy: 8
      speed_priority: 6
      frontend_taste: 7
      cost_efficiency: 5
`);

    const issues = validateCatalogModelIds(cat, {
      anthropic: ["anthropic/claude-sonnet-4-5"],
    });

    expect(issues).toEqual([
      {
        type: "unknown_model",
        provider: "anthropic",
        modelId: "anthropic/claude-opus-4-7",
      },
      {
        type: "unknown_provider",
        provider: "google",
        modelId: "google/gemini-3-pro",
      },
    ]);
  });

  test("returns structured issues for duplicate catalog model ids", () => {
    const cat = parseCatalog(`
models:
  - id: openai/gpt-5
    provider: openai
    scores:
      long_context: 8
      deep_reasoning: 9
      tool_use_accuracy: 8
      speed_priority: 6
      frontend_taste: 7
      cost_efficiency: 5
  - id: openai/gpt-5
    provider: openai
    scores:
      long_context: 8
      deep_reasoning: 9
      tool_use_accuracy: 8
      speed_priority: 6
      frontend_taste: 7
      cost_efficiency: 5
`);

    const issues = validateCatalogModelIds(cat, {
      openai: ["openai/gpt-5"],
    });

    expect(issues).toEqual([
      {
        type: "duplicate_model_id",
        modelId: "openai/gpt-5",
        firstIndex: 0,
        duplicateIndex: 1,
      },
    ]);
  });
});
