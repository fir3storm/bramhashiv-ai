/**
 * Time-based routing adjustments.
 * During "night mode" hours, boost cost-efficiency and speed
 * to prefer cheaper, faster models.
 */

import { timeBased } from "./config.js";
import type { TraitWeights } from "./types.js";

export function isNightMode(): boolean {
  const now = new Date();
  const hour = now.getHours();
  const { night_start_hour, night_end_hour } = timeBased;

  if (night_start_hour > night_end_hour) {
    // Overnight range (e.g., 22:00 to 07:00)
    return hour >= night_start_hour || hour < night_end_hour;
  }
  return hour >= night_start_hour && hour < night_end_hour;
}

export function applyTimeBasedWeights(weights: TraitWeights): TraitWeights {
  if (!isNightMode()) return weights;

  return {
    ...weights,
    cost_efficiency: Math.min(1, weights.cost_efficiency + timeBased.night_cost_boost),
    speed_priority: Math.min(1, weights.speed_priority + timeBased.night_speed_boost),
  };
}
