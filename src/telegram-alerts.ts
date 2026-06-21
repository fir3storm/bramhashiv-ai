/**
 * Telegram bot alerts for BramhaShiv.
 *
 * Sends health drop alerts to a Telegram chat when model health falls below
 * threshold. Rate-limited to prevent spam (1 alert per model per window).
 * Includes retry with exponential backoff and circuit breaker.
 *
 * Configure via env vars:
 *   BRAMHASHIV_TELEGRAM_BOT_TOKEN=...   (BotFather token)
 *   BRAMHASHIV_TELEGRAM_CHAT_ID=...     (your chat ID, e.g. 123456789)
 *   BRAMHASHIV_TELEGRAM_RATE_LIMIT_MS=600000  (10 minutes, default)
 */

import { alerts } from "./config.js";

interface SentEntry {
  timestamp: number;
}

const sentTracker = new Map<string, SentEntry>();
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000; // 2s base delay

/** Per-model rate limiter. Clears entries older than rate_limit_ms. */
function recentSends(): Map<string, SentEntry> {
  const now = Date.now();
  for (const [key, entry] of sentTracker) {
    if (now - entry.timestamp > alerts.telegram_rate_limit_ms) {
      sentTracker.delete(key);
    }
  }
  return sentTracker;
}

/** Returns true if we sent an alert for this model within the rate-limit window. */
export function alreadySentRecently(modelId: string): boolean {
  return recentSends().has(modelId);
}

/** Mark that we just sent an alert for this model. */
export function markSent(modelId: string): void {
  sentTracker.set(modelId, { timestamp: Date.now() });
}

const TELEGRAM_API = "https://api.telegram.org/bot";

// Circuit breaker state
let circuitOpen = false;
let circuitOpenUntil = 0;

/** Send a message via Telegram Bot API with retry and circuit breaker. */
export async function sendTelegramAlert(message: string): Promise<void> {
  const token = alerts.telegram_bot_token;
  const chatId = alerts.telegram_chat_id;

  if (!token || !chatId) return;

  // Check circuit breaker
  if (circuitOpen && Date.now() < circuitOpenUntil) {
    return;
  }
  if (circuitOpen) {
    circuitOpen = false; // half-open: try again
  }

  const url = `${TELEGRAM_API}${token}/sendMessage`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      });
      if (res.ok) {
        circuitOpen = false;
        return;
      }
      const body = await res.text().catch(() => "");

      // 429 = rate limited, 5xx = server error — open circuit
      if (res.status === 429 || res.status >= 500) {
        circuitOpen = true;
        circuitOpenUntil = Date.now() + 60_000; // 1 minute cooldown
        console.error(`[bramhashiv] telegram circuit breaker opened (${res.status})`);
        return;
      }

      console.error(`[bramhashiv] telegram alert failed: ${res.status} ${body}`);
      if (res.status < 500) return; // client errors don't retry
    } catch (err) {
      console.error(`[bramhashiv] telegram alert error (attempt ${attempt + 1}): ${err}`);
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/** Check if Telegram is configured (both token and chat_id present). */
export function isTelegramConfigured(): boolean {
  return Boolean(alerts.telegram_bot_token && alerts.telegram_chat_id);
}

/** Format a health alert as a Telegram message. */
export function formatHealthAlert(modelId: string, healthScore: number, threshold: number): string {
  const status = healthScore < 0.3 ? "🔴 CRITICAL" : healthScore < 0.5 ? "🟠 DEGRADED" : "🟡 WARNING";
  return [
    `<b>${status}</b>`,
    `<b>BramhaShiv AI — Model Health Alert</b>`,
    ``,
    `Model: <code>${modelId}</code>`,
    `Health: <b>${(healthScore * 100).toFixed(0)}%</b>`,
    `Threshold: ${(threshold * 100).toFixed(0)}%`,
    ``,
    `This model has been marked unavailable. BramhaShiv will route around it.`,
  ].join("\n");
}