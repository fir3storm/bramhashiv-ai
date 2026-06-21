import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ClassifierResult,
  UnavailableMark,
  ScoreAdjustment,
  TaskOutcome,
  RegenerationRecord,
  HealthRecord,
  RouteDebugSnapshot,
  BudgetState,
} from "./types.js";
import { createEmptyBudgetState } from "./budget.js";

export const CURRENT_SCHEMA_VERSION = 1;

export interface PluginState {
  schema_version: number;
  pinned_model_id: string | null;
  last_label: string | null;
  last_classifier: ClassifierResult | null;
  last_route_debug?: RouteDebugSnapshot | null;
  unavailable: UnavailableMark[];
  learned_adjustments: ScoreAdjustment[];
  task_history: TaskOutcome[];
  regeneration_records: RegenerationRecord[];
  provider_health: HealthRecord[];
  budget?: BudgetState;
}

/** @deprecated use PluginState */
export type SharedState = PluginState;

export const EMPTY_STATE: PluginState = {
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
  budget: createEmptyBudgetState(),
};

export function migrateState(parsed: Record<string, unknown>): PluginState {
  const version = (parsed.schema_version as number) ?? 0;
  const state = { ...parsed } as Record<string, unknown>;

  // Migrate from v0 (no schema_version) to v1
  if (version < 1) {
    state.schema_version = 1;
    // Future migrations go here as version increments
  }

  return state as unknown as PluginState;
}

export async function readSharedState(path: string): Promise<SharedState> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const migrated = migrateState(parsed);
    return {
      ...EMPTY_STATE,
      ...migrated,
      schema_version: CURRENT_SCHEMA_VERSION,
      last_route_debug: migrated.last_route_debug ?? null,
      unavailable: Array.isArray(migrated.unavailable) ? migrated.unavailable : [],
      learned_adjustments: Array.isArray(migrated.learned_adjustments) ? migrated.learned_adjustments : [],
      task_history: Array.isArray(migrated.task_history) ? migrated.task_history : [],
      regeneration_records: Array.isArray(migrated.regeneration_records) ? migrated.regeneration_records : [],
      provider_health: Array.isArray(migrated.provider_health) ? migrated.provider_health : [],
      budget: migrated.budget ?? createEmptyBudgetState(),
    };
  } catch {
    return { ...EMPTY_STATE, unavailable: [] };
  }
}

export async function writeSharedState(path: string, state: SharedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const stateWithVersion = { ...state, schema_version: CURRENT_SCHEMA_VERSION };
  await writeFile(tmpPath, JSON.stringify(stateWithVersion, null, 2), "utf8");
  try {
    await rename(tmpPath, path);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
}

/**
 * Returns the IDs of models still within their TTL.
 * Filters out expired entries based on the current time.
 */
export function pruneUnavailable(marks: UnavailableMark[], now: number = Date.now()): UnavailableMark[] {
  return marks.filter((m) => m.expiresAt > now);
}
