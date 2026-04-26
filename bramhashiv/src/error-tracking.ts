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

/** HTTP statuses that mean "this model is currently unreachable, try another." */
const UNAVAILABLE_STATUSES = new Set([402, 429, 503, 529]);

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
    if (status !== undefined && UNAVAILABLE_STATUSES.has(status) && lastRoutedModelId) {
      return [lastRoutedModelId];
    }
  }

  return [];
}
