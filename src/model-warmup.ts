import type { Catalog, RouteDecision, WarmupHint, TraitWeights } from "./types.js";
import { warmup } from "./config.js";
import { semanticSimilarity } from "./semantic-similarity.js";

const FOLLOW_UP_PATTERNS = [
  "now ",
  "fix ",
  "also ",
  "refactor",
  "update ",
  "change ",
  "modify ",
  "add ",
  "remove ",
  "then ",
  "next ",
  "continue",
  "improve",
  "optimize",
  "what about",
  "and ",
];

const TASK_SHIFT_PATTERNS = [
  "new task",
  "different file",
  "switch to",
  "unrelated",
  "fresh start",
  "let's start",
];

export function shouldReuseModel(lastText: string, newText: string): boolean {
  if (!lastText || !newText) return false;
  const lower = newText.toLowerCase();

  if (TASK_SHIFT_PATTERNS.some((p) => lower.includes(p))) return false;
  if (FOLLOW_UP_PATTERNS.some((p) => lower.startsWith(p))) return true;

  const similarity = semanticSimilarity(lastText, newText);
  return similarity >= warmup.reuse_similarity_threshold;
}

export function predictNextModel(
  currentDecision: RouteDecision,
  conversationHistory: string[],
  catalog: Catalog,
): WarmupHint | null {
  if (!warmup.enabled) return null;
  if (conversationHistory.length < 2) return null;

  const lastText = conversationHistory[conversationHistory.length - 2] ?? "";
  const currentText = conversationHistory[conversationHistory.length - 1] ?? "";

  if (!shouldReuseModel(lastText, currentText)) return null;

  const pickedModel = catalog.models.find((m) => m.id === currentDecision.picked.id);
  if (!pickedModel) return null;

  const confidence = Math.min(0.95, 0.6 + conversationHistory.length * 0.03);

  return {
    predicted_model_id: currentDecision.picked.id,
    confidence,
    predicted_traits: { ...currentDecision.classifier.weights },
    timestamp: Date.now(),
  };
}

export function getWarmupConfidence(hint: WarmupHint | null): number {
  if (!hint) return 0;
  const age = Date.now() - hint.timestamp;
  if (age > 60_000) return 0;
  return hint.confidence * (1 - age / 120_000);
}
