/**
 * Team-synced learning state.
 * Reads/writes shared state from a team directory (e.g., shared drive,
 * git-tracked file, or network path) so all team members benefit from
 * the same learned adjustments.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PluginState } from "./shared-state.js";

const TEAM_PATH = process.env.BRAMHASHIV_TEAM_STATE_PATH;

export function readTeamState(): PluginState | null {
  if (!TEAM_PATH || !existsSync(TEAM_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TEAM_PATH, "utf-8")) as PluginState;
  } catch {
    return null;
  }
}

export function writeTeamState(state: PluginState): void {
  if (!TEAM_PATH) return;
  const dir = dirname(TEAM_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(TEAM_PATH, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Merge local state with team state. Team adjustments are applied
 * with a dampening factor so local learning still matters.
 */
export function mergeWithTeamState(local: PluginState, team: PluginState | null): PluginState {
  if (!team) return local;

  // Dampen team adjustments by 50% so local learning dominates
  const dampened = team.score_adjustments.map((a) => ({
    ...a,
    delta: a.delta * 0.5,
  }));

  const localIds = new Set(local.score_adjustments.map((a) => `${a.model_id}:${a.trait}`));
  const merged = [...local.score_adjustments];

  for (const adj of dampened) {
    const key = `${adj.model_id}:${adj.trait}`;
    if (!localIds.has(key)) {
      merged.push(adj);
    }
  }

  return {
    ...local,
    score_adjustments: merged,
    labels: [...new Set([...local.labels, ...team.labels])],
  };
}
