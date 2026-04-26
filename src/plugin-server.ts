import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { watchCatalog, type CatalogWatcher } from "./catalog.js";
import type { CompletionRunner } from "./classifier.js";
import { runRouterPipeline } from "./pipeline.js";
import { createTelemetryLogger, type TelemetryLogger } from "./telemetry.js";
import { readSharedState, writeSharedState, pruneUnavailable } from "./shared-state.js";
import type { UnavailableMark } from "./types.js";
import { geminiFlashRunner } from "./gemini-runner.js";
import { getGoogleApiKey, getAuthedProviders } from "./opencode-auth.js";
import { modelsToMarkUnavailable, type SessionErrorPayload } from "./error-tracking.js";
import { dbg } from "./debug.js";
import {
  CATALOG_PATH,
  STATE_PATH,
  TELEMETRY_PATH,
  ensureUserCatalog,
} from "./config-paths.js";

export interface ServerPluginConfig {
  catalogPath: string;
  statePath: string;
  telemetryPath: string;
  runner: CompletionRunner | null;
  ensureCatalog: () => void;
  /** Re-evaluated each turn so `opencode providers login` mid-session is picked up. */
  authedProviders: () => Set<string>;
}

export function createServerPlugin(config: ServerPluginConfig): Plugin {
  return async (_input: PluginInput): Promise<Hooks> => {
    config.ensureCatalog();
    let watcher: CatalogWatcher;
    try {
      watcher = watchCatalog(config.catalogPath);
    } catch (err) {
      console.error("[bramhashiv] catalog load failed, plugin disabled:", err);
      return {};
    }
    const telemetry: TelemetryLogger = createTelemetryLogger(config.telemetryPath);

    /**
     * Persistent error-marked unavailable set, hydrated from state.json on
     * activation and synced back whenever new marks are added. Holds full
     * UnavailableMark records so we can prune by TTL on each turn.
     */
    let errorMarks: UnavailableMark[] = [];
    let lastRoutedModelId: string | null = null;

    // Hydrate error marks from previous session (filtering expired entries).
    {
      const initial = await readSharedState(config.statePath);
      errorMarks = pruneUnavailable(initial.unavailable);
      dbg("activation", {
        catalogModels: watcher.current().models.length,
        loadedMarks: errorMarks.length,
        debug: true,
      });
    }

    /** Compute the per-turn unavailable set: errors (TTL-pruned) + unauthed providers (fresh). */
    function computeUnavailable(): Set<string> {
      const out = new Set<string>();
      const liveMarks = pruneUnavailable(errorMarks);
      if (liveMarks.length !== errorMarks.length) {
        errorMarks = liveMarks; // drop expired
      }
      for (const m of liveMarks) out.add(m.id);

      // Re-read auth on every turn so `opencode providers login` mid-session works.
      const authed = config.authedProviders();
      for (const model of watcher.current().models) {
        if (!authed.has(model.provider)) out.add(model.id);
      }
      return out;
    }

    async function persistMarks(state: Awaited<ReturnType<typeof readSharedState>>) {
      await writeSharedState(config.statePath, {
        ...state,
        unavailable: errorMarks,
      });
    }

    return {
      "chat.message": async (_hookInput, hookOutput) => {
        try {
          const text = hookOutput.parts
            .map((p) => (p.type === "text" ? p.text : ""))
            .join("\n")
            .trim();

          const envPin = process.env.BRAMHASHIV_PIN?.trim() || null;
          const state = await readSharedState(config.statePath);
          const pinned = envPin ?? state.pinned_model_id;

          if (!text && !pinned) return;

          const unavailable = computeUnavailable();
          dbg("chat.message", {
            taskExcerpt: text.slice(0, 80),
            pinned,
            unavailableCount: unavailable.size,
          });

          const { decision, classifier } = await runRouterPipeline({
            text,
            catalog: watcher.current(),
            pinnedModelId: pinned,
            unavailable,
            runner: config.runner,
          });

          const parts = decision.picked.id.split("/");
          const providerID = parts[0];
          const modelID = parts.slice(1).join("/");
          if (providerID && modelID) {
            hookOutput.message.model = { providerID, modelID };
            lastRoutedModelId = decision.picked.id;
          }

          const label = `${decision.picked.id} (${decision.top_traits.join(" · ")})`;
          dbg("router.decision", {
            picked: decision.picked.id,
            label,
            classifierFallback: classifier.fallback,
            classifierWeights: classifier.weights,
            top5: decision.ranking.slice(0, 5).map((r) => ({ id: r.model.id, score: Number(r.score.toFixed(2)) })),
          });

          await writeSharedState(config.statePath, {
            pinned_model_id: state.pinned_model_id,
            last_label: label,
            last_classifier: classifier,
            unavailable: errorMarks,
          });

          if (pinned && !classifier.fallback) {
            const autoDecision = await runRouterPipeline({
              text,
              catalog: watcher.current(),
              pinnedModelId: null,
              unavailable,
              runner: null,
            });
            if (autoDecision.decision.picked.id !== pinned) {
              void telemetry.logOverride({
                timestamp: new Date().toISOString(),
                task_excerpt: text.slice(0, 120),
                routed_to: autoDecision.decision.picked.id,
                user_picked: pinned,
                top_traits: decision.top_traits,
              });
            }
          }
        } catch (err) {
          console.error("[bramhashiv] chat.message hook error:", err);
        }
      },
      event: async ({ event }) => {
        if (event.type !== "session.error") return;
        const error = event.properties.error as SessionErrorPayload | undefined;
        if (!error) return;
        const suggestion = modelsToMarkUnavailable(error, lastRoutedModelId, watcher.current());
        if (suggestion.ids.length === 0) return;

        const expiresAt = Date.now() + suggestion.ttlMs;
        const existing = new Set(errorMarks.map((m) => m.id));
        let added = 0;
        for (const id of suggestion.ids) {
          if (!existing.has(id)) {
            errorMarks.push({ id, expiresAt });
            existing.add(id);
            added += 1;
            console.error(
              `[bramhashiv] marking ${id} unavailable until ${new Date(expiresAt).toISOString()} (${error.name})`,
            );
          }
        }
        if (added > 0) {
          dbg("event.session.error", { errorName: error.name, marked: suggestion.ids, ttlMs: suggestion.ttlMs });
          // Persist new marks so they survive across opencode-run invocations.
          try {
            const state = await readSharedState(config.statePath);
            await persistMarks(state);
          } catch (err) {
            console.error("[bramhashiv] failed to persist unavailable marks:", err);
          }
        }
      },
    };
  };
}

function resolveDefaultRunner(): CompletionRunner | null {
  // Priority: explicit env var first (for CI / override), then reuse
  // OpenCode's Google API key from auth.json so users don't need to set
  // up a separate Gemini key.
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    getGoogleApiKey() ??
    "";
  return apiKey ? geminiFlashRunner({ apiKey }) : null;
}

export const bramhashivServer: Plugin = createServerPlugin({
  catalogPath: CATALOG_PATH,
  statePath: STATE_PATH,
  telemetryPath: TELEMETRY_PATH,
  runner: resolveDefaultRunner(),
  ensureCatalog: ensureUserCatalog,
  authedProviders: () => getAuthedProviders(),
});

export default { id: "bramhashiv", server: bramhashivServer };
