/**
 * Lightweight debug logger gated on BRAMHASHIV_DEBUG=1.
 *
 * Output goes to stderr via console.error so it shows up in
 * `opencode --print-logs --log-level INFO` without interfering with
 * the TUI's stdout rendering. When the env var is unset, dbg() is a
 * no-op (no string formatting, no overhead).
 *
 * Usage:
 *   import { dbg } from "./debug.js";
 *   dbg("classifier", { weights, fallback: classifier.fallback });
 *   dbg("router", { picked: decision.picked.id, top_traits });
 *   dbg("auth", { authed: [...authedProviders] });
 */

const ENABLED = process.env.BRAMHASHIV_DEBUG === "1";

export function dbg(scope: string, data?: unknown): void {
  if (!ENABLED) return;
  if (data === undefined) {
    console.error(`[bramhashiv:debug] ${scope}`);
  } else {
    try {
      console.error(`[bramhashiv:debug] ${scope}`, JSON.stringify(data));
    } catch {
      console.error(`[bramhashiv:debug] ${scope}`, "[unserializable]");
    }
  }
}

export function isDebugEnabled(): boolean {
  return ENABLED;
}
