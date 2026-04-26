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

