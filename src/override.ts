import type { Catalog, ClassifierResult, OverrideState, RouteDebugSnapshot } from "./types.js";

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

type UnavailableDebugEntry = string | { id: string };
export type RouteDebugData = RouteDebugSnapshot | {
  decision: RouteDebugSnapshot["decision"];
  unavailable?: Iterable<UnavailableDebugEntry>;
};

function isRouteDebugData(last: ClassifierResult | RouteDebugData): last is RouteDebugData {
  return "decision" in last;
}

function yesNo(value: boolean | undefined): string {
  return value ? "yes" : "no";
}

function formatWeights(classifier: ClassifierResult, indent: string): string[] {
  const lines = [`${indent}weights:`];
  for (const [k, v] of Object.entries(classifier.weights)) {
    lines.push(`${indent}  ${k}: ${v.toFixed(2)}`);
  }
  return lines;
}

function normalizeUnavailable(unavailable: Iterable<UnavailableDebugEntry> | undefined): string[] {
  if (!unavailable) return [];
  return [...unavailable].map((entry) => typeof entry === "string" ? entry : entry.id);
}

function formatRouteDebug(debug: RouteDebugData): string {
  const { decision } = debug;
  const unavailable = normalizeUnavailable(debug.unavailable);
  const unavailableSet = new Set(unavailable);
  const skipped = [
    ...decision.ranking.map((r) => r.model.id).filter((id) => unavailableSet.has(id)),
    ...unavailable.filter((id) => !decision.ranking.some((r) => r.model.id === id)),
  ];
  const lines = [
    "Last route decision:",
    `  Chosen model: ${decision.picked.id}`,
    `  Top traits: ${decision.top_traits.join(", ") || "none"}`,
    `  Fallback: ${yesNo(decision.override_source === "fallback" || decision.unavailable_exhausted)}`,
    `  Unavailable exhausted: ${yesNo(decision.unavailable_exhausted)}`,
  ];
  if (decision.override_source) lines.push(`  Override source: ${decision.override_source}`);
  lines.push("  Top candidates:");
  for (const candidate of decision.ranking.slice(0, 5)) {
    const skippedLabel = unavailableSet.has(candidate.model.id) ? " (skipped)" : "";
    lines.push(`    ${candidate.model.id}: ${candidate.score.toFixed(2)}${skippedLabel}`);
  }
  lines.push(`  Skipped/unavailable: ${skipped.length ? skipped.join(", ") : "none"}`);
  lines.push(`  Classifier fallback: ${yesNo(decision.classifier.fallback)}`);
  lines.push(...formatWeights(decision.classifier, "  classifier "));
  if (decision.classifier.raw) lines.push(`  raw: ${decision.classifier.raw}`);
  return lines.join("\n");
}

export function handleRouteCommand(last: ClassifierResult | RouteDebugData | null): string {
  if (!last) return "No route decision yet.";
  if (isRouteDebugData(last)) return formatRouteDebug(last);

  const lines = [
    "Last classifier output:",
    `  fallback: ${last.fallback}`,
    ...formatWeights(last, "  "),
  ];
  if (last.raw) lines.push(`  raw: ${last.raw}`);
  return lines.join("\n");
}
