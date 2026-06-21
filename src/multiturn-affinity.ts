import type { ConversationAffinity, TraitWeights, TraitName, TRAIT_NAMES } from "./types.js";
import { multiturn } from "./config.js";

export function traitDrift(a: TraitWeights, b: TraitWeights): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const trait of Object.keys(a) as TraitName[]) {
    const va = a[trait] ?? 0;
    const vb = b[trait] ?? 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 1;
  const cosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return 1 - Math.max(0, Math.min(1, cosine));
}

export function computeAffinityBonus(
  affinity: ConversationAffinity | null,
  currentWeights: TraitWeights,
): number {
  if (!multiturn.enabled) return 0;
  if (!affinity) return 0;
  if (affinity.turn_count > multiturn.max_turns) return 0;

  const drift = traitDrift(affinity.last_weights, currentWeights);
  if (drift > multiturn.drift_threshold) return 0;

  return affinity.affinity_bonus;
}

export function updateAffinity(
  affinity: ConversationAffinity | null,
  modelId: string,
  weights: TraitWeights,
): ConversationAffinity {
  if (!affinity || affinity.model_id !== modelId) {
    return {
      model_id: modelId,
      turn_count: 1,
      last_weights: { ...weights },
      affinity_bonus: multiturn.base_bonus,
    };
  }

  return {
    model_id: modelId,
    turn_count: affinity.turn_count + 1,
    last_weights: { ...weights },
    affinity_bonus: affinity.affinity_bonus * multiturn.decay_rate,
  };
}
