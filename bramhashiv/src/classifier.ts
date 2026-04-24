import { TRAIT_NAMES, type ClassifierResult, type TraitName, type TraitWeights } from "./types.js";
import { CLASSIFIER_SYSTEM_PROMPT, buildClassifierUserPrompt } from "./classifier-prompt.js";

export type CompletionRunner = (args: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

export interface ClassifyOptions {
  runCompletion: CompletionRunner;
  conversationSnippet?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2000;

const FALLBACK_WEIGHTS: TraitWeights = {
  long_context: 0.5,
  deep_reasoning: 0.7,
  tool_use_accuracy: 0.7,
  speed_priority: 0.3,
  frontend_taste: 0.3,
  cost_efficiency: 0.4,
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

function parseWeights(raw: string): TraitWeights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const result: Partial<TraitWeights> = {};
  for (const trait of TRAIT_NAMES) {
    const v = p[trait];
    if (typeof v !== "number") return null;
    result[trait as TraitName] = clamp01(v);
  }
  return result as TraitWeights;
}

export async function classify(
  task: string,
  opts: ClassifyOptions,
): Promise<ClassifierResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userPrompt = buildClassifierUserPrompt(task, opts.conversationSnippet);

  let raw: string;
  try {
    raw = await Promise.race([
      opts.runCompletion({ systemPrompt: CLASSIFIER_SYSTEM_PROMPT, userPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classifier timeout")), timeoutMs),
      ),
    ]);
  } catch {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true };
  }

  const weights = parseWeights(raw);
  if (!weights) {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true, raw };
  }
  return { weights, fallback: false, raw };
}
