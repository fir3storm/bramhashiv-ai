import type { TraitName, TraitWeights, TraitConflict, WorkspaceContext } from "./types.js";
import { conflictDetection } from "./config.js";

const CONFLICT_PAIRS: Array<{ a: TraitName; b: TraitName; description: string }> = [
  { a: "deep_reasoning", b: "speed_priority", description: "thorough vs fast" },
  { a: "long_context", b: "cost_efficiency", description: "large context vs cheap" },
  { a: "frontend_taste", b: "deep_reasoning", description: "UI aesthetics vs logic depth" },
];

export function detectConflicts(weights: TraitWeights): TraitConflict[] {
  if (!conflictDetection.enabled) return [];
  const conflicts: TraitConflict[] = [];
  const threshold = conflictDetection.threshold;

  for (const pair of CONFLICT_PAIRS) {
    const wa = weights[pair.a];
    const wb = weights[pair.b];
    if (wa > threshold && wb > threshold) {
      const avg = (wa + wb) / 2;
      const severity: TraitConflict["severity"] =
        avg > 0.9 ? "severe" : avg > 0.8 ? "moderate" : "mild";
      conflicts.push({
        trait_a: pair.a,
        trait_b: pair.b,
        severity,
        resolution: "balance",
        description: pair.description,
      });
    }
  }
  return conflicts;
}

export function resolveConflict(
  conflict: TraitConflict,
  weights: TraitWeights,
  strategy?: "favor_a" | "favor_b" | "balance",
): TraitWeights {
  const resolved = { ...weights };
  const s = strategy ?? conflict.resolution;

  if (s === "favor_a") {
    resolved[conflict.trait_b] = Math.max(0, resolved[conflict.trait_b] - 0.2);
  } else if (s === "favor_b") {
    resolved[conflict.trait_a] = Math.max(0, resolved[conflict.trait_a] - 0.2);
  } else {
    const midpoint = (resolved[conflict.trait_a] + resolved[conflict.trait_b]) / 2;
    resolved[conflict.trait_a] = midpoint;
    resolved[conflict.trait_b] = midpoint;
  }
  return resolved;
}

export function autoResolveConflicts(
  conflicts: TraitConflict[],
  weights: TraitWeights,
  workspaceCtx?: WorkspaceContext,
): TraitWeights {
  if (conflictDetection.resolution === "log_only") return weights;

  let resolved = { ...weights };
  for (const conflict of conflicts) {
    let strategy: "favor_a" | "favor_b" | "balance" = "balance";

    if (conflictDetection.resolution === "auto") {
      if (
        conflict.trait_a === "deep_reasoning" &&
        conflict.trait_b === "speed_priority" &&
        workspaceCtx?.has_tests
      ) {
        strategy = "favor_a";
      } else if (
        (conflict.trait_a === "frontend_taste" || conflict.trait_b === "frontend_taste") &&
        workspaceCtx?.has_frontend
      ) {
        strategy = conflict.trait_a === "frontend_taste" ? "favor_a" : "favor_b";
      }
    }

    resolved = resolveConflict(conflict, resolved, strategy);
  }
  return resolved;
}

export function formatConflictWarning(conflicts: TraitConflict[]): string {
  return conflicts
    .map(
      (c) =>
        `[CONFLICT] ${c.trait_a}(${c.severity}) vs ${c.trait_b}: ${c.description} — resolving via ${c.resolution}`,
    )
    .join("\n");
}
