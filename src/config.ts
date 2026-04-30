/**
 * Central hyperparameter configuration for BramhaShiv.
 *
 * Every tunable value is read from an env var (with a sensible default)
 * so users can adjust without redeploying. Set any of these:
 *
 *   BRAMHASHIV_LEARNING_RATE=0.1
 *   BRAMHASHIV_LEARNING_DECAY=0.95
 *   BRAMHASHIV_HEALTH_DECAY=0.8
 *   BRAMHASHIV_REGENERATION_TTL_MS=7200000
 *   BRAMHASHIV_SIMILARITY_THRESHOLD=0.8
 *   BRAMHASHIV_PLANNER_TIMEOUT_MS=15000
 *   BRAMHASHIV_CLASSIFIER_TIMEOUT_MS=6000
 *   BRAMHASHIV_MAX_FILES_SCAN=1000
 *   BRAMHASHIV_ERROR_TTL_MODEL_MS=1800000
 *   BRAMHASHIV_ERROR_TTL_ACCOUNT_MS=43200000
 */

function envNum(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const learning = {
  max_history: envNum("BRAMHASHIV_LEARNING_MAX_HISTORY", 200),
  learning_rate: envNum("BRAMHASHIV_LEARNING_RATE", 0.05),
  decay: envNum("BRAMHASHIV_LEARNING_DECAY", 0.99),
  cap: envNum("BRAMHASHIV_LEARNING_CAP", 2.0),
} as const;

export const health = {
  max_latency_samples: envNum("BRAMHASHIV_HEALTH_MAX_SAMPLES", 20),
  decay_alpha: envNum("BRAMHASHIV_HEALTH_DECAY", 0.7),
  latency_baseline_ms: envNum("BRAMHASHIV_HEALTH_LATENCY_BASELINE", 30_000),
  penalty_healthy: 0,
  penalty_degraded: 0.05,
  penalty_poor: 0.12,
  penalty_critical: 0.25,
  threshold_healthy: 0.8,
  threshold_degraded: 0.5,
  threshold_poor: 0.3,
} as const;

export const regeneration = {
  max_records: envNum("BRAMHASHIV_REGENERATION_MAX_RECORDS", 100),
  similarity_threshold: envNum("BRAMHASHIV_SIMILARITY_THRESHOLD", 0.7),
  ttl_ms: envNum("BRAMHASHIV_REGENERATION_TTL_MS", 60 * 60 * 1000),
  penalty_stage1: 0.05,
  penalty_stage2: 0.1,
  penalty_stage3: 0.2,
  penalty_stage4: 0.3,
} as const;

export const workspace = {
  max_files: envNum("BRAMHASHIV_MAX_FILES_SCAN", 500),
  max_depth: envNum("BRAMHASHIV_MAX_DEPTH_SCAN", 4),
} as const;

export const planner = {
  timeout_ms: envNum("BRAMHASHIV_PLANNER_TIMEOUT_MS", 10000),
  complexity_threshold: envNum("BRAMHASHIV_COMPLEXITY_THRESHOLD", 3),
} as const;

export const classifier = {
  timeout_ms: envNum("BRAMHASHIV_CLASSIFIER_TIMEOUT_MS", 8000),
} as const;

export const errorTracking = {
  model_ttl_ms: envNum("BRAMHASHIV_ERROR_TTL_MODEL_MS", 60 * 60 * 1000),
  account_ttl_ms: envNum("BRAMHASHIV_ERROR_TTL_ACCOUNT_MS", 12 * 60 * 60 * 1000),
} as const;
