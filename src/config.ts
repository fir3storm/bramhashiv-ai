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

function envString(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
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
  complexity_threshold: envNum("BRAMHASHIV_COMPLEXITY_THRESHOLD", 1.5),
} as const;

export const classifier = {
  timeout_ms: envNum("BRAMHASHIV_CLASSIFIER_TIMEOUT_MS", 8000),
} as const;

export const errorTracking = {
  model_ttl_ms: envNum("BRAMHASHIV_ERROR_TTL_MODEL_MS", 60 * 60 * 1000),
  account_ttl_ms: envNum("BRAMHASHIV_ERROR_TTL_ACCOUNT_MS", 12 * 60 * 60 * 1000),
} as const;

export const budget = {
  daily_limit_usd: envNum("BRAMHASHIV_BUDGET_DAILY_USD", 50),
  monthly_limit_usd: envNum("BRAMHASHIV_BUDGET_MONTHLY_USD", 500),
  near_limit_threshold: envNum("BRAMHASHIV_BUDGET_NEAR_THRESHOLD", 0.8),
  penalty_near_limit: envNum("BRAMHASHIV_BUDGET_PENALTY_NEAR", 0.15),
  penalty_over_limit: envNum("BRAMHASHIV_BUDGET_PENALTY_OVER", 0.5),
  default_input_tokens: envNum("BRAMHASHIV_BUDGET_DEFAULT_INPUT_TOKENS", 4000),
  default_output_tokens: envNum("BRAMHASHIV_BUDGET_DEFAULT_OUTPUT_TOKENS", 2000),
  max_records: envNum("BRAMHASHIV_BUDGET_MAX_RECORDS", 500),
} as const;

export const latencySlo = {
  target_ms: envNum("BRAMHASHIV_LATENCY_SLO_MS", 0),
  penalty_per_ms_over: envNum("BRAMHASHIV_LATENCY_SLO_PENALTY", 0.001),
} as const;

export const abTesting = {
  enabled: envNum("BRAMHASHIV_AB_TEST_PCT", 0) > 0,
  percentage: envNum("BRAMHASHIV_AB_TEST_PCT", 0),
} as const;

export const timeBased = {
  night_start_hour: envNum("BRAMHASHIV_NIGHT_MODE_START", 22),
  night_end_hour: envNum("BRAMHASHIV_NIGHT_MODE_END", 7),
  night_cost_boost: envNum("BRAMHASHIV_NIGHT_COST_BOOST", 0.3),
  night_speed_boost: envNum("BRAMHASHIV_NIGHT_SPEED_BOOST", 0.2),
  // IST peak hours (India AI usage spike — 6pm to 11pm IST = UTC+5:30)
  india_peak_start_hour: envNum("BRAMHASHIV_INDIA_PEAK_HOURS_START", 18),
  india_peak_end_hour: envNum("BRAMHASHIV_INDIA_PEAK_HOURS_END", 23),
  india_peak_cost_boost: envNum("BRAMHASHIV_INDIA_PEAK_COST_BOOST", 0.3),
} as const;

export const alerts = {
  health_drop_threshold: envNum("BRAMHASHIV_ALERT_HEALTH_THRESHOLD", 0.5),
  telegram_bot_token: envString("BRAMHASHIV_TELEGRAM_BOT_TOKEN", ""),
  telegram_chat_id: envString("BRAMHASHIV_TELEGRAM_CHAT_ID", ""),
  telegram_rate_limit_ms: envNum("BRAMHASHIV_TELEGRAM_RATE_LIMIT_MS", 600_000),
} as const;

export const pricing = {
  display_currency: (envString("BRAMHASHIV_DISPLAY_CURRENCY", "USD") as "USD" | "INR"),
  usd_to_inr_rate: envNum("BRAMHASHIV_USD_TO_INR_RATE", 83.0),
} as const;
