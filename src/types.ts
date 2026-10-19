/**
 * The six traits the classifier outputs and the catalog scores against.
 * Keys are kebab-case in YAML config, snake_case in TS.
 */
export type TraitName =
  | "long_context"
  | "deep_reasoning"
  | "tool_use_accuracy"
  | "speed_priority"
  | "frontend_taste"
  | "cost_efficiency";

export const TRAIT_NAMES: readonly TraitName[] = [
  "long_context",
  "deep_reasoning",
  "tool_use_accuracy",
  "speed_priority",
  "frontend_taste",
  "cost_efficiency",
] as const;

/** Classifier output: weights in 0..1 per trait. */
export type TraitWeights = Record<TraitName, number>;

/** Catalog scores: 0..10 per trait. */
export type TraitScores = Record<TraitName, number>;

export interface HardFilters {
  min_context?: number;
}

export interface ModelEntry {
  id: string;
  provider: string;
  scores: TraitScores;
  hard_filters?: HardFilters;
  /** Estimated cost per 1K input tokens in USD (optional, for budget tracking). */
  cost_per_1k_input?: number;
  /** Estimated cost per 1K output tokens in USD (optional, for budget tracking). */
  cost_per_1k_output?: number;
  /** Context window size in tokens (optional, for context pressure scoring). */
  context_window?: number;
  /** Whether this model is deprecated and should be migrated to successor. */
  deprecated?: boolean;
  /** Successor model ID for migration when deprecated. */
  successor?: string;
  /** End-of-life date (ISO string). Model excluded from routing after this date. */
  eol_date?: string;
}

export interface CustomTrait {
  name: string;
  description: string;
  /**
   * Per-model scores for this custom trait (model_id → score 0-10).
   * Models not listed here default to score 3 in the scorer.
   */
  scores?: Record<string, number>;
}

export interface Catalog {
  models: ModelEntry[];
  custom_traits?: CustomTrait[];
}

export interface ClassifierResult {
  weights: TraitWeights;
  fallback: boolean;
  raw?: string;
  /** Custom trait weights from the classifier (only present when catalog has custom_traits). */
  customTraitWeights?: Record<string, number>;
  /** Confidence score (0-1) based on weight entropy. Low confidence means ambiguous task. */
  confidence?: number;
  /** Whether A/B testing routed to the #2 model */
  ab_test?: boolean;
}

export interface RankedModel {
  model: ModelEntry;
  score: number;
}

export interface TraitBreakdown {
  trait: TraitName | string;
  weight: number;
  base_score: number;
  learned_adjustment: number;
  contribution: number;
}

export interface ModelScoreExplanation {
  model_id: string;
  final_score: number;
  trait_breakdown: TraitBreakdown[];
  health_penalty: number;
  regeneration_penalty: number;
  budget_penalty?: number;
  slo_penalty?: number;
  hard_filter_excluded?: boolean;
}

export interface RouteExplanation {
  picked_model: ModelScoreExplanation;
  all_models: ModelScoreExplanation[];
  top_traits: TraitName[];
  classifier_weights: TraitWeights;
  classifier_fallback: boolean;
  classifier_confidence?: number;
  override_source?: "user" | "fallback";
  unavailable_exhausted?: boolean;
  unavailable_models: string[];
}

export interface RouteDecision {
  picked: ModelEntry;
  top_traits: TraitName[];
  ranking: RankedModel[];
  classifier: ClassifierResult;
  override_source?: "user" | "fallback";
  unavailable_exhausted?: boolean;
  ab_test?: boolean;
  /** Set when task is critical (deep_reasoning + tool_use >= 1.4). Silent fallback model to use if primary fails. */
  ensemble_fallback?: ModelEntry;
  explanation?: RouteExplanation;
}

export interface RouteDebugSnapshot {
  decision: RouteDecision;
  unavailable: string[];
}

export interface OverrideState {
  pinned_model_id: string | null;
}

/**
 * One entry per model temporarily marked unavailable due to a runtime
 * error (rate limit, quota exhausted, auth failure). Persisted in
 * state.json so blacklist survives across `opencode run` invocations.
 */
export interface UnavailableMark {
  id: string;
  expiresAt: number;
}

// ── Feature 1: Closed-loop learning ──────────────────────────────────────────

export interface TaskOutcome {
  task_excerpt: string;
  model_id: string;
  success: boolean;
  latency_ms: number;
  regeneration_count: number;
  diff_size: number;
  timestamp: string;
  ab_test?: boolean;
}

export interface ScoreAdjustment {
  model_id: string;
  trait: TraitName;
  delta: number;
  last_updated?: number;
}

// ── Feature 2: Task decomposition ────────────────────────────────────────────

export interface SubTask {
  description: string;
  trait_weights: TraitWeights;
  estimated_tokens: number;
}

export interface TaskPlan {
  subtasks: SubTask[];
  is_complex: boolean;
  reasoning: string;
}

// ── Feature 3: Workspace context ─────────────────────────────────────────────

export interface WorkspaceContext {
  languages: Record<string, number>;
  total_files: number;
  repo_detected: boolean;
  has_tests: boolean;
  has_frontend: boolean;
  has_backend: boolean;
  summary: string;
}

// ── Feature 4: Regeneration intelligence ─────────────────────────────────────

