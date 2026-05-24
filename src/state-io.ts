/**
 * Import / export shared state for backup and team sharing.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { readSharedState, writeSharedState, type PluginState } from "./shared-state.js";
import { STATE_PATH } from "./paths.js";

export interface StateExport {
  version: string;
  exported_at: string;
  state: PluginState;
}

export function exportState(targetPath: string): void {
  const state = readSharedState();
  const payload: StateExport = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    state,
  };
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
}

export function importState(sourcePath: string, merge = false): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Import file not found: ${sourcePath}`);
  }

  const raw = JSON.parse(readFileSync(sourcePath, "utf-8")) as StateExport;
  if (!raw.state || typeof raw.state !== "object") {
    throw new Error("Invalid state export file");
  }

  if (merge) {
    const existing = readSharedState();
    const merged: PluginState = {
      ...existing,
      ...raw.state,
      labels: [...existing.labels, ...raw.state.labels],
      unavailable: [...existing.unavailable, ...raw.state.unavailable],
      score_adjustments: [...existing.score_adjustments, ...raw.state.score_adjustments],
      health_records: [...existing.health_records, ...raw.state.health_records],
      task_outcomes: [...existing.task_outcomes, ...raw.state.task_outcomes],
      regeneration_records: [...existing.regeneration_records, ...raw.state.regeneration_records],
    };
    writeSharedState(merged);
  } else {
    writeSharedState(raw.state);
  }
}
