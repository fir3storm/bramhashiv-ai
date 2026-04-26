import { classify, type CompletionRunner } from "./classifier.js";
import { decideRoute } from "./router.js";
import type { Catalog, ClassifierResult, RouteDecision, TraitWeights } from "./types.js";

export interface PipelineInput {
  text: string;
  catalog: Catalog;
  pinnedModelId: string | null;
  unavailable: Set<string>;
  runner: CompletionRunner | null;
}

export interface PipelineResult {
  decision: RouteDecision;
  classifier: ClassifierResult;
}

const NEUTRAL_WEIGHTS: TraitWeights = {
  long_context: 0.5,
  deep_reasoning: 0.7,
  tool_use_accuracy: 0.7,
  speed_priority: 0.3,
  frontend_taste: 0.3,
  cost_efficiency: 0.4,
};

function neutralClassifier(): ClassifierResult {
  return { weights: { ...NEUTRAL_WEIGHTS }, fallback: true };
}

export async function runRouterPipeline(input: PipelineInput): Promise<PipelineResult> {
  const classifier: ClassifierResult =
    input.pinnedModelId || !input.runner
      ? neutralClassifier()
      : await classify(input.text, { runCompletion: input.runner });

  const decision = decideRoute({
    catalog: input.catalog,
    classifier,
    override: { pinned_model_id: input.pinnedModelId },
    unavailable: input.unavailable,
  });

  return { decision, classifier };
}
