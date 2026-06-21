/**
 * Import / export shared state for backup, migration, and team sharing.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { CURRENT_SCHEMA_VERSION, type PluginState, migrateState } from "./shared-state.js";
import { writeSharedState } from "./shared-state.js";
import { STATE_PATH } from "./config-paths.js";
import type { ScoreAdjustment, HealthRecord } from "./types.js";

export interface StateExport {
  version: string;
  exported_at: string;
  state: PluginState;
}

function readStateSync(path: string): PluginState {
  try {
    const text = readFileSync(path, "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return migrateState(parsed);
  } catch {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      pinned_model_id: null,
      last_label: null,
      last_classifier: null,
      last_route_debug: null,
      unavailable: [],
      learned_adjustments: [],
      task_history: [],
      regeneration_records: [],
      provider_health: [],
    };
  }
}

/**
 * Export the current routing state to a JSON file with metadata.
 * Safe to run on a timer or before risky operations.
 */
export function exportStateSync(targetPath: string): void {
  const state = readStateSync(STATE_PATH);
  const payload: StateExport = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    state,
  };
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
}

/**
 * Import state from a JSON export file.
 * - merge=false: replaces all state (destructive backup restore)
 * - merge=true: smart-merge learned_adjustments, provider_health, task_history,
 *   unavailable marks. Team adjustments dampened 50% so local learning dominates.
 */
export function importStateSync(sourcePath: string, merge = false): void {
  if (!existsSync(sourcePath)) {
    throw new Error(`Import file not found: ${sourcePath}`);
  }

  const raw = JSON.parse(readFileSync(sourcePath, "utf-8")) as StateExport;
  if (!raw.state || typeof raw.state !== "object") {
    throw new Error("Invalid state export file — missing 'state' object");
  }

  if (merge) {
    const existing = readStateSync(STATE_PATH);
    const merged = smartMerge(existing, raw.state);
    writeSharedState(STATE_PATH, merged);
  } else {
    writeSharedState(STATE_PATH, raw.state);
  }
}

function smartMerge(local: PluginState, incoming: PluginState): PluginState {
  return {
    schema_version: local.schema_version,
    pinned_model_id: local.pinned_model_id, // never override user pin
    last_label: local.last_label ?? incoming.last_label,
    last_classifier: local.last_classifier ?? incoming.last_classifier,
    last_route_debug: local.last_route_debug ?? incoming.last_route_debug,
    // Combine unavailable marks, deduplicate by id
    unavailable: deduplicateUnavailable([...local.unavailable, ...incoming.unavailable]),
    // Merge learned adjustments — dampen incoming by 50%
    learned_adjustments: mergeAdjustments(local.learned_adjustments, incoming.learned_adjustments),
    // Keep longer history, cap at max
    task_history: [...local.task_history, ...incoming.task_history].slice(0, 200),
    regeneration_records: [...local.regeneration_records, ...incoming.regeneration_records].slice(0, 100),
    // Prefer record with more latency samples (more data)
    provider_health: mergeHealth(local.provider_health, incoming.provider_health),
    budget: local.budget ?? incoming.budget,
  };
}

function deduplicateUnavailable(
  marks: import("./types.js").UnavailableMark[],
): import("./types.js").UnavailableMark[] {
  const byId = new Map<string, import("./types.js").UnavailableMark>();
  for (const m of marks) {
    const existing = byId.get(m.id);
    if (!existing || m.expiresAt > existing.expiresAt) {
      byId.set(m.id, m);
    }
  }
  return [...byId.values()];
}

function mergeAdjustments(local: ScoreAdjustment[], incoming: ScoreAdjustment[]): ScoreAdjustment[] {
  const byKey = new Map<string, ScoreAdjustment>();
  for (const a of local) byKey.set(`${a.model_id}:${a.trait}`, a);
  for (const a of incoming) {
    const key = `${a.model_id}:${a.trait}`;
    if (!byKey.has(key)) {
      byKey.set(key, { ...a, delta: a.delta * 0.5 }); // dampen team adjustments
    }
  }
  return [...byKey.values()];
}

function mergeHealth(local: HealthRecord[], incoming: HealthRecord[]): HealthRecord[] {
  const byModel = new Map<string, HealthRecord>();
  for (const h of local) byModel.set(h.model_id, h);
  for (const h of incoming) {
    const existing = byModel.get(h.model_id);
    if (!existing) {
      byModel.set(h.model_id, h);
    } else if (h.latency_samples.length > existing.latency_samples.length) {
      // prefer record with more samples (more data = better)
      byModel.set(h.model_id, h);
    }
  }
  return [...byModel.values()];
}