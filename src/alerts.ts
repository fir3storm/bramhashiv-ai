/**
 * Model performance alerts.
 * Logs warnings when model health drops significantly.
 */

import { alerts } from "./config.js";
import type { HealthRecord } from "./types.js";

const warnedModels = new Set<string>();

export function checkHealthAlert(record: HealthRecord): string | null {
  if (record.health_score >= alerts.health_drop_threshold) {
    warnedModels.delete(record.model_id);
    return null;
  }

  if (warnedModels.has(record.model_id)) return null;
  warnedModels.add(record.model_id);

  return `[ALERT] Model ${record.model_id} health dropped to ${record.health_score.toFixed(2)} (threshold: ${alerts.health_drop_threshold})`;
}

export function resetHealthAlerts(): void {
  warnedModels.clear();
}
