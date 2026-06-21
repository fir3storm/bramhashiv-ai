/**
 * Time-based routing adjustments.
 * During "night mode" hours, boost cost-efficiency and speed
 * to prefer cheaper, faster models.
 *
 * Supports configurable timezone via BRAMHASHIV_TIMEZONE env var.
 * Falls back to local system time if not set.
 */

import { timeBased } from "./config.js";
import type { TraitWeights } from "./types.js";

function getCurrentHour(): number {
  const tz = timeBased.timezone;
  if (tz) {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "numeric",
        hour12: false,
      });
      const hourStr = formatter.format(new Date());
      return Number.parseInt(hourStr, 10);
    } catch {
      // Invalid timezone, fall back to local
    }
  }
  return new Date().getHours();
}

export function isNightMode(): boolean {
  const hour = getCurrentHour();
  const { night_start_hour, night_end_hour } = timeBased;

  if (night_start_hour > night_end_hour) {
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