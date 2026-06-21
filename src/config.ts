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
  decay_alpha: 0.3,
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
  timezone: envString("BRAMHASHIV_TIMEZONE", ""),
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

// ── Feature: Model Warmup Prediction ─────────────────────────────────────────

export const warmup = {
  enabled: envNum("BRAMHASHIV_WARMUP_ENABLED", 1) > 0,
  reuse_similarity_threshold: envNum("BRAMHASHIV_WARMUP_REUSE_THRESHOLD", 0.6),
} as const;

// ── Feature: Routing Rules DSL ───────────────────────────────────────────────

export const routingRules = {
  enabled: envNum("BRAMHASHIV_RULES_ENABLED", 1) > 0,
  rules_path: envString("BRAMHASHIV_RULES_PATH", ""),
} as const;

// ── Feature: Live Metrics Dashboard ──────────────────────────────────────────

export const dashboard = {
  enabled: envNum("BRAMHASHIV_DASHBOARD_ENABLED", 0) > 0,
  port: envNum("BRAMHASHIV_DASHBOARD_PORT", 9876),
  max_history: envNum("BRAMHASHIV_DASHBOARD_MAX_HISTORY", 100),
} as const;

// ── Feature: Multi-Turn Conversation Optimization ────────────────────────────

export const multiturn = {
  enabled: envNum("BRAMHASHIV_MULTITURN_ENABLED", 1) > 0,
  base_bonus: envNum("BRAMHASHIV_MULTITURN_BASE_BONUS", 0.1),
  drift_threshold: envNum("BRAMHASHIV_MULTITURN_DRIFT_THRESHOLD", 0.4),
  decay_rate: envNum("BRAMHASHIV_MULTITURN_DECAY", 0.85),
  max_turns: envNum("BRAMHASHIV_MULTITURN_MAX_TURNS", 10),
} as const;

// ── Feature: Model Deprecation & Migration ───────────────────────────────────

export const deprecation = {
  auto_migrate: envNum("BRAMHASHIV_AUTO_MIGRATE", 1) > 0,
  warn_days_before_eol: envNum("BRAMHASHIV_DEPRECATION_WARN_DAYS", 30),
} as const;

// ── Feature: Automated Model Benchmarking ────────────────────────────────────

export const benchmark = {
  enabled: envNum("BRAMHASHIV_BENCHMARK_ENABLED", 0) > 0,
  interval_hours: envNum("BRAMHASHIV_BENCHMARK_INTERVAL_HOURS", 24),
  auto_adjust: envNum("BRAMHASHIV_BENCHMARK_AUTO_ADJUST", 0) > 0,
  max_adjustment: envNum("BRAMHASHIV_BENCHMARK_MAX_ADJUST", 1.0),
  timeout_ms: envNum("BRAMHASHIV_BENCHMARK_TIMEOUT_MS", 30000),
} as const;

// ── Feature: Streaming Cost Estimator ────────────────────────────────────────

export const streamingCost = {
  enabled: envNum("BRAMHASHIV_STREAMING_COST_ENABLED", 1) > 0,
  display_in_label: envNum("BRAMHASHIV_STREAMING_COST_LABEL", 1) > 0,
} as const;

// ── Feature: Context Window Pressure Scoring ─────────────────────────────────

export const contextPressure = {
  enabled: envNum("BRAMHASHIV_CONTEXT_PRESSURE_ENABLED", 1) > 0,
  threshold_warn: envNum("BRAMHASHIV_CONTEXT_WARN", 0.6),
  threshold_high: envNum("BRAMHASHIV_CONTEXT_HIGH", 0.8),
  threshold_critical: envNum("BRAMHASHIV_CONTEXT_CRITICAL", 0.95),
  penalty_warn: envNum("BRAMHASHIV_CONTEXT_PENALTY_WARN", 0.05),
  penalty_high: envNum("BRAMHASHIV_CONTEXT_PENALTY_HIGH", 0.15),
  penalty_critical: envNum("BRAMHASHIV_CONTEXT_PENALTY_CRITICAL", 0.3),
  default_context_window: envNum("BRAMHASHIV_DEFAULT_CONTEXT_WINDOW", 128000),
} as const;

// ── Feature: Generic Webhook Alerting ────────────────────────────────────────

export const webhooks = {
  enabled: envNum("BRAMHASHIV_WEBHOOKS_ENABLED", 0) > 0,
  config_path: envString("BRAMHASHIV_WEBHOOKS_PATH", ""),
} as const;

// ── Feature: Routing Conflict Detection & Resolution ─────────────────────────

export const conflictDetection = {
  enabled: envNum("BRAMHASHIV_CONFLICT_ENABLED", 1) > 0,
  threshold: envNum("BRAMHASHIV_CONFLICT_THRESHOLD", 0.7),
  resolution: envString("BRAMHASHIV_CONFLICT_RESOLUTION", "auto") as "auto" | "balance" | "log_only",
} as const;
