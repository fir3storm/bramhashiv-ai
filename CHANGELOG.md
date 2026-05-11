# Changelog

## 0.2.0 — 2026-04-30

Major intelligence upgrade. Five new adaptive routing layers make BramhaShiv self-tuning.

### Added
- **Closed-loop learning** (`src/learning.ts`). Every completed task feeds back into the model catalog via EMA-decayed score adjustments. Fast successes boost `speed_priority` + `tool_use_accuracy` for the winning model; failures + regenerations penalize `deep_reasoning` + `tool_use_accuracy`. Deltas are capped at ±2.0 and decay at 0.99 per outcome. Persisted in `state.json` → `learned_adjustments`. Over time, the catalog auto-tunes to your real usage patterns without manual intervention.
- **Task decomposition planner** (`src/planner.ts` + `src/planner-prompt.ts`). Gemini Flash analyzes complex tasks (3+ concerns, heuristic score ≥ 3) and decomposes them into sub-task pipelines with per-subtask trait weights. The planner prompt describes the workspace context and outputs a JSON plan. Falls back gracefully to normal single-model routing on timeout/parse-failure. Complex tasks are ~50% of real-world coding sessions.
- **Workspace-aware classification** (`src/workspace.ts`). On activation, scans up to 500 files (depth 4) to detect language distribution, frontend/backend presence, test files, and git repo. The summary is injected into both the classifier prompt ("this is a TypeScript frontend with tests") and the planner prompt. Project context makes classification more accurate — a "refactor this module" request in a Python backend routes differently than in a React frontend.
- **Regeneration intelligence** (`src/regeneration-tracker.ts`). Uses Jaccard similarity (threshold 0.7) to detect when the user re-sends the same task. Escalating penalties: 0.05 → 0.1 → 0.2 → 0.3 applied to the model's score after 1/2/3/4+ regenerations on the same task. Prevents the router from stubbornly re-picking a model that's clearly not delivering.
- **Provider health monitoring** (`src/health-monitor.ts`). Tracks per-model latency (EMA with α=0.7), error rate, and success rate. Converts to a 0–1 health score: 100% errors → ~0.3, high latency → ~0.7, clean → 1.0. The health penalty (0% / 5% / 12% / 25% at thresholds 0.8/0.5/0.3) is factored into every model's score **before** ranking. Unhealthy models sink in the ranking organically before they trigger hard error-blacklisting.
- **Centralized hyperparameter config** (`src/config.ts`). All tunable constants (learning rate, decay, health thresholds, regeneration TTL, planner timeout, etc.) are now read from `BRAMHASHIV_*` env vars with sensible defaults. Tune without redeploying: `BRAMHASHIV_LEARNING_RATE=0.1 BRAMHASHIV_HEALTH_DECAY=0.8 opencode`.

### Changed
- `/route` diagnostics now include the last classifier output, candidate rankings, skipped models, fallback state, and route reason from the previous decision.
- Catalog validation reports unavailable providers, unavailable model IDs, and duplicate catalog IDs before dispatch.
- GitHub community standards are filled in with a code of conduct, contributing guide, issue templates, and a pull request template.

### Tests
- 5 new test files: `workspace.test.ts` (15), `health-monitor.test.ts` (17), `regeneration-tracker.test.ts` (16), `learning.test.ts` (17), `planner.test.ts` (17). Total: 193 pass / 0 fail / 1 skip.

### Internal
- `scorer.ts`: `scoreAndRank()` accepts optional `ScoringContext` (health records, regeneration records, learned adjustments, task excerpt). All callers backward-compatible.
- `shared-state.ts`: 4 new persisted fields — `learned_adjustments`, `task_history`, `regeneration_records`, `provider_health`.
- `telemetry.ts`: new `logOutcome()` method writes `TaskOutcome` events to `overrides.log`.
- `classifier-prompt.ts`: `buildClassifierUserPrompt` accepts optional workspace summary parameter.

## 0.1.5 — 2026-04-27

Dogfood-polish release. Four real-world fixes caught while routing actual coding tasks through OpenCode TUI.

### Changed
- **Classifier timeout 4s → 8s.** Real Gemini Flash latency under TUI load was occasionally crossing 4s, dropping every classification into the fallback path. 8s gives the API headroom without making single-turn waits user-visible.
- **Fallback weights tilted toward speed + cost-efficiency.** When the classifier fails (timeout, network, malformed JSON), neutral weights used to favor all-rounders like Kimi K2.6 and Opus, burning subscription quota or hitting depleted free tiers. New defaults bias toward fast/cheap models so fallback routing prefers Gemini Flash / GPT-mini / MiMo Flash. Fixes the "every fallback turn picks Kimi → 402" pattern caught during INSEC dogfooding.

### Added
- **Persistent unavailable set with TTL** (`v0.1.6` from roadmap, pulled forward). Models marked unavailable due to rate-limits, account-quota errors, or auth failures now persist across separate `opencode run` invocations via `~/.config/bramhashiv/state.json` (new `unavailable` field). Per-model rate limits (429/503/529) get a 1h TTL; account-level signals (402, ProviderAuthError) get 12h. On every turn, expired entries are pruned automatically.
- **Hot auth reload** (`v0.1.7` from roadmap, pulled forward). The set of unauthed providers is now re-evaluated on **every** `chat.message` instead of once at activation. Run `opencode providers login -p anthropic` mid-session and your next prompt routes to Claude — no restart needed.
- **`BRAMHASHIV_DEBUG=1` verbose mode** (`v0.1.8` from roadmap, pulled forward). When set, plugin emits structured debug lines to stderr: classifier weights + fallback flag, top-5 ranked models with scores, picked model + reason. Routes to `opencode --print-logs --log-level INFO`. Diagnostic gold for tuning catalog scores or filing bug reports.

