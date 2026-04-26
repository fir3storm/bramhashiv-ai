import type { Catalog } from "./types.js";

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

/**
 * Decide which model IDs should be added to the unavailable set in response
 * to a session.error event. Returns an array (possibly empty); callers add
 * each to their session-scoped unavailable Set.
 */
export function modelsToMarkUnavailable(
  error: SessionErrorPayload,
  lastRoutedModelId: string | null,
  catalog: Catalog,
): string[] {
  if (error.name === "ProviderAuthError") {
    const providerID = error.data?.providerID;
    if (!providerID) return [];
    return catalog.models.filter((m) => m.provider === providerID).map((m) => m.id);
  }

  if (error.name === "APIError" || error.name === "ApiError") {
    const status = error.data?.statusCode;
    if (status === undefined || !lastRoutedModelId) return [];

    if (ACCOUNT_LEVEL_STATUSES.has(status)) {
      const providerID = lastRoutedModelId.split("/")[0];
      if (!providerID) return [lastRoutedModelId];
      return catalog.models.filter((m) => m.provider === providerID).map((m) => m.id);
    }

    if (MODEL_LEVEL_STATUSES.has(status)) {
      return [lastRoutedModelId];
    }
  }

  return [];
}
