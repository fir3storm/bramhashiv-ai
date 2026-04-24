import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { decideRoute } from "../src/router.js";
import { parseCatalog } from "../src/catalog.js";
import type { TraitWeights } from "../src/types.js";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

function base(overrides: Partial<TraitWeights>): TraitWeights {
  return {
    long_context: 0.2,
    deep_reasoning: 0.4,
    tool_use_accuracy: 0.3,
    speed_priority: 0.1,
    frontend_taste: 0.1,
    cost_efficiency: 0.1,
    ...overrides,
  } as TraitWeights;
}

/**
 * Simulates a "well-behaved" classifier using keyword heuristics on the task.
 * This replaces a real Gemini Flash call for fast, deterministic CI testing.
 * Order matters — first matching branch wins.
 */
function simulatedClassifier(task: string): TraitWeights {
  const l = task.toLowerCase();

  if (/\barchitect\b|architecture|shortest path|algorithm|sharding|negative edges|strategy/.test(l)) {
    return base({ deep_reasoning: 0.95, long_context: 0.4, tool_use_accuracy: 0.3 });
  }
  if (/generate \d+|boilerplate|scaffold|stub functions/.test(l)) {
    return base({ cost_efficiency: 0.9, speed_priority: 0.7, tool_use_accuracy: 0.5 });
  }
  if (/\b(40-file|30 files|15 modules|12 files|across the repo|everywhere)\b/.test(l)) {
    return base({ long_context: 0.9, tool_use_accuracy: 0.8, deep_reasoning: 0.6 });
  }
  if (/landing|premium|tailwind|dashboard|dark mode|feel.+premium|style.+(form|button)|whitespace|spacing|shadow|hover|focus rings/.test(l)) {
    return base({ frontend_taste: 0.9, deep_reasoning: 0.55 });
  }
  if (/audit|trace|debug|memory leak|race condition|find why|find the bug/.test(l)) {
    return base({ deep_reasoning: 0.85, long_context: 0.75, tool_use_accuracy: 0.4 });
  }
  if (/refactor/.test(l)) {
    return base({ tool_use_accuracy: 0.8, deep_reasoning: 0.7, long_context: 0.6 });
  }
  if (/\bquick\b|one-?liner|quickly|format.+(json|this)|what does|explain|one-line|plain english/.test(l)) {
    return base({ speed_priority: 0.9, cost_efficiency: 0.6 });
  }
  if (/write|implement|build|design(?!.+(algorithm|sharding))/.test(l)) {
    return base({ tool_use_accuracy: 0.7, deep_reasoning: 0.65 });
  }
  return base({ deep_reasoning: 0.6, tool_use_accuracy: 0.6 });
}

const catalogYaml = readFileSync(
  join(THIS_DIR, "..", "config", "default-catalog.yaml"),
  "utf8",
);
const catalog = parseCatalog(catalogYaml);

const goldenTasks: { task: string; expected_top3: string[] }[] = JSON.parse(
  readFileSync(join(THIS_DIR, "golden-tasks.json"), "utf8"),
);

describe("golden set — routed model within top-3 expected", () => {
  for (const { task, expected_top3 } of goldenTasks) {
    test(task.slice(0, 60), () => {
      const weights = simulatedClassifier(task);
      const decision = decideRoute({
        catalog,
        classifier: { weights, fallback: false },
        override: { pinned_model_id: null },
        unavailable: new Set(),
      });
      expect(expected_top3).toContain(decision.picked.id);
    });
  }
});
