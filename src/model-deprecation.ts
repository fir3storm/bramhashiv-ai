import type {
  Catalog,
  DeprecationNotice,
  MigrationResult,
  ModelEntry,
  ScoreAdjustment,
  HealthRecord,
} from "./types.js";
import { deprecation } from "./config.js";

export function findDeprecatedModels(catalog: Catalog): DeprecationNotice[] {
  return catalog.models
    .filter((m) => m.deprecated || m.eol_date)
    .map((m) => ({
      model_id: m.id,
      successor_id: m.successor ?? null,
      eol_date: m.eol_date ?? null,
      migrated: false,
    }));
}

export function isPastEol(eolDate: string | null): boolean {
  if (!eolDate) return false;
  return new Date(eolDate) < new Date();
}

export function daysUntilEol(eolDate: string | null): number | null {
  if (!eolDate) return null;
  const diff = new Date(eolDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function scaleAdjustments(
  from: ModelEntry,
  to: ModelEntry,
  adjustments: ScoreAdjustment[],
): ScoreAdjustment[] {
  const modelAdj = adjustments.filter((a) => a.model_id === from.id);
  return modelAdj.map((adj) => {
    const fromBase = from.scores[adj.trait] ?? 5;
    const toBase = to.scores[adj.trait] ?? 5;
    const ratio = toBase / Math.max(fromBase, 1);
    return {
      model_id: to.id,
      trait: adj.trait,
      delta: adj.delta * ratio,
      last_updated: adj.last_updated,
    };
  });
}

export function migrateModelState(
  deprecatedId: string,
  successorId: string,
  adjustments: ScoreAdjustment[],
  healthRecords: HealthRecord[],
  catalog: Catalog,
): MigrationResult {
  const from = catalog.models.find((m) => m.id === deprecatedId);
  const to = catalog.models.find((m) => m.id === successorId);

  if (!from || !to) {
    return {
      from_model: deprecatedId,
      to_model: successorId,
      migrated_adjustments: [],
      migrated_health: null,
    };
  }

  const migratedAdj = scaleAdjustments(from, to, adjustments);
  const health = healthRecords.find((h) => h.model_id === deprecatedId);
  const migratedHealth = health
    ? { ...health, model_id: successorId }
    : null;

  return {
    from_model: deprecatedId,
    to_model: successorId,
    migrated_adjustments: migratedAdj,
    migrated_health: migratedHealth,
  };
}

export function formatDeprecationWarning(notice: DeprecationNotice): string {
  const eol = notice.eol_date ? ` (EOL: ${notice.eol_date})` : "";
  const successor = notice.successor_id ? ` → migrating to ${notice.successor_id}` : "";
  return `[DEPRECATION] ${notice.model_id} is deprecated${eol}${successor}`;
}
