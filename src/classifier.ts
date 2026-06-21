import { TRAIT_NAMES, type ClassifierResult, type TraitName, type TraitWeights } from "./types.js";
import { buildClassifierSystemPrompt, buildClassifierUserPrompt } from "./classifier-prompt.js";
import { classifier as cfg } from "./config.js";
import type { Catalog } from "./types.js";

export type CompletionRunner = (args: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

export interface ClassifyOptions {
  runCompletion: CompletionRunner;
  conversationSnippet?: string;
  timeoutMs?: number;
  workspaceSummary?: string;
  catalog?: Catalog;
  /** India-context hint for Indic-language or India-stack tasks. */
  indiaHint?: string;
}

const FALLBACK_WEIGHTS: TraitWeights = {
  long_context: 0.2,
  deep_reasoning: 0.4,
  tool_use_accuracy: 0.4,
  speed_priority: 0.8,
  frontend_taste: 0.2,
  cost_efficiency: 0.5,
};

/**
 * Calculate confidence score from trait weights.
 * High variance among weights = high confidence (clear signal).
 * Low variance = low confidence (ambiguous task).
 */
function calculateConfidence(weights: TraitWeights): number {
  const values = TRAIT_NAMES.map((t) => weights[t]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  // Normalize: stdDev of 0 (all equal) → 0 confidence, stdDev of ~0.35 → 1.0 confidence
  return Math.min(1, stdDev / 0.35);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  return trimmed;
}

function parseWeights(raw: string, catalog?: Catalog): { base: TraitWeights; custom: Record<string, number> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  // Start with base traits
  const base: Partial<TraitWeights> = {};
  for (const trait of TRAIT_NAMES) {
    const v = p[trait];
    if (typeof v !== "number") return null;
    base[trait as TraitName] = clamp01(v);
  }

  // Collect custom trait weights
  const customTraitWeights: Record<string, number> = {};
  if (catalog?.custom_traits) {
    for (const ct of catalog.custom_traits) {
      const v = p[ct.name];
      if (typeof v === "number") {
        customTraitWeights[ct.name] = clamp01(v);
      }
    }
  }

  return { base: base as TraitWeights, custom: customTraitWeights };
}

export async function classify(
  task: string,
  opts: ClassifyOptions,
): Promise<ClassifierResult> {
  const timeoutMs = opts.timeoutMs ?? cfg.timeout_ms;
  const systemPrompt = buildClassifierSystemPrompt(opts.catalog);
  const userPrompt = buildClassifierUserPrompt(task, opts.conversationSnippet, opts.workspaceSummary, opts.indiaHint);

  let raw: string;
  try {
    raw = await Promise.race([
      opts.runCompletion({ systemPrompt, userPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classifier timeout")), timeoutMs),
      ),
    ]);
  } catch {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true, confidence: 0 };
  }

  const parsed = parseWeights(raw, opts.catalog);
  if (!parsed) {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true, raw, confidence: 0 };
  }
  return {
    weights: parsed.base,
    customTraitWeights: Object.keys(parsed.custom).length > 0 ? parsed.custom : undefined,
    fallback: false,
    raw,
    confidence: calculateConfidence(parsed.base),
  };
}