export interface RegenerationRecord {
  model_id: string;
  task_excerpt: string;
  count: number;
  last_seen: number;
}

// ── Feature 5: Provider health monitoring ────────────────────────────────────

export interface HealthRecord {
  provider: string;
  model_id: string;
  latency_samples: number[];
  error_count: number;
  success_count: number;
  last_used: number;
  health_score: number;
}

// ── Feature 6: Budget guardrails ───────────────────────────────────────────────

export interface BudgetSpendRecord {
  model_id: string;
  provider: string;
  estimated_cost_usd: number;
  input_tokens?: number;
  output_tokens?: number;
  timestamp: string;
  task_excerpt: string;
}

export interface BudgetState {
  daily_spend: number;
  monthly_spend: number;
  last_reset_day: string;
  last_reset_month: string;
  records: BudgetSpendRecord[];
}

export interface BudgetStatus {
  daily_spend: number;
  monthly_spend: number;
  daily_limit: number;
  monthly_limit: number;
  near_limit: boolean;
  over_limit: boolean;
}

// ── Feature: Model Warmup Prediction ─────────────────────────────────────────

export interface WarmupHint {
  predicted_model_id: string;
  confidence: number;
  predicted_traits: TraitWeights;
  timestamp: number;
}

// ── Feature: Routing Rules DSL ───────────────────────────────────────────────

export interface RoutingRule {
  name: string;
  when: RuleCondition;
  then: RuleAction;
}

export interface RuleCondition {
  task_contains?: string[];
  task_matches?: string;
  max_length?: number;
  workspace_has?: string;
  trait_above?: Partial<TraitWeights>;
}

export interface RuleAction {
  prefer?: string;
  exclude?: string[];
  boost?: Partial<TraitWeights>;
}

export interface RuleMatchResult {
  matched_rule: string;
  action: RuleAction;
}

// ── Feature: Live Metrics Dashboard ──────────────────────────────────────────

export interface RoutingHistoryEntry {
  timestamp: number;
  task_excerpt: string;
  picked_model: string;
  score: number;
  top_traits: TraitName[];
  latency_ms?: number;
  success?: boolean;
  cost_usd?: number;
  was_fallback: boolean;
  was_ab_test: boolean;
}

export interface ModelHealthSnapshot {
  model_id: string;
  provider: string;
  health_score: number;
  success_rate: number;
  avg_latency_ms: number;
  total_calls: number;
  is_unavailable: boolean;
}

export interface DashboardMetrics {
  total_tasks: number;
  success_rate: number;
  avg_latency_ms: number;
  total_spend_usd: number;
  model_usage: Record<string, number>;
  trait_distribution: Record<string, number>;
  uptime_ms: number;
}

// ── Feature: Multi-Turn Conversation Optimization ────────────────────────────

export interface ConversationAffinity {
  model_id: string;
  turn_count: number;
  last_weights: TraitWeights;
  affinity_bonus: number;
}

// ── Feature: Model Deprecation & Migration ───────────────────────────────────

export interface DeprecationNotice {
  model_id: string;
  successor_id: string | null;
  eol_date: string | null;
  migrated: boolean;
}

export interface MigrationResult {
  from_model: string;
  to_model: string;
  migrated_adjustments: ScoreAdjustment[];
  migrated_health: HealthRecord | null;
}

// ── Feature: Automated Model Benchmarking ────────────────────────────────────

export interface BenchmarkTask {
  name: string;
  prompt: string;
  expected_traits: Partial<TraitWeights>;
  max_expected_ms: number;
}

export interface BenchmarkResult {
  model_id: string;
  task_name: string;
  latency_ms: number;
  success: boolean;
  timestamp: number;
}

export interface BenchmarkScore {
  model_id: string;
  avg_latency_ms: number;
  success_rate: number;
  score_delta: number;
  last_benchmark: number;
}

// ── Feature: Streaming Cost Estimator ────────────────────────────────────────

export interface StreamingCostSnapshot {
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  is_complete: boolean;
}

// ── Feature: Context Window Pressure Scoring ─────────────────────────────────

export interface ContextPressureResult {
  model_id: string;
  estimated_tokens: number;
  context_window: number;
  utilization: number;
  penalty: number;
}

// ── Feature: Generic Webhook Alerting ────────────────────────────────────────

export interface WebhookConfig {
  name: string;
  url: string;
  events: WebhookEvent[];
  format: "generic" | "slack" | "discord" | "pagerduty";
  rate_limit_ms: number;
  severity_filter?: "info" | "warning" | "critical";
  headers?: Record<string, string>;
}

export type WebhookEvent =
  | "health_drop"
  | "budget_warning"
  | "model_deprecated"
  | "routing_conflict"
  | "benchmark_complete";

export interface WebhookPayload {
  event: WebhookEvent;
  severity: "info" | "warning" | "critical";
  message: string;
  model_id?: string;
  data?: Record<string, unknown>;
  timestamp: string;
  source: "bramhashiv-ai";
}

// ── Feature: Routing Conflict Detection & Resolution ─────────────────────────

export interface TraitConflict {
  trait_a: TraitName;
  trait_b: TraitName;
  severity: "mild" | "moderate" | "severe";
  resolution: "favor_a" | "favor_b" | "balance" | "user_clarify";
  description: string;
}