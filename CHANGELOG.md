# Changelog

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

### Known limitations
- GPT-5 / ChatGPT Pro not supported (deferred to v1.1+).
- No TUI plugin in v1 — `/model` and `/route` slash commands deferred because OpenCode's TUI command API is zero-arg and the dialog picker needs Solid/JSX tooling. Overrides go through env var + state file for now.
- Classifier requires a standalone Gemini API key rather than reusing OpenCode's Google OAuth (v1.1 will wire it through natively).
- Provider smoke tests require `BRAMHASHIV_SMOKE=1` and a real `GOOGLE_GENERATIVE_AI_API_KEY`.
