import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClassifierResult } from "./types.js";

export interface SharedState {
  pinned_model_id: string | null;
  last_label: string | null;
  last_classifier: ClassifierResult | null;
}

export const EMPTY_STATE: SharedState = {
  pinned_model_id: null,
  last_label: null,
  last_classifier: null,
};

export async function readSharedState(path: string): Promise<SharedState> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Partial<SharedState>;
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export async function writeSharedState(path: string, state: SharedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}
