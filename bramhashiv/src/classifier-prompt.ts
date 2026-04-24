export const CLASSIFIER_SYSTEM_PROMPT = `You classify coding tasks. Output ONLY a JSON object with six keys, each a number between 0.0 and 1.0:

{
  "long_context": <0..1>,       // does the task require reading or holding a lot of code/context?
  "deep_reasoning": <0..1>,     // does it need multi-step logical/algorithmic thought?
  "tool_use_accuracy": <0..1>,  // will it involve many file edits or shell commands requiring precise tool calls?
  "speed_priority": <0..1>,     // does the user want a fast response over a deep one?
  "frontend_taste": <0..1>,     // does it involve UI/UX/CSS aesthetic judgment?
  "cost_efficiency": <0..1>     // is this high-volume/background work where a cheap model is fine?
}

Rules:
- Output ONLY the JSON object. No prose, no markdown, no code fences.
- Weights should roughly sum toward representing the dominant traits; don't zero everything out.
- If the task is ambiguous, assume moderate deep_reasoning and tool_use_accuracy.`;

export function buildClassifierUserPrompt(task: string, conversationSnippet?: string): string {
  let out = `TASK:\n${task.trim()}\n`;
  if (conversationSnippet && conversationSnippet.trim()) {
    out += `\nRECENT CONVERSATION (most recent last):\n${conversationSnippet.trim()}\n`;
  }
  return out;
}
