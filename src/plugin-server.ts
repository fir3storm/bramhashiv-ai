import { Plugin } from "@opencode/plugin";
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
  RouteDebugSnapshot,
  BudgetState,
  ClassifierResult,
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
import { checkHealthAlert } from "./alerts.js";
import { sendTelegramAlert, formatHealthAlert, alreadySentRecently, markSent, isTelegramConfigured } from "./telegram-alerts.js";
import { recordRegenerationHit, getRegenerationCount } from "./regeneration-tracker.js";
import { recordTaskOutcome, updateAdjustments } from "./learning.js";
import { readTeamState, writeTeamState, mergeWithTeamState } from "./team-sync.js";
import { heuristicShouldPlan, planTask } from "./planner.js";
import { dbg } from "./debug.js";
import { formatExplanationForDisplay } from "./explanation.js";
import { recordSpend, estimateTaskCost, getBudgetStatus } from "./budget.js";
import { detectIndiaContext, buildIndiaClassifierHint } from "./india-context.js";
import { semanticSimilarity } from "./semantic-similarity.js";
import {
  CATALOG_PATH,
  STATE_PATH,
  TELEMETRY_PATH,
  ensureUserCatalog,
} from "./config-paths.js";
import { alerts, dashboard as dashboardConfig, routingRules, warmup as warmupConfig } from "./config.js";
import { loadRoutingRules } from "./routing-rules.js";
import { predictNextModel } from "./model-warmup.js";
import { updateAffinity, computeAffinityBonus } from "./multiturn-affinity.js";
import { estimateConversationTokens } from "./context-pressure.js";
import { findDeprecatedModels, formatDeprecationWarning } from "./model-deprecation.js";
import { loadWebhookConfigs, sendWebhook } from "./webhook-alerts.js";
import { createHistoryBuffer, computeMetrics, buildHealthSnapshots, createDashboardServer } from "./dashboard.js";
import type { ConversationAffinity, WarmupHint, RoutingHistoryEntry, RoutingRule, WebhookConfig } from "./types.js";

const CLASSIFIER_CACHE_THRESHOLD = 0.85;

/** Handles health alert: logs to console and sends Telegram if configured. */
async function handleHealthAlert(record: HealthRecord, webhookCfgs: WebhookConfig[] = []): Promise<void> {
  const alert = checkHealthAlert(record);
  if (!alert) return;
  console.warn(alert);

  // Telegram: rate-limited to one per model per window
  if (isTelegramConfigured() && !alreadySentRecently(record.model_id)) {
    const msg = formatHealthAlert(record.model_id, record.health_score, alerts.health_drop_threshold);
    markSent(record.model_id);
    // Fire-and-forget; non-fatal if it fails
    sendTelegramAlert(msg).catch(() => {});
  }

  // Webhooks (Feature #7): fire matching webhooks for health_drop events
  for (const cfg of webhookCfgs) {
    sendWebhook(cfg, {
      event: "health_drop",
      severity: record.health_score < 0.3 ? "critical" : "warning",
      message: alert,
      model_id: record.model_id,
      data: { health_score: record.health_score },
      timestamp: new Date().toISOString(),
      source: "bramhashiv-ai",
    }).catch(() => {});
  }
}

export interface ServerPluginConfig {
  catalogPath: string;
  statePath: string;
  telemetryPath: string;
  runner: CompletionRunner | null;
  ensureCatalog: () => void;
  authedProviders: () => Set<string>;
}

