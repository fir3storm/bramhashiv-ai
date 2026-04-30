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
  provider: "anthropic" | "google" | "huggingface" | "openrouter" | "openai";
  scores: TraitScores;
  hard_filters?: HardFilters;
}

export interface Catalog {
  models: ModelEntry[];
}

export interface ClassifierResult {
  weights: TraitWeights;
  fallback: boolean;
  raw?: string;
}

export interface RankedModel {
  model: ModelEntry;
  score: number;
}

export interface RouteDecision {
  picked: ModelEntry;
  top_traits: TraitName[];
  ranking: RankedModel[];
  classifier: ClassifierResult;
  override_source?: "user" | "fallback";
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
}

export interface ScoreAdjustment {
  model_id: string;
  trait: TraitName;
  delta: number;
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

