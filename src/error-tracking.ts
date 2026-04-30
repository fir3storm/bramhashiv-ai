import type { Catalog } from "./types.js";
import { errorTracking as cfg } from "./config.js";

/**
 * Subset of OpenCode session.error event payload we care about.
 * Mirrors @opencode-ai/sdk Event.SessionError but kept narrow so this
 * module is unit-testable without pulling in the full SDK type graph.
 */
export type SessionErrorPayload = {
  name: string;
  data?: {
    providerID?: string;
    statusCode?: number;
    message?: string;
  };
};

/**
 * 402 = Payment Required → typically an account-wide quota exhaustion (HF
 * monthly free tier dry, OpenAI billing failed, etc.). The whole provider's
 * worth of models is unreachable until billing/quota resets.
 */
const ACCOUNT_LEVEL_STATUSES = new Set([402]);

/**
 * 429/503/529 → per-model rate-limit or transient overload. Other models
 * from the same provider may still work.
 */
const MODEL_LEVEL_STATUSES = new Set([429, 503, 529]);

const MODEL_LEVEL_TTL_MS = cfg.model_ttl_ms;
const ACCOUNT_LEVEL_TTL_MS = cfg.account_ttl_ms;

export interface UnavailableSuggestion {
  ids: string[];
  ttlMs: number;
}

const NONE: UnavailableSuggestion = { ids: [], ttlMs: 0 };

/**
 * Decide which model IDs should be added to the unavailable set in response
 * to a session.error event, plus how long to keep them blacklisted.
 *
 * Returned ttlMs is the maximum time a caller should respect the mark; once
 * elapsed, the model can be retried.
 */
export function modelsToMarkUnavailable(
  error: SessionErrorPayload,
  lastRoutedModelId: string | null,
  catalog: Catalog,
): UnavailableSuggestion {
  if (error.name === "ProviderAuthError") {
    const providerID = error.data?.providerID;
    if (!providerID) return NONE;
    const ids = catalog.models.filter((m) => m.provider === providerID).map((m) => m.id);
    if (ids.length === 0) return NONE;
    return { ids, ttlMs: ACCOUNT_LEVEL_TTL_MS };
  }

  if (error.name === "APIError" || error.name === "ApiError") {
    const status = error.data?.statusCode;
    if (status === undefined || !lastRoutedModelId) return NONE;

    if (ACCOUNT_LEVEL_STATUSES.has(status)) {
      const providerID = lastRoutedModelId.split("/")[0];
      if (!providerID) return { ids: [lastRoutedModelId], ttlMs: ACCOUNT_LEVEL_TTL_MS };
      const ids = catalog.models.filter((m) => m.provider === providerID).map((m) => m.id);
      if (ids.length === 0) return { ids: [lastRoutedModelId], ttlMs: ACCOUNT_LEVEL_TTL_MS };
      return { ids, ttlMs: ACCOUNT_LEVEL_TTL_MS };
    }

    if (MODEL_LEVEL_STATUSES.has(status)) {
      return { ids: [lastRoutedModelId], ttlMs: MODEL_LEVEL_TTL_MS };
    }
  }

  return NONE;
}
