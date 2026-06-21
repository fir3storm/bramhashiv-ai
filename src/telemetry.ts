import { appendFile, mkdir, stat, rename, unlink, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { TaskOutcome, TraitName } from "./types.js";

export interface OverrideEvent {
  timestamp: string;
  task_excerpt: string;
  routed_to: string;
  user_picked: string;
  top_traits: TraitName[];
}

export interface TelemetryLogger {
  logOverride(event: OverrideEvent): Promise<void>;
  logOutcome(event: TaskOutcome): Promise<void>;
  flush(): Promise<void>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per file
const MAX_FILES = 10; // keep at most 10 rotated files

async function rotateIfNeeded(path: string): Promise<void> {
  try {
    const stats = await stat(path);
    if (stats.size < MAX_FILE_SIZE) return;
  } catch {
    return; // file doesn't exist yet
  }

  const dir = dirname(path);
  const base = path.replace(/\.jsonl?$/, "");

  // Rename existing files: telemetry.9.jsonl → delete, telemetry.8 → .9, etc.
  for (let i = MAX_FILES - 1; i >= 1; i--) {
    const from = `${base}.${i}.jsonl`;
    const to = `${base}.${i + 1}.jsonl`;
    try {
      if (i === MAX_FILES - 1) {
        await unlink(from).catch(() => {});
      } else {
        await rename(from, to).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // Rotate current file to .1
  try {
    await rename(path, `${base}.1.jsonl`);
  } catch { /* ignore */ }
}

export function createTelemetryLogger(path: string): TelemetryLogger {
  let queue: Promise<void> = Promise.resolve();

  async function append(line: string) {
    await mkdir(dirname(path), { recursive: true });
    await rotateIfNeeded(path);
    await appendFile(path, line + "\n", "utf8");
  }

  return {
    logOverride(event) {
      const line = JSON.stringify(event);
      queue = queue.then(() => append(line)).catch((err) => {
        console.error("[bramhashiv] telemetry write failed:", err);
      });
      return queue;
    },
    logOutcome(event) {
      const line = JSON.stringify(event);
      queue = queue.then(() => append(line)).catch((err) => {
        console.error("[bramhashiv] telemetry write failed:", err);
      });
      return queue;
    },
    flush() {
      return queue;
    },
  };
}