import type { Catalog, CustomTrait } from "./types.js";

const BASE_TRAITS = {
  long_context: "does the task require reading or holding a lot of code/context?",
  deep_reasoning: "does it need multi-step logical/algorithmic thought?",
  tool_use_accuracy: "will it involve many file edits or shell commands requiring precise tool calls?",
  speed_priority: "does the user want a fast response over a deep one?",
  frontend_taste: "does it involve UI/UX/CSS aesthetic judgment?",
  cost_efficiency: "is this high-volume/background work where a cheap model is fine?",
} as const;

export function buildClassifierSystemPrompt(catalog?: Catalog): string {
  const customTraits = catalog?.custom_traits ?? [];
  const allTraits: Record<string, string> = { ...BASE_TRAITS };
  for (const ct of customTraits) {
    allTraits[ct.name] = ct.description;
  }

  const traitLines = Object.entries(allTraits)
    .map(([name, desc]) => `  "${name}": <0..1>,       // ${desc}`)
    .join("\n");

  return `You classify coding tasks. Output ONLY a JSON object with ${Object.keys(allTraits).length} keys, each a number between 0.0 and 1.0:

{
${traitLines}
}

Rules:
- Output ONLY the JSON object. No prose, no markdown, no code fences.
- Weights should roughly sum toward representing the dominant traits; don't zero everything out.
- If the task is ambiguous, assume moderate deep_reasoning and tool_use_accuracy.`;
}

// Backward-compatible static prompt for contexts without catalog access
export const CLASSIFIER_SYSTEM_PROMPT = buildClassifierSystemPrompt();

export function buildClassifierUserPrompt(
  task: string,
  conversationSnippet?: string,
  workspaceSummary?: string,
): string {
  let out = "";
  if (workspaceSummary && workspaceSummary.trim()) {
    out += `WORKSPACE CONTEXT:\n${workspaceSummary.trim()}\n\n`;
  }
  out += `TASK:\n${task.trim()}\n`;
  if (conversationSnippet && conversationSnippet.trim()) {
    out += `\nRECENT CONVERSATION (most recent last):\n${conversationSnippet.trim()}\n`;
  }
  return out;
}