export function createServerPlugin(config: ServerPluginConfig): Plugin.Plugin {
  return Plugin.define({
    id: "bramhashiv",
    async setup(ctx) {
      config.ensureCatalog();
      let watcher: CatalogWatcher;
      try {
        watcher = watchCatalog(config.catalogPath);
      } catch (err) {
        console.error("[bramhashiv] catalog load failed, plugin disabled:", err);
        return;
      }
      const telemetry: TelemetryLogger = createTelemetryLogger(config.telemetryPath);

      let errorMarks: UnavailableMark[] = [];
      let healthRecords: HealthRecord[] = [];
      let regenerationRecords: RegenerationRecord[] = [];
      let learnedAdjustments: ScoreAdjustment[] = [];
      let taskHistory: TaskOutcome[] = [];
      let workspaceCtx: WorkspaceContext | null = null;
      let budgetState: BudgetState | null = null;
      const conversationHistory: string[] = [];

      interface PendingTurn {
        messageID: string;
        modelId: string;
        taskText: string;
        startTime: number;
        regenerationCount: number;
        abTest: boolean;
        diffSize: number;
      }
      interface SessionMemory {
        lastTaskText: string;
        lastModelId: string | null;
      }
      const pendingTurns = new Map<string, PendingTurn[]>();
      const sessionMemory = new Map<string, SessionMemory>();
      const admittedPrompts = new Set<string>();

      // Classifier cache: stores last task text and its classification result
      let cachedTaskText: string = "";
      let cachedClassifier: ClassifierResult | null = null;

      // New feature state
      let conversationAffinity: ConversationAffinity | null = null;
      let warmupHint: WarmupHint | null = null;
      let routingRulesList: RoutingRule[] = [];
      let webhookConfigs: WebhookConfig[] = [];
      const dashboardStartTime = Date.now();
      const historyBuffer = createHistoryBuffer(dashboardConfig.max_history);
      let dashboardServer: { stop: () => void } | null = null;

      // ── Hydrate from state.json ────────────────────────────────────────────
      {
        const initial = await readSharedState(config.statePath);
        const team = readTeamState();
        const merged = team ? mergeWithTeamState(initial, team) : initial;
        errorMarks = pruneUnavailable(merged.unavailable);
        healthRecords = merged.provider_health;
        regenerationRecords = merged.regeneration_records;
        learnedAdjustments = merged.learned_adjustments;
        taskHistory = merged.task_history;
        budgetState = merged.budget ?? null;
        dbg("activation", {
          catalogModels: watcher.current().models.length,
          loadedMarks: errorMarks.length,
          healthRecords: healthRecords.length,
          regenerationRecords: regenerationRecords.length,
          learnedAdjustments: learnedAdjustments.length,
          taskHistory: taskHistory.length,
          budgetState: budgetState ? { daily: budgetState.daily_spend, monthly: budgetState.monthly_spend } : null,
          teamSync: team !== null,
        });
      }

      // ── Workspace analysis (cached for the session) ────────────────────────
      try {
        workspaceCtx = analyzeWorkspace(process.cwd());
        dbg("workspace", { summary: workspaceCtx.summary });
      } catch (err) {
        console.error("[bramhashiv] workspace analysis failed:", err);
      }

      // ── Load routing rules (Feature #3) ────────────────────────────────────
      if (routingRules.enabled) {
        try {
          routingRulesList = loadRoutingRules(routingRules.rules_path);
          dbg("routing_rules", { loaded: routingRulesList.length });
        } catch (err) {
          console.error("[bramhashiv] failed to load routing rules:", err);
        }
      }

      // ── Load webhook configs (Feature #7) ──────────────────────────────────
      try {
        webhookConfigs = loadWebhookConfigs("");
        dbg("webhooks", { loaded: webhookConfigs.length });
      } catch (err) {
        console.error("[bramhashiv] failed to load webhook configs:", err);
      }

      // ── Check for deprecated models (Feature #4) ───────────────────────────
      const deprecated = findDeprecatedModels(watcher.current());
      if (deprecated.length > 0) {
        for (const notice of deprecated) {
          console.warn(formatDeprecationWarning(notice));
        }
      }

      // ── Start dashboard server if enabled (Feature #1) ─────────────────────
      if (dashboardConfig.enabled) {
        try {
          dashboardServer = createDashboardServer({
            port: dashboardConfig.port,
            getHistory: () => historyBuffer.getAll(),
            getHealth: () => buildHealthSnapshots(healthRecords, computeUnavailable()),
            getBudget: () => ({
              daily_spend: budgetState?.daily_spend ?? 0,
              monthly_spend: budgetState?.monthly_spend ?? 0,
              daily_limit: 0,
              monthly_limit: 0,
              near_limit: false,
              over_limit: false,
            }),
            getMetrics: () => computeMetrics(historyBuffer.getAll(), dashboardStartTime),
          });
        } catch (err) {
          console.error("[bramhashiv] failed to start dashboard:", err);
        }
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
        routeDebug?: RouteDebugSnapshot,
      ) {
        const toWrite = {
          schema_version: 1,
          pinned_model_id: state.pinned_model_id,
          last_label: label ?? state.last_label,
          last_classifier: classifier ?? state.last_classifier,
          last_route_debug: routeDebug ?? state.last_route_debug ?? null,
          unavailable: errorMarks,
          learned_adjustments: learnedAdjustments,
          task_history: taskHistory,
          regeneration_records: regenerationRecords,
          provider_health: healthRecords,
          budget: budgetState ?? undefined,
        };
        await writeSharedState(config.statePath, toWrite);
        writeTeamState(toWrite);
      }

      async function persistOutcome(outcome: TaskOutcome, errorLabel: string) {
        taskHistory = recordTaskOutcome(taskHistory, outcome);
        learnedAdjustments = updateAdjustments(learnedAdjustments, outcome);
        await telemetry.logOutcome(outcome);
        try {
          const state = await readSharedState(config.statePath);
          await persistState(state);
        } catch (err) {
          console.error(errorLabel, err);
        }
      }

      function claimPrompt(messageID: string): boolean {
        if (admittedPrompts.has(messageID)) return false;
        admittedPrompts.add(messageID);
        if (admittedPrompts.size > 500) {
          const oldest = admittedPrompts.values().next().value;
          if (oldest) admittedPrompts.delete(oldest);
        }
        return true;
      }

      async function markUnavailable(ids: string[], ttlMs: number, reason: string) {
        if (ids.length === 0 || ttlMs <= 0) return;
        const expiresAt = Date.now() + ttlMs;
        const existing = new Set(errorMarks.map((m) => m.id));
        let added = 0;
        for (const id of ids) {
          if (existing.has(id)) continue;
          errorMarks.push({ id, expiresAt });
          existing.add(id);
          added += 1;
          console.error(
            `[bramhashiv] marking ${id} unavailable until ${new Date(expiresAt).toISOString()} (${reason})`,
          );
        }
        if (added === 0) return;
        dbg("event.session.error", { errorName: reason, marked: ids, ttlMs });
        try {
          const state = await readSharedState(config.statePath);
          await persistState(state);
        } catch (err) {
          console.error("[bramhashiv] failed to persist unavailable marks:", err);
        }
      }

      async function markFromError(modelId: string | null, raw: RawSessionError, ttlOverrideMs?: number) {
        const error = toSessionError(raw, modelId?.split("/")[0]);
        const suggestion = modelsToMarkUnavailable(error, modelId, watcher.current());
        await markUnavailable(suggestion.ids, ttlOverrideMs ?? suggestion.ttlMs, error.name);
      }

      function takeHead(sessionID: string): PendingTurn | undefined {
        const queue = pendingTurns.get(sessionID);
        if (!queue?.length) return undefined;
        const turn = queue.shift();
        if (queue.length === 0) pendingTurns.delete(sessionID);
        return turn;
      }

      async function settleTurn(turn: PendingTurn, success: boolean) {
        const latencyMs = Date.now() - turn.startTime;
        const provider = turn.modelId.split("/")[0];
        if (provider) {
          const h = findOrCreateHealth(healthRecords, provider, turn.modelId);
          healthRecords = h.records;
          healthRecords[h.index] = success ? recordSuccess(h.record, latencyMs) : recordError(h.record);
          await handleHealthAlert(healthRecords[h.index]!, success ? [] : webhookConfigs);
        }
        await persistOutcome(
          {
            task_excerpt: turn.taskText.slice(0, 120),
            model_id: turn.modelId,
            success,
            latency_ms: latencyMs,
            regeneration_count: turn.regenerationCount,
            diff_size: turn.diffSize,
            timestamp: new Date().toISOString(),
            ab_test: turn.abTest,
          },
          success
            ? "[bramhashiv] failed to persist learned state:"
            : "[bramhashiv] failed to persist failed outcome:",
        );
        if (success) {
          dbg("task.complete", {
            model: turn.modelId,
            latencyMs,
            sessionTurnsLeft: pendingTurns.size,
            regenerationCount: turn.regenerationCount,
            diffSize: turn.diffSize,
            abTest: turn.abTest,
          });
        }
      }

      // ── Prompt hook (migrated from V1 "chat.message") ──────────────────────
      await ctx.session.hook("prompt", async (event) => {
        if (!claimPrompt(event.messageID)) return;
        let committed = false;
        try {
          const text = (event.prompt.text ?? "").trim();

          const envPin = process.env.BRAMHASHIV_PIN?.trim() || null;
          const state = await readSharedState(config.statePath);
          const pinned = envPin ?? state.pinned_model_id;

          if (!text && !pinned) return;

          const previous = sessionMemory.get(event.sessionID);
          let regenerationCount = 0;
          // ── Regeneration detection ─────────────────────────────────────
          if (previous?.lastTaskText && text === previous.lastTaskText && previous.lastModelId) {
            regenerationCount = getRegenerationCount(regenerationRecords, previous.lastModelId, text) + 1;
            regenerationRecords = recordRegenerationHit(regenerationRecords, previous.lastModelId, text);
            dbg("regeneration", { model: previous.lastModelId, count: regenerationCount, excerpt: text.slice(0, 80) });
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
              const catalog = watcher.current();
              plan = await planTask(text, workspaceSummary, config.runner, catalog.custom_traits?.map((ct) => ct.name));
              if (plan.is_complex && plan.subtasks.length > 1) {
                dbg("planner", { complex: true, subtasks: plan.subtasks.length, reasoning: plan.reasoning });
              }
            } catch {
              // Planner failure is non-fatal; fall through to normal routing.
            }
          }

          // ── Build scoring context ──────────────────────────────────────
          const estimatedTokens = estimateConversationTokens(conversationHistory, text);
          const scoringCtx = {
            healthRecords,
            regenerationRecords,
            adjustments: learnedAdjustments,
            taskExcerpt: text.slice(0, 120),
            budgetState: budgetState ?? undefined,
            affinityModelId: conversationAffinity?.model_id,
            affinityBonus: conversationAffinity ? computeAffinityBonus(conversationAffinity, {
              long_context: 0.5, deep_reasoning: 0.5, tool_use_accuracy: 0.5,
              speed_priority: 0.5, frontend_taste: 0.5, cost_efficiency: 0.5
            }) : 0,
            estimatedTokens,
          };

          conversationHistory.push(text);
          if (conversationHistory.length > 20) conversationHistory.shift();

          const indiaSignal = detectIndiaContext(text);
          const indiaHint = buildIndiaClassifierHint(indiaSignal);
          const { decision, classifier } = await runRouterPipeline({
            text,
            catalog: watcher.current(),
            pinnedModelId: pinned,
            unavailable,
            runner: config.runner,
            workspaceSummary,
            scoringCtx,
            conversationHistory: [...conversationHistory],
            indiaHint,
            routingRules: routingRulesList,
            workspaceCtx: workspaceCtx ?? undefined,
          });

          const dryRun = process.env.BRAMHASHIV_DRY_RUN === "1";
          const parts = decision.picked.id.split("/");
          const providerID = parts[0];
          const modelID = parts.slice(1).join("/");
          if (providerID && modelID && !dryRun) {
            await ctx.session.switchModel({
              sessionID: event.sessionID,
              model: { providerID, id: modelID },
            });
          } else if (dryRun && providerID && modelID) {
            event.prompt.text += `\n[DRY RUN] Would route to: ${decision.picked.id} (${decision.top_traits.join(" · ")})\n`;
          }

          sessionMemory.set(event.sessionID, { lastTaskText: text, lastModelId: decision.picked.id });
          const queue = pendingTurns.get(event.sessionID) ?? [];
          queue.push({
            messageID: event.messageID,
            modelId: decision.picked.id,
            taskText: text,
            startTime: Date.now(),
            regenerationCount,
            abTest: decision.ab_test ?? false,
            diffSize: 0,
          });
          if (queue.length > 50) queue.shift();
          pendingTurns.set(event.sessionID, queue);
          committed = true;

          const planLabel = plan?.is_complex && plan.subtasks.length > 1
            ? ` [plan: ${plan.subtasks.length} subtasks]`
            : "";

          const label = `${decision.picked.id} (${decision.top_traits.join(" · ")})${planLabel}`;
          dbg("router.decision", {
            picked: decision.picked.id,
            label,
            classifierFallback: classifier.fallback,
            classifierConfidence: classifier.confidence,
            classifierWeights: classifier.weights,
            top5: decision.ranking.slice(0, 5).map((r) => ({
              id: r.model.id,
              score: Number(r.score.toFixed(2)),
            })),
            planComplex: plan?.is_complex ?? false,
            planSubtasks: plan?.subtasks.length ?? 0,
            ensembleFallback: decision.ensemble_fallback?.id ?? null,
            abTest: decision.ab_test ?? false,
          });

          // ── Emit routing explanation if enabled ─────────────────────────
          if (process.env.BRAMHASHIV_EXPLAIN === "1" && decision.explanation) {
            const explanationText = formatExplanationForDisplay(decision.explanation);
            event.prompt.text += `\n--- Routing Explanation ---\n${explanationText}\n---`;
          }

          // ── Budget: record estimated spend ─────────────────────────────
          if (budgetState) {
            const estimatedCost = estimateTaskCost(decision.picked);
            budgetState = recordSpend(budgetState, decision.picked, estimatedCost, text);
            const status = getBudgetStatus(budgetState);
            if (status.near_limit) {
              dbg("budget.near_limit", { daily: status.daily_spend, monthly: status.monthly_spend });
            }
          }

          // ── Health: record usage attempt ───────────────────────────────
          if (providerID) {
            const h = findOrCreateHealth(healthRecords, providerID, decision.picked.id);
            healthRecords = h.records;
            healthRecords[h.index] = {
              ...h.record,
              last_used: Date.now(),
            };
          }

          const routeDebug: RouteDebugSnapshot = {
            decision,
            unavailable: [...unavailable],
          };

          await persistState(state, label, classifier, routeDebug);

          if (pinned) {
            const autoDecision = await runRouterPipeline({
              text,
              catalog: watcher.current(),
              pinnedModelId: null,
              unavailable,
              runner: config.runner,
              workspaceSummary,
              scoringCtx,
            });
            if (autoDecision.decision.picked.id !== pinned) {
              await telemetry.logOverride({
                timestamp: new Date().toISOString(),
                task_excerpt: text.slice(0, 120),
                routed_to: autoDecision.decision.picked.id,
                user_picked: pinned,
                top_traits: autoDecision.decision.top_traits,
              });
            }
          }

          // ── If planner produced subtasks, emit them as message text ────
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
            event.prompt.text += planLines.join("\n");
            dbg("planner.subtasks", { lines: planLines });
          }

          // ── Feature #2: Warmup prediction ──────────────────────────────────
          if (warmupConfig.enabled) {
            const predictedHint = predictNextModel(
              decision,
              conversationHistory,
              watcher.current()
            );
            warmupHint = predictedHint;
            dbg("warmup", { hint: predictedHint });
          }

          // ── Feature #8: Update conversation affinity ───────────────────────
          conversationAffinity = updateAffinity(
            conversationAffinity,
            decision.picked.id,
            classifier.weights
          );

          // ── Feature #1: Track routing history for dashboard ────────────────
          if (dashboardConfig.enabled) {
            historyBuffer.push({
              timestamp: Date.now(),
              task_excerpt: text.slice(0, 80),
              picked_model: decision.picked.id,
              score: decision.ranking[0]?.score ?? 0,
              top_traits: decision.top_traits,
              was_fallback: decision.override_source === "fallback",
              was_ab_test: decision.ab_test ?? false,
            });
          }

          // Cache classifier result for similar future tasks
          cachedTaskText = text;
          cachedClassifier = classifier;
        } catch (err) {
          if (!committed) admittedPrompts.delete(event.messageID);
          console.error("[bramhashiv] prompt hook error:", err);
        }
      });

      await ctx.session.hook("retry", async (event) => {
        try {
          const modelId = `${event.model.providerID}/${event.model.id}`;
          // Short TTL: a retry may still succeed, so don't blacklist long-term.
          await markFromError(modelId, event.error, 60_000);
        } catch (err) {
          console.error("[bramhashiv] retry hook error:", err);
        }
      });

      await ctx.session.hook("http.response", async (event) => {
        if (event.kind !== "primary") return;
        try {
          const headers = event.response.headers;
          const remaining =
            headers.get("x-ratelimit-remaining") ??
            headers.get("x-ratelimit-requests-remaining") ??
            headers.get("x-ratelimit-remaining-requests") ??
            headers.get("anthropic-ratelimit-requests-remaining") ??
            headers.get("ratelimit-remaining");
          if (remaining === null) return;
          const remainingNum = Number(remaining);
          if (Number.isNaN(remainingNum) || remainingNum > 3) return;
          const modelId = `${event.model.providerID}/${event.model.id}`;
          console.log(
            `[bramhashiv] [quota] ${modelId} has ${remainingNum} requests remaining; cooling off for 5 min`,
          );
          await markUnavailable([modelId], 5 * 60 * 1000, "quota");
        } catch (err) {
          console.error("[bramhashiv] http.response hook error:", err);
        }
      });

      // ── Event stream (migrated from V1 "event" hook) ──────────────────────
      const ac = new AbortController();
      void (async () => {
        try {
          for await (const ev of ctx.event.subscribe({ signal: ac.signal })) {
            try {
              if (ev.type === "session.step.ended") {
                const turn = pendingTurns.get(ev.data.sessionID)?.[0];
                if (turn) {
                  turn.diffSize += editSize(ev.data);
                  if (ev.data.finish === "stop" || ev.data.finish === "length") {
                    const done = takeHead(ev.data.sessionID);
                    if (done) await settleTurn(done, true);
                  }
                }
              }

              if (ev.type === "session.step.failed") {
                const modelId = pendingTurns.get(ev.data.sessionID)?.[0]?.modelId ?? null;
                await markFromError(modelId, ev.data.error);
              }

              if (ev.type === "session.execution.interrupted") {
                pendingTurns.delete(ev.data.sessionID);
              }

              if (ev.type === "session.execution.failed") {
                const sessionID = ev.data.sessionID;
                const modelId = pendingTurns.get(sessionID)?.[0]?.modelId ?? null;
                await markFromError(modelId, ev.data.error);
                const failed = takeHead(sessionID);
                if (failed) await settleTurn(failed, false);
                pendingTurns.delete(sessionID);
              }

              if (ev.type === "session.execution.succeeded") {
                const turns = pendingTurns.get(ev.data.sessionID) ?? [];
                for (const turn of turns) await settleTurn(turn, true);
                pendingTurns.delete(ev.data.sessionID);
              }
            } catch (err) {
              console.error("[bramhashiv] event handler error:", err);
            }
          }
        } catch (err) {
          if (!ac.signal.aborted) {
            console.error("[bramhashiv] event stream error:", err);
          }
        }
      })();

      // ── Cleanup ──────────────────────────────────────────────────────────
      return () => {
        ac.abort();
        dashboardServer?.stop();
      };
    },
  });
}

