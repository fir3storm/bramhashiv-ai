import { describe, test, expect } from "bun:test";
import { heuristicShouldPlan, planTask } from "../src/planner.js";
import { buildPlannerUserPrompt } from "../src/planner-prompt.js";
import type { CompletionRunner } from "../src/classifier.js";

describe("planner", () => {
  describe("heuristicShouldPlan", () => {
    test("simple tasks do not trigger planning", () => {
      expect(heuristicShouldPlan("add a comment to this function")).toBe(false);
      expect(heuristicShouldPlan("rename variable x to y")).toBe(false);
      expect(heuristicShouldPlan("what does git status do")).toBe(false);
    });

    test("complex multi-concern tasks trigger planning", () => {
      expect(
        heuristicShouldPlan(
          "build a full authentication system with login, registration, password reset, and email verification",
        ),
      ).toBe(true);
    });

    test("tasks with trigger words and scope terms trigger planning", () => {
      expect(
        heuristicShouldPlan("implement a complete end-to-end testing pipeline with CI integration"),
      ).toBe(true);
    });

    test("refactor tasks with scope keywords trigger planning", () => {
      expect(
        heuristicShouldPlan("refactor the entire database layer with end-to-end testing pipeline and documentation"),
      ).toBe(true);
    });

    test("long tasks (>800 chars) trigger planning", () => {
      const long = "build ".repeat(200);
      expect(heuristicShouldPlan(long)).toBe(true);
    });

    test("medium tasks (>300 chars) with scope keywords trigger planning", () => {
      const medium = `build a ${"_".repeat(350)} system module with full pipeline`;
      expect(heuristicShouldPlan(medium)).toBe(true);
    });

    test("single concern with trigger word may not trigger", () => {
      expect(heuristicShouldPlan("add comment to calculateTotal function")).toBe(false);
    });

    test("'create feature' with multiple concerns triggers planning", () => {
      expect(
        heuristicShouldPlan("create a new feature module with tests and documentation"),
      ).toBe(true);
    });

    test("empty string does not trigger", () => {
      expect(heuristicShouldPlan("")).toBe(false);
    });
  });

  describe("buildPlannerUserPrompt", () => {
    test("includes workspace context and task", () => {
      const result = buildPlannerUserPrompt("Build auth system", "TypeScript(50) backend");
      expect(result).toContain("WORKSPACE CONTEXT:");
      expect(result).toContain("TypeScript(50) backend");
      expect(result).toContain("TASK:");
      expect(result).toContain("Build auth system");
    });

    test("handles empty workspace summary", () => {
      const result = buildPlannerUserPrompt("fix bug", "");
      expect(result).toContain("WORKSPACE CONTEXT: ");
      expect(result).toContain("fix bug");
    });
  });

  describe("planTask", () => {
    test("returns fallback plan on runner failure", async () => {
      const runner: CompletionRunner = async () => {
        throw new Error("API down");
      };
      const plan = await planTask("build auth", "", runner);
      expect(plan.is_complex).toBe(false);
      expect(plan.reasoning).toContain("planner failed");
      expect(plan.subtasks).toEqual([]);
    });

    test("returns fallback plan on timeout mock", async () => {
      const runner: CompletionRunner = async () =>
        new Promise((_resolve) => {}); // never resolves
      const plan = await planTask("build auth", "", runner);
      expect(plan.is_complex).toBe(false);
    }, 15000);

    test("returns fallback plan on unparseable response", async () => {
      const runner: CompletionRunner = async () => "not json at all";
      const plan = await planTask("build auth", "", runner);
      expect(plan.is_complex).toBe(false);
      expect(plan.reasoning).toContain("failed to parse");
    });

    test("returns fallback for missing is_complex", async () => {
      const runner: CompletionRunner = async () =>
        JSON.stringify({ reasoning: "ok", subtasks: [] });
      const plan = await planTask("build auth", "", runner);
      expect(plan.is_complex).toBe(false);
    });

    test("parses valid plan with subtasks", async () => {
      const runner: CompletionRunner = async () =>
        JSON.stringify({
          is_complex: true,
          reasoning: "multi-step auth system",
          subtasks: [
            {
              description: "Implement database schema",
              trait_weights: {
                long_context: 0.3,
                deep_reasoning: 0.7,
                tool_use_accuracy: 0.5,
                speed_priority: 0.2,
                frontend_taste: 0.1,
                cost_efficiency: 0.3,
              },
              estimated_tokens: 2000,
            },
            {
              description: "Build login endpoint",
              trait_weights: {
                long_context: 0.4,
                deep_reasoning: 0.5,
                tool_use_accuracy: 0.6,
                speed_priority: 0.4,
                frontend_taste: 0.0,
                cost_efficiency: 0.5,
              },
              estimated_tokens: 3000,
            },
          ],
        });
      const plan = await planTask("build auth system with tests", "python backend", runner);
      expect(plan.is_complex).toBe(true);
      expect(plan.reasoning).toBe("multi-step auth system");
      expect(plan.subtasks).toHaveLength(2);
      expect(plan.subtasks[0]!.description).toBe("Implement database schema");
      expect(plan.subtasks[1]!.description).toBe("Build login endpoint");
      expect(plan.subtasks[0]!.trait_weights.long_context).toBe(0.3);
      expect(plan.subtasks[0]!.estimated_tokens).toBe(2000);
    });

    test("strips markdown fences from JSON response", async () => {
      const runner: CompletionRunner = async () =>
        '```json\n{"is_complex": false, "reasoning": "simple", "subtasks": []}\n```';
      const plan = await planTask("simple task", "", runner);
      expect(plan.is_complex).toBe(false);
      expect(plan.reasoning).toBe("simple");
    });

    test("rejects plans with invalid subtask fields", async () => {
      const runner: CompletionRunner = async () =>
        JSON.stringify({
          is_complex: true,
          reasoning: "bad",
          subtasks: [{ description: "ok", trait_weights: {}, estimated_tokens: 100 }],
        });
      const plan = await planTask("task", "", runner);
      expect(plan.is_complex).toBe(false);
      expect(plan.reasoning).toContain("failed to parse");
    });

    test("is_complex false plan passes through", async () => {
      const runner: CompletionRunner = async () =>
        JSON.stringify({
          is_complex: false,
          reasoning: "no need to split",
          subtasks: [],
        });
      const plan = await planTask("simple thing", "", runner);
      expect(plan.is_complex).toBe(false);
      expect(plan.subtasks).toEqual([]);
    });
  });
});
