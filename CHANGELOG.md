# Changelog

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
