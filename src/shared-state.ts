import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClassifierResult, UnavailableMark } from "./types.js";

export interface SharedState {
  pinned_model_id: string | null;
  last_label: string | null;
  last_classifier: ClassifierResult | null;
  unavailable: UnavailableMark[];
}

export const EMPTY_STATE: SharedState = {
  pinned_model_id: null,
  last_label: null,
  last_classifier: null,
  unavailable: [],
};

export async function readSharedState(path: string): Promise<SharedState> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Partial<SharedState>;
    return {
      ...EMPTY_STATE,
      ...parsed,
      unavailable: Array.isArray(parsed.unavailable) ? parsed.unavailable : [],
    };
  } catch {
    return { ...EMPTY_STATE, unavailable: [] };
  }
}

export async function writeSharedState(path: string, state: SharedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Returns the IDs of models still within their TTL.
 * Filters out expired entries based on the current time.
 */
export function pruneUnavailable(marks: UnavailableMark[], now: number = Date.now()): UnavailableMark[] {
  return marks.filter((m) => m.expiresAt > now);
}
