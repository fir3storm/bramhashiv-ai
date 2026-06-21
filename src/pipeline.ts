import { classify, type CompletionRunner } from "./classifier.js";
import { decideRoute } from "./router.js";
import { applyTimeBasedWeights } from "./time-based.js";
import { applyIndiaPeakWeights } from "./ist-peak.js";
import { detectConflicts, autoResolveConflicts } from "./conflict-detection.js";
import { evaluateRules, applyRuleResult } from "./routing-rules.js";
import type { Catalog, ClassifierResult, RouteDecision, TraitWeights, RoutingRule, WorkspaceContext } from "./types.js";
import type { ScoringContext } from "./scorer.js";
import { dbg } from "./debug.js";

export interface PipelineInput {
  text: string;
  catalog: Catalog;
  pinnedModelId: string | null;
  unavailable: Set<string>;
  runner: CompletionRunner | null;
  workspaceSummary?: string;
  scoringCtx?: ScoringContext;
  conversationHistory?: string[];
  /** India-context classifier hint (built from detectIndiaContext). */
  indiaHint?: string;
  /** Routing rules to evaluate before classifier. */
  routingRules?: RoutingRule[];
  /** Workspace context for rule matching and conflict resolution. */
  workspaceCtx?: WorkspaceContext;
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
  // ── Routing Rules: evaluate before classifier ──────────────────────────
  let rulePinnedModel: string | null = null;
  let ruleExcludedModels: string[] = [];
  if (input.routingRules && input.routingRules.length > 0) {
    const ruleMatch = evaluateRules(input.routingRules, input.text, input.workspaceCtx);
    if (ruleMatch) {
      const applied = applyRuleResult(ruleMatch, {
        long_context: 0, deep_reasoning: 0, tool_use_accuracy: 0,
        speed_priority: 0, frontend_taste: 0, cost_efficiency: 0,
      });
      rulePinnedModel = applied.pinnedModelId ?? null;
      ruleExcludedModels = applied.excludedModels;
      dbg("routing_rule", { matched: ruleMatch.matched_rule, action: ruleMatch.action });
    }
  }

  const effectivePinned = rulePinnedModel ?? input.pinnedModelId;
  const effectiveUnavailable = new Set(input.unavailable);
  for (const excluded of ruleExcludedModels) {
    effectiveUnavailable.add(excluded);
  }

  const conversationSnippet = input.conversationHistory
    ?.slice(-5)
    .map((msg, i) => `${i + 1}. ${msg.slice(0, 200)}`)
    .join("\n");

  const classifier: ClassifierResult =
    effectivePinned || !input.runner
      ? neutralClassifier()
      : await classify(input.text, {
          runCompletion: input.runner,
          workspaceSummary: input.workspaceSummary,
          conversationSnippet,
          catalog: input.catalog,
          indiaHint: input.indiaHint,
        });

  // ── Conflict Detection: detect and resolve contradictory traits ────────
  let resolvedWeights = classifier.weights;
  const conflicts = detectConflicts(classifier.weights);
  if (conflicts.length > 0) {
    resolvedWeights = autoResolveConflicts(conflicts, classifier.weights, input.workspaceCtx);
    dbg("conflict_detection", { conflicts, resolved: resolvedWeights });
  }

  const timeAdjustedClassifier: ClassifierResult = {
    ...classifier,
    weights: applyTimeBasedWeights(applyIndiaPeakWeights(resolvedWeights)),
  };

  const decision = decideRoute({
    catalog: input.catalog,
    classifier: timeAdjustedClassifier,
    override: { pinned_model_id: effectivePinned },
    unavailable: effectiveUnavailable,
    scoringCtx: {
      ...input.scoringCtx,
      customTraitWeights: classifier.customTraitWeights,
    },
  });

  return { decision, classifier };
}
