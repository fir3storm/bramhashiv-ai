import type { RegenerationRecord } from "./types.js";

const MAX_RECORDS = 100;
const SIMILARITY_THRESHOLD = 0.7;
const REGENERATION_TTL_MS = 60 * 60 * 1000;

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
    if (Date.now() - r.last_seen > REGENERATION_TTL_MS) continue;
    const sim = jaccardSimilarity(r.task_excerpt, taskExcerpt);
    if (sim >= SIMILARITY_THRESHOLD) return r;
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
  const active = records.filter((r) => now - r.last_seen <= REGENERATION_TTL_MS);
  return active.slice(0, MAX_RECORDS);
}

export function getRegenerationPenalty(
  records: RegenerationRecord[],
  modelId: string,
  taskExcerpt: string,
): number {
  const existing = findSimilarTask(records, taskExcerpt, modelId);
  if (!existing) return 0;

  if (existing.count >= 4) return 0.3;
  if (existing.count >= 3) return 0.2;
  if (existing.count >= 2) return 0.1;
  return 0.05;
}

export function getRegenerationCount(
  records: RegenerationRecord[],
  modelId: string,
  taskExcerpt: string,
): number {
  const existing = findSimilarTask(records, taskExcerpt, modelId);
  return existing?.count ?? 0;
}
