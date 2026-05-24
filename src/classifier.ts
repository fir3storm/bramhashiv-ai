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
}

const FALLBACK_WEIGHTS: TraitWeights = {
  long_context: 0.2,
  deep_reasoning: 0.4,
  tool_use_accuracy: 0.4,
  speed_priority: 0.8,
  frontend_taste: 0.2,
  cost_efficiency: 0.5,
};

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

function parseWeights(raw: string, catalog?: Catalog): TraitWeights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;

  // Start with base traits
  const result: Partial<TraitWeights> = {};
  for (const trait of TRAIT_NAMES) {
    const v = p[trait];
    if (typeof v !== "number") return null;
    result[trait as TraitName] = clamp01(v);
  }

  // Include custom traits if present in catalog
  if (catalog?.custom_traits) {
    for (const ct of catalog.custom_traits) {
      const v = p[ct.name];
      if (typeof v === "number") {
        // Store custom trait weight in a way that scoring can use it
        // For now, we ignore custom traits in scoring but accept them from classifier
      }
    }
  }

  return result as TraitWeights;
}

export async function classify(
  task: string,
  opts: ClassifyOptions,
): Promise<ClassifierResult> {
  const timeoutMs = opts.timeoutMs ?? cfg.timeout_ms;
  const systemPrompt = buildClassifierSystemPrompt(opts.catalog);
  const userPrompt = buildClassifierUserPrompt(task, opts.conversationSnippet, opts.workspaceSummary);

  let raw: string;
  try {
    raw = await Promise.race([
      opts.runCompletion({ systemPrompt, userPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classifier timeout")), timeoutMs),
      ),
    ]);
  } catch {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true };
  }

  const weights = parseWeights(raw, opts.catalog);
  if (!weights) {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true, raw };
  }
  return { weights, fallback: false, raw };
}
