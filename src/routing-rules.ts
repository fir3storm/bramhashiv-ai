import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync } from "node:fs";
import type {
  RoutingRule,
  RuleCondition,
  RuleMatchResult,
  TraitWeights,
  WorkspaceContext,
} from "./types.js";
import { routingRules } from "./config.js";

export function loadRoutingRules(rulesPath: string): RoutingRule[] {
  if (!routingRules.enabled) return [];
  const path = rulesPath || routingRules.rules_path;
  if (!path || !existsSync(path)) return [];

  try {
    const text = readFileSync(path, "utf8");
    const parsed = parseYaml(text) as { rules?: RoutingRule[] };
    return parsed.rules ?? [];
  } catch {
    return [];
  }
}

function matchesCondition(
  condition: RuleCondition,
  taskText: string,
  workspaceCtx?: WorkspaceContext,
): boolean {
  const lower = taskText.toLowerCase();

  if (condition.task_contains) {
    if (!condition.task_contains.some((keyword) => lower.includes(keyword.toLowerCase()))) {
      return false;
    }
  }

  if (condition.task_matches) {
    try {
      const regex = new RegExp(condition.task_matches, "i");
      if (!regex.test(taskText)) return false;
    } catch {
      return false;
    }
  }

  if (condition.max_length !== undefined) {
    if (taskText.length > condition.max_length) return false;
  }

  if (condition.workspace_has && workspaceCtx) {
    const hasPattern = Object.keys(workspaceCtx.languages).some((lang) =>
      lang.toLowerCase().includes(condition.workspace_has!.toLowerCase()),
    );
    if (!hasPattern) return false;
  }

  return true;
}

export function evaluateRules(
  rules: RoutingRule[],
  taskText: string,
  workspaceCtx?: WorkspaceContext,
): RuleMatchResult | null {
  if (!routingRules.enabled || rules.length === 0) return null;

  for (const rule of rules) {
    if (matchesCondition(rule.when, taskText, workspaceCtx)) {
      return { matched_rule: rule.name, action: rule.then };
    }
  }
  return null;
}

export function applyRuleResult(
  result: RuleMatchResult,
  baseWeights: TraitWeights,
): { weights: TraitWeights; pinnedModelId?: string; excludedModels: string[] } {
  const weights = { ...baseWeights };

  if (result.action.boost) {
    for (const [trait, amount] of Object.entries(result.action.boost)) {
      if (trait in weights && typeof amount === "number") {
        weights[trait as keyof TraitWeights] = Math.min(
          1,
          weights[trait as keyof TraitWeights] + amount,
        );
      }
    }
  }

  return {
    weights,
    pinnedModelId: result.action.prefer,
    excludedModels: result.action.exclude ?? [],
  };
}
