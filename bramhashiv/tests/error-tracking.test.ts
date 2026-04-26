import { describe, test, expect } from "bun:test";
import { modelsToMarkUnavailable } from "../src/error-tracking.js";
import type { Catalog } from "../src/types.js";

const catalog: Catalog = {
  models: [
    { id: "anthropic/claude-opus-4-7", provider: "anthropic", scores: { long_context: 10, deep_reasoning: 10, tool_use_accuracy: 9, speed_priority: 4, frontend_taste: 8, cost_efficiency: 3 } },
    { id: "anthropic/claude-haiku-4-5", provider: "anthropic", scores: { long_context: 7, deep_reasoning: 6, tool_use_accuracy: 8, speed_priority: 10, frontend_taste: 6, cost_efficiency: 9 } },
    { id: "google/gemini-flash-latest", provider: "google", scores: { long_context: 8, deep_reasoning: 6, tool_use_accuracy: 6, speed_priority: 10, frontend_taste: 6, cost_efficiency: 10 } },
    { id: "huggingface/moonshotai/Kimi-K2.6", provider: "huggingface", scores: { long_context: 10, deep_reasoning: 9, tool_use_accuracy: 9, speed_priority: 5, frontend_taste: 7, cost_efficiency: 10 } },
  ],
};

describe("modelsToMarkUnavailable", () => {
  test("ProviderAuthError marks all models for that provider", () => {
    const result = modelsToMarkUnavailable(
      { name: "ProviderAuthError", data: { providerID: "anthropic", message: "no auth" } },
      null,
      catalog,
    );
    expect(result.sort()).toEqual([
      "anthropic/claude-haiku-4-5",
      "anthropic/claude-opus-4-7",
    ]);
  });

  test("ProviderAuthError with unknown providerID is ignored", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "ProviderAuthError", data: { providerID: "martian" } },
        null,
        catalog,
      ),
    ).toEqual([]);
  });

  test("APIError with 402 marks the last routed model", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "APIError", data: { statusCode: 402, message: "Payment Required" } },
        "huggingface/moonshotai/Kimi-K2.6",
        catalog,
      ),
    ).toEqual(["huggingface/moonshotai/Kimi-K2.6"]);
  });

  test("APIError with 429 (rate limit) marks the last routed model", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "APIError", data: { statusCode: 429 } },
        "google/gemini-flash-latest",
        catalog,
      ),
    ).toEqual(["google/gemini-flash-latest"]);
  });

  test("APIError with 4xx that isn't a quota signal is ignored", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "APIError", data: { statusCode: 400 } },
        "google/gemini-flash-latest",
        catalog,
      ),
    ).toEqual([]);
  });

  test("APIError without lastRoutedModelId is ignored", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "APIError", data: { statusCode: 402 } },
        null,
        catalog,
      ),
    ).toEqual([]);
  });

  test("UnknownError / other error types are ignored", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "UnknownError", data: { message: "weird" } },
        "google/gemini-flash-latest",
        catalog,
      ),
    ).toEqual([]);
  });

  test("Accepts ApiError as alternate casing (defensive)", () => {
    expect(
      modelsToMarkUnavailable(
        { name: "ApiError", data: { statusCode: 503 } },
        "huggingface/moonshotai/Kimi-K2.6",
        catalog,
      ),
    ).toEqual(["huggingface/moonshotai/Kimi-K2.6"]);
  });
});
