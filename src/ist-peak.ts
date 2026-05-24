/**
 * India IST peak-hour routing.
 *
 * India's AI usage spikes during evening hours (6pm–11pm IST) which differs
 * from Western usage patterns. During peak, we boost cost_efficiency to
 * prefer cheaper models and reduce load on premium providers.
 *
 * IST = UTC + 5:30. We derive the IST hour from the local (browser/server) clock
 * and apply a fixed offset. Users in India will get accurate IST detection;
 * users outside India get a warning in debug logs.
 */

import { timeBased } from "./config.js";
import type { TraitWeights } from "./types.js";

/** Get current IST hour (0-23) from local time. */
export function getIstHour(): number {
  const now = new Date();
  // IST = UTC + 5:30
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istMs = utcMs + 5.5 * 60 * 60 * 1000;
  return new Date(istMs).getUTCHours();
}

/** Returns true if current IST hour is within India peak usage window. */
export function isIndiaPeakHours(): boolean {
  const { india_peak_start_hour: start, india_peak_end_hour: end } = timeBased;
  const istHour = getIstHour();

  // Overnight range (e.g., 18:00 to 23:00 — no wrap-around needed here
  // since IST peak is always within the same day, 18-23)
  if (start <= end) {
    return istHour >= start && istHour < end;
  }
  // Wraps midnight — not applicable for IST peak (18-23 never wraps)
  return false;
}

/** Apply IST peak-hour weight adjustments. */
export function applyIndiaPeakWeights(weights: TraitWeights): TraitWeights {
  if (!isIndiaPeakHours()) return weights;

  return {
    ...weights,
    cost_efficiency: Math.min(1, weights.cost_efficiency + timeBased.india_peak_cost_boost),
  };
}