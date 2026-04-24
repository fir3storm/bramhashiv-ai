import type { Catalog, ClassifierResult, OverrideState } from "./types.js";

export interface OverrideStore {
  get(): OverrideState;
  set(next: OverrideState): void;
}

export function createOverrideStore(): OverrideStore {
  let state: OverrideState = { pinned_model_id: null };
  return {
    get: () => ({ ...state }),
    set: (next) => { state = { ...next }; },
  };
}

export function handleModelCommand(
  rawLine: string,
  store: OverrideStore,
  catalog: Catalog,
): string {
  const parts = rawLine.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    const ids = catalog.models.map((m) => `  - ${m.id}`).join("\n");
    return `Available models:\n${ids}\n\nUsage: /model <id>  |  /model auto`;
  }

  if (arg === "auto") {
    store.set({ pinned_model_id: null });
    return "Routing set to auto.";
  }

  const match = catalog.models.find((m) => m.id === arg);
  if (!match) {
    return `Model '${arg}' not in catalog. Run /model to list.`;
  }

  store.set({ pinned_model_id: match.id });
  return `Pinned to ${match.id}.`;
}

export function handleRouteCommand(last: ClassifierResult | null): string {
  if (!last) return "No route decision yet.";
  const lines = [
    "Last classifier output:",
    `  fallback: ${last.fallback}`,
    "  weights:",
  ];
  for (const [k, v] of Object.entries(last.weights)) {
    lines.push(`    ${k}: ${v.toFixed(2)}`);
  }
  if (last.raw) lines.push(`  raw: ${last.raw}`);
  return lines.join("\n");
}