### Internal
- `error-tracking.modelsToMarkUnavailable` now returns `{ ids, ttlMs }` so callers know how long to respect each mark.
- `shared-state.SharedState` gains `unavailable: UnavailableMark[]` field. Backward-compatible: older state.json files without the field hydrate to `[]` cleanly.
- New module `src/debug.ts` with no-op `dbg()` when env var unset.
- Tests: 94/94 green (5 new tests for persistence + TTL pruning).

## 0.1.4 — 2026-04-27

### Fixed
- **402 errors now mark the entire provider unavailable**, not just the failing model. Previously, a HuggingFace `Payment Required` (free quota depleted) would only blacklist the specific model — so the router would walk the catalog hitting `Kimi-K2.6 → 402 → Kimi-K2-Thinking → 402 → Qwen → 402 …` until every HF model had failed individually. Now a single 402 from any HF model takes the whole provider out of rotation for the rest of the session, since 402 is an account-level signal. 429/503/529 (per-model rate limits) keep their model-only behavior.

### Spotted while dogfooding
- TUI sessions sometimes hit the classifier timeout under load → fall back to neutral weights → Kimi wins the score battle (high all-around catalog scores). Tracked for v0.1.5 (likely a higher classifier timeout + anti-Kimi tilt in the fallback weights).

## 0.1.3 — 2026-04-26

### Added
- **OpenAI provider** (`type: oauth`) — 5 models from the GPT-5.x family routable via your existing ChatGPT OAuth (Plus / Team / Pro subscription). No API key needed.
  - `openai/gpt-5.5` — flagship (deep_reasoning + frontend_taste 9–10)
  - `openai/gpt-5.5-fast` — speed variant
  - `openai/gpt-5.4` — balanced general
  - `openai/gpt-5.4-mini` — small/fast (speed_priority 10)
  - `openai/gpt-5.3-codex` — coding specialist (tool_use_accuracy 10)
- **OpenRouter provider** — 5 free-tier models behind one API key, daily reset:
  - `meta-llama/llama-3.3-70b-instruct:free`
  - `qwen/qwen-2.5-coder-32b-instruct:free`
  - `deepseek/deepseek-r1:free`
  - `google/gemini-2.0-flash-exp:free`
  - `nousresearch/hermes-3-llama-3.1-405b:free`
- **6 more HuggingFace specialists** — DeepSeek-R1-0528, Kimi-K2-Thinking, Qwen3-Next-Thinking (reasoning); Qwen3-Coder-Next (coding); GLM-4.7 (general); MiMo-V2-Flash (speed).
- **Provider auth + tiering guide** in README — documents the 4-tier credit-stacking strategy across OpenAI / Google / OpenRouter / HuggingFace.

### Validated
- End-to-end smoke test against live OpenCode 1.14.24 with all four providers active. Pin path + auto-routing both confirmed.
- Catalog grew 8 → 19 models across 5 providers, all IDs verified against `opencode models <provider>` listings.

## 0.1.2 — 2026-04-26

### Added
- **Auto-filter unauthed providers.** At activation, any catalog model whose provider isn't in `~/.local/share/opencode/auth.json` is dropped. No more `ProviderModelNotFoundError` from routing to a model you haven't authed.
- **Failure-based unavailable tracking.** Plugin hooks `session.error`. `ProviderAuthError` marks every model for that provider unavailable; `APIError` with status `402`/`429`/`503`/`529` marks the last routed model unavailable. Next turn within the session routes around it.
- 15 new unit tests (`opencode-auth.test.ts`, `error-tracking.test.ts`, harness e2e cases).

### Fixed
- v0.1.1 validation surfaced two real-world issues — both addressed:
  - Anthropic models in catalog caused dispatch errors when the user hadn't authed Anthropic.
  - HuggingFace 402 (free quota depleted) caused repeated failures with no fallback.

## 0.1.1 — 2026-04-25

### Fixed
- Plugin default export now includes the `id` field required by OpenCode's `readV1Plugin` for path-based plugins.
- Catalog model IDs corrected to match real provider listings (`gemini-flash` → `gemini-flash-latest`, `Kimi-K2-Instruct` → `Kimi-K2.6`, etc.).
- Classifier reuses OpenCode's Google API key from `auth.json`; no separate Gemini key needed.
- Classifier timeout bumped 2s → 4s to fit real Gemini Flash latency.

### Added
- Apache 2.0 LICENSE.
- Author + repository fields in `package.json`.

## 0.1.0 — 2026-04-24

Initial release.

### Added
- OpenCode server plugin that mutates `UserMessage.model` via the `chat.message` hook.
- Gemini Flash classifier with timeout + fallback to neutral weights.
- User-editable YAML model catalog with hot reload (chokidar-watched).
- Weighted dot-product scorer with `min_context` hard filter + `cost_efficiency` tie-break.
- Pipeline module (`runRouterPipeline`) that composes classifier + scorer + router.
- Override via `BRAMHASHIV_PIN` env var or `~/.config/bramhashiv/state.json`.
- Append-only JSONL override telemetry (local only).
- Seed catalog: Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5, Gemini 3 Pro / Flash, Kimi K2, Qwen 2.5 Coder 32B, DeepSeek V3.
- Golden-set integration test covering 25 hand-labeled tasks.

### Known limitations (at the time)
- GPT-5 / ChatGPT not supported (resolved in 0.1.3).
- No TUI plugin — `/model` and `/route` slash commands need Solid/JSX dialog tooling (still deferred to v1.1+).
- Classifier required a standalone Gemini API key (resolved in 0.1.1 — now reads OpenCode's auth.json).
