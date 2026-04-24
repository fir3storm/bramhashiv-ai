# BramhaShiv AI

Smart multi-provider coding router built as a plugin on top of [OpenCode](https://github.com/sst/opencode). Classifies each task with a cheap LLM (Gemini Flash) and routes it to the best-fit model from your catalog — Claude (via Max OAuth), Gemini (via Google Pro OAuth), or free HuggingFace models (Kimi K2, Qwen Coder, DeepSeek).

Name comes from **Brahma** (Hindu god of creation) + **Shiva** (architect / formation) — the AI that creates and shapes code with the right tool for the job.

---

## What it does

- You type a coding task.
- Gemini Flash reads it and emits six trait weights (long-context, deep-reasoning, tool-use-accuracy, speed, frontend-taste, cost-efficiency).
- Each model in your catalog is scored `Σ weight × model_score`.
- The top-ranked available model runs your task via OpenCode's normal tool loop.
- You always see which model was picked (OpenCode's own model indicator reflects the final choice).

## Scope

**v1 (this release):** server plugin for OpenCode's `chat.message` hook, trait-based routing, user-editable YAML catalog, env-var override, local override telemetry.

**v1.1+ (not yet shipped):** TUI plugin with `/model` dialog picker + `/route` debug command, OpenAI/GPT-5 via Codex CLI subprocess, classifier routed through OpenCode's native Google auth (no separate API key).

See `docs/opencode-plugin-audit.md` for the findings that shaped this split — specifically why TUI dialogs need Solid/JSX tooling and deferred to v1.1.

---

## Install

BramhaShiv is an OpenCode plugin. Install it into the OpenCode plugin dir and reference it in OpenCode's config `plugin` field.

```bash
# Clone or npm-install bramhashiv into your OpenCode plugins workspace:
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai/bramhashiv
bun install
```

Then in your OpenCode config (typically `~/.config/opencode/config.json` or project-level):

```json
{
  "plugin": ["/absolute/path/to/bramhashiv-ai/bramhashiv"]
}
```

On first activation, BramhaShiv copies `config/default-catalog.yaml` to `~/.config/bramhashiv/catalog.yaml` — edit freely, changes are picked up on save (hot reload).

### Classifier API key

For the cheap-LLM classifier, set one of:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=<your-key>
# or
export GEMINI_API_KEY=<your-key>
```

Without an API key, BramhaShiv falls back to neutral weights (still routes, but less smart). Getting an API key into OpenCode's native Google OAuth is on the v1.1 roadmap.

---

## Usage

Just use OpenCode normally. BramhaShiv hooks `chat.message` and rewrites the model on every user turn.

### Pinning a model (v1 override surface)

Two ways to pin the router to a specific model:

**Env var (session-wide):**
```bash
BRAMHASHIV_PIN=anthropic/claude-opus-4-7 opencode
```

**State file (persistent):** edit `~/.config/bramhashiv/state.json`:
```json
{
  "pinned_model_id": "google/gemini-flash",
  "last_label": null,
  "last_classifier": null
}
```

Clear the pin by setting `pinned_model_id` to `null` or unsetting the env var.

### Tuning the catalog

Open `~/.config/bramhashiv/catalog.yaml` and adjust any model's scores (0–10 per trait). Hot-reloaded, no restart.

---

## How routing works

1. Classifier (Gemini Flash) reads your task and outputs six trait weights in `0..1`.
2. Each catalog model is scored: `score = Σ weight × score`. Hard filters (e.g. `min_context`) prune unsuitable models when the corresponding trait weight is high.
3. Top-ranked model runs the task. If it's rate-limited, the next-ranked model runs — logged to `~/.config/bramhashiv/overrides.log`.
4. If you've pinned a model whose id differs from the auto-top choice, BramhaShiv logs the override event so you can review which tasks benefit from which model.

---

## Development

```bash
bun install
bun test            # 63 unit + golden-set tests
bun run typecheck
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts   # real Gemini call
```

---

## v2 roadmap

- Subagents (nested routing through same router).
- GPT-5 / ChatGPT Pro via Codex CLI subprocess.
- Confidence-based confirm prompts.
- Auto-tune catalog weights from override telemetry.
- Shared catalog registry.

See `../docs/superpowers/specs/2026-04-23-bramhashiv-ai-design.md` for the original design spec and v2 backlog.
