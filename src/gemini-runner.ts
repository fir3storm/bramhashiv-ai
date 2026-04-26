import type { CompletionRunner } from "./classifier.js";

const ENDPOINT_PREFIX = "https://generativelanguage.googleapis.com/v1beta/models/";
const DEFAULT_MODEL_ID = "gemini-flash-latest";

export interface GeminiRunnerOptions {
  apiKey: string;
  modelId?: string;
  fetchImpl?: typeof fetch;
}

export function geminiFlashRunner(options: GeminiRunnerOptions): CompletionRunner {
  const { apiKey, modelId = DEFAULT_MODEL_ID, fetchImpl = fetch } = options;
  return async ({ systemPrompt, userPrompt }) => {
    const url = `${ENDPOINT_PREFIX}${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    });
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    if (!res.ok) {
      throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  };
}
