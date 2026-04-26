# BramhaShiv AI

Smart multi-provider coding router built as a plugin on top of [OpenCode](https://github.com/sst/opencode). Classifies each task with a cheap LLM (Gemini Flash) and routes it to the best-fit model from your catalog — Claude (via OAuth), Gemini (via API key), or free HuggingFace models (Kimi K2.6, Qwen3 Coder, DeepSeek V3.2).

Name comes from **Brahma** (Hindu god of creation) + **Shiva** (architect / formation) — the AI that creates and shapes code with the right tool for the job.

---

## What it does

- You type a coding task.
- Gemini Flash reads it and emits six trait weights (long-context, deep-reasoning, tool-use-accuracy, speed, frontend-taste, cost-efficiency).
- Each model in your catalog is scored `Σ weight × model_score`.
- The top-ranked model runs your task via OpenCode's normal tool loop.
- OpenCode's own model indicator shows the final choice on every turn.

## Scope

**v1 (this release):** server plugin for OpenCode's `chat.message` hook, trait-based routing, user-editable YAML catalog, env-var override, local override telemetry. Auto-routing reuses OpenCode's existing Google API key — zero extra setup.

**v1.1+ roadmap:** TUI plugin with `/model` dialog picker + `/route` debug command, OpenAI/GPT-5 via Codex CLI subprocess, auto-detect provider availability so unauthed/depleted models drop out of routing automatically.

See `docs/opencode-plugin-audit.md` for the findings that shaped this split.

---

## Install

```bash
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai/bramhashiv
bun install
```

Then add to your OpenCode config at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///absolute/path/to/bramhashiv-ai/bramhashiv/src/plugin-server.ts"
  ]
}
```

On first activation, BramhaShiv copies `config/default-catalog.yaml` to `~/.config/bramhashiv/catalog.yaml` — edit freely, hot-reloaded on save.

Verify with `opencode debug config --print-logs --log-level INFO` — you should see `service=plugin path=...bramhashiv... loading plugin`.

### Classifier API key

The classifier auto-reads your Google API key from OpenCode's `~/.local/share/opencode/auth.json` (set when you ran `opencode providers login` for Google). **No extra setup needed** if Google is already authed as `type: api`.

To override (e.g. for CI or a different key):

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=<your-key>
# or
export GEMINI_API_KEY=<your-key>
```

Without any key, BramhaShiv falls back to neutral weights (still routes, but less informed).

---

## Usage

Just use OpenCode normally. BramhaShiv hooks `chat.message` and rewrites the model on every user turn.

### Pinning a model

Two ways to pin the router to a specific model:

**Env var (session-wide):**
```bash
BRAMHASHIV_PIN=google/gemini-flash-latest opencode run "your task"
```

**State file (persistent):** edit `~/.config/bramhashiv/state.json`:
```json
{
  "pinned_model_id": "google/gemini-flash-latest",
  "last_label": null,
  "last_classifier": null
}
```

Clear the pin by setting `pinned_model_id` to `null` or unsetting the env var.

### Tuning the catalog

Open `~/.config/bramhashiv/catalog.yaml` and adjust any model's scores (0–10 per trait). Hot-reloaded, no restart.

Verify model IDs against OpenCode's actual list:

```bash
opencode models google
opencode models huggingface
opencode models anthropic
```

If a model in your catalog isn't in OpenCode's list, dispatch will fail with `ProviderModelNotFoundError`.

---

## How routing works

1. Classifier (Gemini Flash) reads your task and outputs six trait weights in `0..1`.
2. Each catalog model is scored: `score = Σ weight × model.score`. Hard filters (e.g. `min_context`) prune unsuitable models when the corresponding trait weight is high.
3. Top-ranked model runs the task. If it's rate-limited or unavailable, the next-ranked model runs — logged to `~/.config/bramhashiv/overrides.log`.
4. If you've pinned a model whose id differs from the auto-top choice, BramhaShiv logs the override event so you can review which tasks benefit from which model.

### Availability filtering

Two layers keep the router from picking models you can't reach:

- **At activation** — providers missing from `~/.local/share/opencode/auth.json` (i.e. you haven't run `opencode providers login` for them) are dropped. No more `ProviderModelNotFoundError` or auth-not-configured failures.
- **During the session** — when a dispatch fails with `ProviderAuthError` or an `APIError` with status 402/429/503/529, the offending model is added to the session's unavailable set. Next turns route around it. Useful when HF free quota depletes mid-session or a provider rate-limits you.

Unavailable state is **per OpenCode process** — it resets when you restart. If you need it persistent, edit your catalog or use `BRAMHASHIV_PIN`.

---

## Development

```bash
bun install
bun test            # 74 unit + harness + golden-set tests
bun run typecheck
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts   # real Gemini call
```

---

## v2 roadmap

- Subagents (nested routing through the same router).
- Confidence-based confirm prompts when the classifier is uncertain.
- Auto-tune catalog weights from override telemetry.
- Shared community catalog registry.

See `../docs/superpowers/specs/2026-04-23-bramhashiv-ai-design.md` for the original design spec and full v2 backlog.

---

## Author

Made by **Abhirup Guha**.

## License

Licensed under the [Apache License 2.0](./LICENSE). Copyright © 2026 Abhirup Guha.
