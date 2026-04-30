import type { RegenerationRecord } from "./types.js";
import { regeneration as cfg } from "./config.js";

function jaccardSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 && wordsB.size === 0) return 0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function findSimilarTask(
  records: RegenerationRecord[],
  taskExcerpt: string,
  modelId: string,
): RegenerationRecord | undefined {
  for (const r of records) {
    if (r.model_id !== modelId) continue;
    if (Date.now() - r.last_seen > cfg.ttl_ms) continue;
    const sim = jaccardSimilarity(r.task_excerpt, taskExcerpt);
    if (sim >= cfg.similarity_threshold) return r;
  }
  return undefined;
}

export function recordRegenerationHit(
  records: RegenerationRecord[],
  modelId: string,
  taskExcerpt: string,
): RegenerationRecord[] {
  const existing = findSimilarTask(records, taskExcerpt, modelId);

  if (existing) {
    const updated = records.map((r) => {
      if (r === existing) {
        return { ...r, count: r.count + 1, last_seen: Date.now() };
      }
      return r;
    });
    return pruneRecords(updated);
  }

  const entry: RegenerationRecord = {
    model_id: modelId,
    task_excerpt: taskExcerpt.slice(0, 120),
    count: 1,
    last_seen: Date.now(),
  };

  return pruneRecords([entry, ...records]);
}

function pruneRecords(records: RegenerationRecord[]): RegenerationRecord[] {
  const now = Date.now();
  const active = records.filter((r) => now - r.last_seen <= cfg.ttl_ms);
  return active.slice(0, cfg.max_records);
}

export function getRegenerationPenalty(
  records: RegenerationRecord[],
  modelId: string,
  taskExcerpt: string,
): number {
  const existing = findSimilarTask(records, taskExcerpt, modelId);
  if (!existing) return 0;

  if (existing.count >= 4) return cfg.penalty_stage4;
  if (existing.count >= 3) return cfg.penalty_stage3;
  if (existing.count >= 2) return cfg.penalty_stage2;
  return cfg.penalty_stage1;
}

export function getRegenerationCount(
  records: RegenerationRecord[],
  modelId: string,
  taskExcerpt: string,
): number {
  const existing = findSimilarTask(records, taskExcerpt, modelId);
  return existing?.count ?? 0;
}
