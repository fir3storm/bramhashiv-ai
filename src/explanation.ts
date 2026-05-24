import type { RouteExplanation, ModelScoreExplanation, TraitBreakdown } from "./types.js";

export interface FormattedExplanation {
  summary: string;
  details: string;
  top_models: string[];
}

function formatTraitBreakdown(breakdown: TraitBreakdown[]): string {
  const lines = breakdown
    .filter((b) => b.weight > 0.1)
    .sort((a, b) => b.contribution - a.contribution)
    .map((b) => {
      const traitName = b.trait.replace(/_/g, " ");
      const adjText = b.learned_adjustment !== 0
        ? ` (adj: ${b.learned_adjustment > 0 ? "+" : ""}${b.learned_adjustment.toFixed(2)})`
        : "";
      return `  - ${traitName}: weight ${b.weight.toFixed(2)} × score ${b.base_score.toFixed(1)}${adjText} = ${b.contribution.toFixed(2)}`;
    });
  return lines.join("\n");
}

function formatModelExplanation(model: ModelScoreExplanation, rank: number): string {
  const lines: string[] = [];
  lines.push(`${rank}. ${model.model_id}: ${model.final_score.toFixed(2)}`);

  if (model.hard_filter_excluded) {
    lines.push("   [excluded by hard filter]");
    return lines.join("\n");
  }

  if (model.health_penalty > 0) {
    lines.push(`   health penalty: -${(model.health_penalty * 100).toFixed(0)}%`);
  }
  if (model.regeneration_penalty > 0) {
    lines.push(`   regeneration penalty: -${(model.regeneration_penalty * 100).toFixed(0)}%`);
  }

  const topTraits = model.trait_breakdown
    .filter((b) => b.weight > 0.1)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  for (const trait of topTraits) {
    const traitName = trait.trait.replace(/_/g, " ");
    const adjText = trait.learned_adjustment !== 0
      ? ` (learned: ${trait.learned_adjustment > 0 ? "+" : ""}${trait.learned_adjustment.toFixed(2)})`
      : "";
    lines.push(`   ${traitName}: ${trait.weight.toFixed(2)} × ${trait.base_score.toFixed(1)}${adjText} → ${trait.contribution.toFixed(2)}`);
  }

  return lines.join("\n");
}

export function buildExplanation(explanation: RouteExplanation): FormattedExplanation {
  const picked = explanation.picked_model;
  const classifierStatus = explanation.classifier_fallback ? " (fallback weights)" : "";

  const summary = `Routed to ${picked.model_id}${classifierStatus}`;

  const topTraits = explanation.top_traits.map((t) => t.replace(/_/g, " ")).join(" + ");
  const overrideText = explanation.override_source
    ? ` [override: ${explanation.override_source}]`
    : "";

  const detailsLines: string[] = [
    `Task traits: ${topTraits}${overrideText}`,
    ``,
    `Chosen model: ${picked.model_id} (score: ${picked.final_score.toFixed(2)})`,
    ``,
    `Top contributing traits:`,
    formatTraitBreakdown(picked.trait_breakdown),
    ``,
    `All models ranked:`,
  ];

  const activeModels = explanation.all_models.filter((m) => !m.hard_filter_excluded);
  for (let i = 0; i < Math.min(activeModels.length, 5); i++) {
    detailsLines.push(formatModelExplanation(activeModels[i]!, i + 1));
  }

  if (explanation.unavailable_models.length > 0) {
    detailsLines.push("");
    detailsLines.push(`Unavailable models: ${explanation.unavailable_models.join(", ")}`);
  }

  if (explanation.unavailable_exhausted) {
    detailsLines.push("");
    detailsLines.push("WARNING: All ranked models were unavailable; using safe fallback.");
  }

  const top_models = activeModels.slice(0, 5).map((m) => m.model_id);

  return {
    summary,
    details: detailsLines.join("\n"),
    top_models,
  };
}

export function formatExplanationForDisplay(explanation: RouteExplanation): string {
  const formatted = buildExplanation(explanation);
  return `[bramhashiv] ${formatted.summary}\n${formatted.details}`;
}
