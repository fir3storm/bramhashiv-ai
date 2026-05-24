import { classify, type CompletionRunner } from "./classifier.js";
import { decideRoute } from "./router.js";
import { applyTimeBasedWeights } from "./time-based.js";
import type { Catalog, ClassifierResult, RouteDecision, TraitWeights } from "./types.js";
import type { ScoringContext } from "./scorer.js";

export interface PipelineInput {
  text: string;
  catalog: Catalog;
  pinnedModelId: string | null;
  unavailable: Set<string>;
  runner: CompletionRunner | null;
  workspaceSummary?: string;
  scoringCtx?: ScoringContext;
  conversationHistory?: string[];
}

export interface PipelineResult {
  decision: RouteDecision;
  classifier: ClassifierResult;
}

/**
 * Used when the classifier fails or no runner is configured.
 * Tilted toward speed + moderate cost-efficiency: when we don't know what
 * the task is, prefer a fast cheap model to a deep all-rounder. Keeps
 * subscription quota safe and prevents the catalog's all-rounders (Kimi,
 * Opus) from auto-winning every fallback turn. Mirrors classifier.FALLBACK_WEIGHTS.
 */
const NEUTRAL_WEIGHTS: TraitWeights = {
  long_context: 0.2,
  deep_reasoning: 0.4,
  tool_use_accuracy: 0.4,
  speed_priority: 0.8,
  frontend_taste: 0.2,
  cost_efficiency: 0.5,
};

function neutralClassifier(): ClassifierResult {
  return { weights: { ...NEUTRAL_WEIGHTS }, fallback: true };
}

export async function runRouterPipeline(input: PipelineInput): Promise<PipelineResult> {
  const conversationSnippet = input.conversationHistory
    ?.slice(-5)
    .map((msg, i) => `${i + 1}. ${msg.slice(0, 200)}`)
    .join("\n");

  const classifier: ClassifierResult =
    input.pinnedModelId || !input.runner
      ? neutralClassifier()
      : await classify(input.text, {
          runCompletion: input.runner,
          workspaceSummary: input.workspaceSummary,
          conversationSnippet,
          catalog: input.catalog,
        });

  const timeAdjustedClassifier: ClassifierResult = {
    ...classifier,
    weights: applyTimeBasedWeights(classifier.weights),
  };

  const decision = decideRoute({
    catalog: input.catalog,
    classifier: timeAdjustedClassifier,
    override: { pinned_model_id: input.pinnedModelId },
    unavailable: input.unavailable,
    scoringCtx: input.scoringCtx,
  });

  return { decision, classifier };
}
