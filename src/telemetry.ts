import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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

export function createTelemetryLogger(path: string): TelemetryLogger {
  let queue: Promise<void> = Promise.resolve();

  async function append(line: string) {
    await mkdir(dirname(path), { recursive: true });
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
