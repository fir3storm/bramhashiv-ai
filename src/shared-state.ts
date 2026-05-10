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
} from "./types.js";

export interface SharedState {
  pinned_model_id: string | null;
  last_label: string | null;
  last_classifier: ClassifierResult | null;
  last_route_debug?: RouteDebugSnapshot | null;
  unavailable: UnavailableMark[];
  learned_adjustments: ScoreAdjustment[];
  task_history: TaskOutcome[];
  regeneration_records: RegenerationRecord[];
  provider_health: HealthRecord[];
}

export const EMPTY_STATE: SharedState = {
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

export async function readSharedState(path: string): Promise<SharedState> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Partial<SharedState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      last_route_debug: parsed.last_route_debug ?? null,
      unavailable: Array.isArray(parsed.unavailable) ? parsed.unavailable : [],
      learned_adjustments: Array.isArray(parsed.learned_adjustments) ? parsed.learned_adjustments : [],
      task_history: Array.isArray(parsed.task_history) ? parsed.task_history : [],
      regeneration_records: Array.isArray(parsed.regeneration_records) ? parsed.regeneration_records : [],
      provider_health: Array.isArray(parsed.provider_health) ? parsed.provider_health : [],
    };
  } catch {
    return { ...EMPTY_STATE, unavailable: [] };
  }
}

export async function writeSharedState(path: string, state: SharedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
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
