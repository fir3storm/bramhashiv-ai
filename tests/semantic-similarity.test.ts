import { describe, test, expect } from "bun:test";
import { semanticSimilarity } from "../src/semantic-similarity.js";

describe("semanticSimilarity", () => {
  test("identical strings have similarity ~1", () => {
    const text = "refactor the auth module to use dependency injection";
    expect(semanticSimilarity(text, text)).toBeCloseTo(1, 5);
  });

  test("completely different strings have low similarity", () => {
    const a = "refactor auth module";
    const b = "design landing page with hero section";
    expect(semanticSimilarity(a, b)).toBeLessThan(0.3);
  });

  test("catches camelCase variations", () => {
    const a = "rename getCwd to getCurrentWorkingDirectory";
    const b = "rename getcwd to get_current_working_directory";
    expect(semanticSimilarity(a, b)).toBeGreaterThan(0.6);
  });

  test("catches small wording changes", () => {
    const a = "convert this array of numbers to their sum";
    const b = "convert array of numbers to sum";
    expect(semanticSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  test("code tokens improve matching", () => {
    const a = "fix the handleClick function in Button.tsx";
    const b = "fix handleClick in Button component";
    expect(semanticSimilarity(a, b)).toBeGreaterThan(0.45);
  });

  test("empty strings return 0", () => {
    expect(semanticSimilarity("", "hello")).toBe(0);
    expect(semanticSimilarity("hello", "")).toBe(0);
  });

  test("similar structure boosts score", () => {
    const a = "function foo() {\n  return 1;\n}";
    const b = "function bar() {\n  return 2;\n}";
    expect(semanticSimilarity(a, b)).toBeGreaterThan(0.4);
  });
});
