import type { Hooks, Plugin, PluginInput } from "@opencode-ai/plugin";
import { watchCatalog, type CatalogWatcher } from "./catalog.js";
import type { CompletionRunner } from "./classifier.js";
import { runRouterPipeline } from "./pipeline.js";
import { createTelemetryLogger, type TelemetryLogger } from "./telemetry.js";
import { readSharedState, writeSharedState, pruneUnavailable } from "./shared-state.js";
import type {
  UnavailableMark,
  HealthRecord,
  RegenerationRecord,
  ScoreAdjustment,
  TaskOutcome,
  WorkspaceContext,
} from "./types.js";
import { geminiFlashRunner } from "./gemini-runner.js";
import { getGoogleApiKey, getAuthedProviders } from "./opencode-auth.js";
import { modelsToMarkUnavailable, type SessionErrorPayload } from "./error-tracking.js";
import { analyzeWorkspace } from "./workspace.js";
import {
  findOrCreateHealth,
  recordError,
  recordSuccess,
} from "./health-monitor.js";
import { recordRegenerationHit, getRegenerationCount } from "./regeneration-tracker.js";
import { recordTaskOutcome, updateAdjustments } from "./learning.js";
import { heuristicShouldPlan, planTask } from "./planner.js";
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

    let errorMarks: UnavailableMark[] = [];
    let lastRoutedModelId: string | null = null;
    let healthRecords: HealthRecord[] = [];
    let regenerationRecords: RegenerationRecord[] = [];
    let learnedAdjustments: ScoreAdjustment[] = [];
    let taskHistory: TaskOutcome[] = [];
    let workspaceCtx: WorkspaceContext | null = null;
    let lastTaskText: string = "";
    let lastDecisionId: string | null = null;
    let taskStartTime: number = 0;
    let regenerationCount: number = 0;

    // ── Hydrate from state.json ────────────────────────────────────────────
    {
      const initial = await readSharedState(config.statePath);
      errorMarks = pruneUnavailable(initial.unavailable);
      healthRecords = initial.provider_health;
      regenerationRecords = initial.regeneration_records;
      learnedAdjustments = initial.learned_adjustments;
      taskHistory = initial.task_history;
      dbg("activation", {
        catalogModels: watcher.current().models.length,
        loadedMarks: errorMarks.length,
        healthRecords: healthRecords.length,
        regenerationRecords: regenerationRecords.length,
        learnedAdjustments: learnedAdjustments.length,
        taskHistory: taskHistory.length,
      });
    }

    // ── Workspace analysis (cached for the session) ────────────────────────
    try {
      workspaceCtx = analyzeWorkspace(process.cwd());
      dbg("workspace", { summary: workspaceCtx.summary });
    } catch (err) {
      console.error("[bramhashiv] workspace analysis failed:", err);
    }

    function computeUnavailable(): Set<string> {
      const out = new Set<string>();
      const liveMarks = pruneUnavailable(errorMarks);
      if (liveMarks.length !== errorMarks.length) {
        errorMarks = liveMarks;
      }
      for (const m of liveMarks) out.add(m.id);

      const authed = config.authedProviders();
      for (const model of watcher.current().models) {
        if (!authed.has(model.provider)) out.add(model.id);
      }
      return out;
    }

    async function persistState(
      state: Awaited<ReturnType<typeof readSharedState>>,
      label?: string,
      classifier?: typeof state.last_classifier,
    ) {
      await writeSharedState(config.statePath, {
        pinned_model_id: state.pinned_model_id,
        last_label: label ?? state.last_label,
        last_classifier: classifier ?? state.last_classifier,
        unavailable: errorMarks,
        learned_adjustments: learnedAdjustments,
        task_history: taskHistory,
        regeneration_records: regenerationRecords,
        provider_health: healthRecords,
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

          // ── Regeneration detection ─────────────────────────────────────
          if (lastTaskText && text === lastTaskText && lastDecisionId) {
            regenerationCount = getRegenerationCount(regenerationRecords, lastDecisionId, text);
            regenerationCount += 1;
            regenerationRecords = recordRegenerationHit(regenerationRecords, lastDecisionId, text);
            dbg("regeneration", { model: lastDecisionId, count: regenerationCount, excerpt: text.slice(0, 80) });
          } else {
            regenerationCount = 0;
            lastTaskText = text;
          }

          const unavailable = computeUnavailable();
          const workspaceSummary = workspaceCtx?.summary ?? "";
          dbg("chat.message", {
            taskExcerpt: text.slice(0, 80),
            pinned,
            unavailableCount: unavailable.size,
            workspaceSummary,
            regenerationCount,
          });

          // ── Task decomposition check ───────────────────────────────────
          let plan = null;
          if (!pinned && text && heuristicShouldPlan(text) && config.runner) {
            try {
              plan = await planTask(text, workspaceSummary, config.runner);
              if (plan.is_complex && plan.subtasks.length > 1) {
                dbg("planner", { complex: true, subtasks: plan.subtasks.length, reasoning: plan.reasoning });
              }
            } catch {
              // Planner failure is non-fatal; fall through to normal routing.
            }
          }

          // ── Build scoring context ──────────────────────────────────────
          const scoringCtx = {
            healthRecords,
            regenerationRecords,
            adjustments: learnedAdjustments,
            taskExcerpt: text.slice(0, 120),
          };

          const { decision, classifier } = await runRouterPipeline({
            text,
            catalog: watcher.current(),
            pinnedModelId: pinned,
            unavailable,
            runner: config.runner,
            workspaceSummary,
            scoringCtx,
          });

          const parts = decision.picked.id.split("/");
          const providerID = parts[0];
          const modelID = parts.slice(1).join("/");
          if (providerID && modelID) {
            hookOutput.message.model = { providerID, modelID };
            lastRoutedModelId = decision.picked.id;
            lastDecisionId = decision.picked.id;
          }

          taskStartTime = Date.now();

          const planLabel = plan?.is_complex && plan.subtasks.length > 1
            ? ` [plan: ${plan.subtasks.length} subtasks]`
            : "";

          const label = `${decision.picked.id} (${decision.top_traits.join(" · ")})${planLabel}`;
          dbg("router.decision", {
            picked: decision.picked.id,
            label,
            classifierFallback: classifier.fallback,
            classifierWeights: classifier.weights,
            top5: decision.ranking.slice(0, 5).map((r) => ({
              id: r.model.id,
              score: Number(r.score.toFixed(2)),
            })),
            planComplex: plan?.is_complex ?? false,
            planSubtasks: plan?.subtasks.length ?? 0,
          });

          // ── Health: record usage attempt ───────────────────────────────
          if (providerID) {
            const h = findOrCreateHealth(healthRecords, providerID, decision.picked.id);
            healthRecords = h.records;
            healthRecords[h.index] = {
              ...h.record,
              last_used: Date.now(),
            };
          }

          await persistState(state, label, classifier);

          if (pinned && !classifier.fallback) {
            const autoDecision = await runRouterPipeline({
              text,
              catalog: watcher.current(),
              pinnedModelId: null,
              unavailable,
              runner: null,
              workspaceSummary,
              scoringCtx,
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

          // ── If planner produced subtasks, emit them as message parts ──
          if (plan?.is_complex && plan.subtasks.length > 1) {
            const planLines = [
              `\n--- Plan: ${plan.reasoning} ---`,
              ...plan.subtasks.map((st, i) =>
                `${i + 1}. ${st.description} (route: ${Object.entries(st.trait_weights)
                  .filter(([, v]) => v >= 0.5)
                  .map(([k]) => k.replace(/_/g, " "))
                  .join(", ") || "balanced"})`
              ),
              `---`,
            ];
            dbg("planner.subtasks", { lines: planLines });
          }
        } catch (err) {
          console.error("[bramhashiv] chat.message hook error:", err);
        }
      },
      event: async ({ event }) => {
        // ── Error tracking (existing) ─────────────────────────────────────
        if (event.type === "session.error") {
          const error = event.properties.error as SessionErrorPayload | undefined;
          if (error) {
            // Health: record error on the health record
            if (lastRoutedModelId) {
              const provider = lastRoutedModelId.split("/")[0];
              if (provider) {
                const h = findOrCreateHealth(healthRecords, provider, lastRoutedModelId);
                healthRecords = h.records;
                healthRecords[h.index] = recordError(h.record);
              }
            }

            const suggestion = modelsToMarkUnavailable(error, lastRoutedModelId, watcher.current());
            if (suggestion.ids.length > 0) {
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
                try {
                  const state = await readSharedState(config.statePath);
                  await persistState(state);
                } catch (err) {
                  console.error("[bramhashiv] failed to persist unavailable marks:", err);
                }
              }
            }
          }
        }

        // ── Health + Learning: message.updated (task completion) ───────
        if (event.type === "message.updated") {
          const props = event.properties as Record<string, unknown> | undefined;
          const msg = props?.message as { isComplete?: boolean } | undefined;
          if (msg?.isComplete && lastDecisionId && taskStartTime > 0) {
            const latencyMs = Date.now() - taskStartTime;
            const provider = lastDecisionId.split("/")[0];
            if (provider) {
              const h = findOrCreateHealth(healthRecords, provider, lastDecisionId);
              healthRecords = h.records;
              healthRecords[h.index] = recordSuccess(h.record, latencyMs);
            }

            const outcome: TaskOutcome = {
              task_excerpt: lastTaskText.slice(0, 120),
              model_id: lastDecisionId,
              success: true,
              latency_ms: latencyMs,
              regeneration_count: regenerationCount,
              diff_size: 0,
              timestamp: new Date().toISOString(),
            };
            taskHistory = recordTaskOutcome(taskHistory, outcome);
            learnedAdjustments = updateAdjustments(learnedAdjustments, outcome);

            void telemetry.logOutcome(outcome);

            dbg("task.complete", {
              model: lastDecisionId,
              latencyMs,
              healthScore: healthRecords[healthRecords.length - 1]?.health_score,
              regenerationCount,
              taskHistorySize: taskHistory.length,
              adjustments: learnedAdjustments.length,
            });

            try {
              const state = await readSharedState(config.statePath);
              await persistState(state);
            } catch (err) {
              console.error("[bramhashiv] failed to persist learned state:", err);
            }

            taskStartTime = 0;
          }
        }
      },
    };
  };
}

function resolveDefaultRunner(): CompletionRunner | null {
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