function resolveDefaultRunner(): CompletionRunner | null {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY ??
    getGoogleApiKey() ??
    "";
  return apiKey ? geminiFlashRunner({ apiKey }) : null;
}

type RawSessionError = { type?: string; message?: string; status?: number };

function errorTokens(type: string | undefined): Set<string> {
  return new Set((type ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function classifyErrorName(type: string | undefined, status: number | undefined): string {
  const tokens = errorTokens(type);
  if (
    status === 401 ||
    status === 403 ||
    tokens.has("auth") ||
    tokens.has("unauthorized") ||
    tokens.has("authentication")
  ) {
    return "ProviderAuthError";
  }
  if (status !== undefined || tokens.has("api") || tokens.has("rate") || tokens.has("ratelimit")) {
    return "ApiError";
  }
  if (tokens.has("abort")) return "MessageAbortedError";
  if (tokens.has("overflow") || tokens.has("context")) return "ContextOverflowError";
  if (tokens.has("content") || tokens.has("filter")) return "ContentFilterError";
  return type || "UnknownError";
}

function toSessionError(raw: RawSessionError, providerID: string | undefined): SessionErrorPayload {
  return {
    name: classifyErrorName(raw.type, raw.status),
    data: {
      providerID,
      statusCode: raw.status,
      message: raw.message,
    },
  };
}

// V2 step events expose touched paths and output tokens, not a line diff.
function editSize(data: { files?: readonly string[] | undefined; tokens?: { output?: number } | undefined }): number {
  const fileCount = data.files?.length ?? 0;
  if (fileCount === 0) return 0;
  const output = data.tokens?.output;
  if (typeof output === "number" && Number.isFinite(output) && output > 0) return output;
  return fileCount;
}

export const bramhashivServer: Plugin.Plugin = createServerPlugin({
  catalogPath: CATALOG_PATH,
  statePath: STATE_PATH,
  telemetryPath: TELEMETRY_PATH,
  runner: resolveDefaultRunner(),
  ensureCatalog: ensureUserCatalog,
  authedProviders: () => getAuthedProviders(),
});

export default bramhashivServer;
