import type { TaskPlan, TraitWeights, TraitName } from "./types.js";
import { TRAIT_NAMES } from "./types.js";
import { PLANNER_SYSTEM_PROMPT, buildPlannerUserPrompt } from "./planner-prompt.js";
import type { CompletionRunner } from "./classifier.js";
import { planner as cfg } from "./config.js";

function parsePlan(raw: string): TaskPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```(?:json)?\s*|\s*```/g, "").trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  if (typeof p.is_complex !== "boolean") return null;
  if (!Array.isArray(p.subtasks)) return null;
  if (typeof p.reasoning !== "string") return null;

  for (const st of p.subtasks) {
    if (!st || typeof st !== "object") return null;
    const s = st as Record<string, unknown>;
    if (typeof s.description !== "string") return null;
    if (typeof s.estimated_tokens !== "number") return null;
    if (!s.trait_weights || typeof s.trait_weights !== "object") return null;
    const tw = s.trait_weights as Record<string, unknown>;
    for (const trait of TRAIT_NAMES) {
      if (typeof tw[trait] !== "number") return null;
    }
  }

  const subtasks = p.subtasks.map((st: Record<string, unknown>) => ({
    description: st.description as string,
    trait_weights: st.trait_weights as TraitWeights,
    estimated_tokens: st.estimated_tokens as number,
  }));

  return {
    is_complex: p.is_complex as boolean,
    reasoning: p.reasoning as string,
    subtasks,
  };
}

function scoreComplexity(task: string): number {
  const complexityTriggers = [
    "build", "create", "implement", "add", "refactor", "migrate",
  ];
  const multiConcern = [
    "and", "plus", "with", "including", "also", "along",
  ];
  const scopeTriggers = [
    "full", "complete", "entire", "whole", "system", "pipeline",
    "end-to-end", "e2e", "feature", "module",
  ];

  const lower = task.toLowerCase();
  let score = 0;

  for (const t of complexityTriggers) {
    if (lower.includes(t)) score += 0.5;
  }
  let concernCount = 1;
  for (const m of multiConcern) {
    if (lower.includes(m)) concernCount++;
  }
  score += concernCount * 0.5;
  for (const t of scopeTriggers) {
    if (lower.includes(t)) score += 0.5;
  }

  if (task.length > 300) score += 1;
  if (task.length > 800) score += 1;

  return score;
}

export function heuristicShouldPlan(task: string): boolean {
  return scoreComplexity(task) >= cfg.complexity_threshold;
}

export async function planTask(
  task: string,
  workspaceSummary: string,
  runCompletion: CompletionRunner,
): Promise<TaskPlan> {
  const userPrompt = buildPlannerUserPrompt(task, workspaceSummary);

  let raw: string;
  try {
    raw = await Promise.race([
      runCompletion({ systemPrompt: PLANNER_SYSTEM_PROMPT, userPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("planner timeout")), cfg.timeout_ms),
      ),
    ]);
  } catch {
    return { is_complex: false, reasoning: "planner failed, treating as simple task", subtasks: [] };
  }

  const plan = parsePlan(raw);
  if (!plan) {
    return { is_complex: false, reasoning: "failed to parse plan", subtasks: [] };
  }

  return plan;
}
