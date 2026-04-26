<div align="center">

# 🕉️ BramhaShiv AI

### Smart multi-provider coding router for [OpenCode](https://github.com/sst/opencode)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-89%20passing-brightgreen)](./tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.json)
[![OpenCode](https://img.shields.io/badge/OpenCode-1.14.24-orange)](https://github.com/sst/opencode)
[![Made in India](https://img.shields.io/badge/Made%20in-India-FF9933?labelColor=138808)](#-author)

*Classifies each coding task with Gemini Flash and routes it to the best-fit model from a 19-model catalog spanning OpenAI (GPT-5.x via ChatGPT OAuth), Google (Gemini), Anthropic (Claude), HuggingFace, and OpenRouter.*

</div>

---

🪔 **The name** — **Brahma** (Hindu god of creation) + **Shiva** (the architect, destroyer of obstacles) — the AI that creates and shapes code with the right tool for each job.

---

## ✨ What it does

- 🎯 You type a coding task.
- 🧮 Gemini Flash reads it and emits six trait weights (`long-context`, `deep-reasoning`, `tool-use-accuracy`, `speed`, `frontend-taste`, `cost-efficiency`).
- 📊 Each catalog model is scored: `score = Σ weight × model.score`.
- 🚀 The top-ranked model runs your task via OpenCode's normal tool loop.
- 👀 OpenCode's own model indicator shows the final choice every turn.

---

## 📦 Scope

**v1 (this release):** server plugin for OpenCode's `chat.message` hook, trait-based routing, user-editable YAML catalog, env-var override, local override telemetry, auto-filter of unauthed/depleted providers. Auto-routing reuses OpenCode's existing Google API key — zero extra setup.

**v1.1+ roadmap:** TUI plugin with `/model` dialog picker + `/route` debug command, OpenAI/GPT-5 via Codex CLI subprocess, persistent unavailable-set with TTL.

See [`docs/opencode-plugin-audit.md`](./docs/opencode-plugin-audit.md) for the OpenCode plugin API findings that shaped v1's architecture.

---

## 🚀 Install

```bash
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai
bun install
```

Then add to your OpenCode config at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///absolute/path/to/bramhashiv-ai/src/plugin-server.ts"
  ]
}
```

On first activation, BramhaShiv copies `config/default-catalog.yaml` to `~/.config/bramhashiv/catalog.yaml` — edit freely, hot-reloaded on save.

✅ Verify with:

```bash
opencode debug config --print-logs --log-level INFO
```

You should see `service=plugin path=...bramhashiv... loading plugin`.

### 🔑 Classifier API key

The classifier auto-reads your Google API key from OpenCode's `~/.local/share/opencode/auth.json` (set when you ran `opencode providers login` for Google). **No extra setup needed** if Google is already authed as `type: api`.

To override (e.g. for CI or a different key):

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=<your-key>
# or
export GEMINI_API_KEY=<your-key>
```

Without any key, BramhaShiv falls back to neutral weights (still routes, but less informed).

### 🔐 Provider auth (one-time, per provider)

BramhaShiv only routes to providers OpenCode has credentials for. Run each you want:

```bash
opencode providers login -p anthropic     # OAuth — uses your Claude Max subscription
opencode providers login -p google        # paste a Gemini API key from https://ai.google.dev
opencode providers login -p huggingface   # paste an HF read token from https://huggingface.co/settings/tokens
opencode providers login -p openrouter    # paste an OpenRouter API key from https://openrouter.ai/keys
```

**Stacking strategy** (so you effectively never run out of credits):

| Tier | Provider | Why it matters |
|---|---|---|
| 1 | **OpenAI ChatGPT** (Plus / Team / Pro via OAuth) | Subscription-backed; access GPT-5.x family without an API key. 5h reset cycle. |
| 1 | **Anthropic** (API key) | Pay-per-token but cheap (Sonnet ~$3/M input). Note: Claude Pro/Max subscriptions do NOT grant API access. |
| 2 | **Google Gemini free** | ~1500 Flash + ~50 Pro requests/day, daily reset. |
| 3 | **OpenRouter free** | ~200 req/day, daily reset. Aggregator: many models behind one key (Llama, DeepSeek-R1, Qwen, etc.). |
| 4 | **HuggingFace free** | Monthly quota; resets 1st of each month. |

Each tier has an **independent quota** on a different reset cycle — three or four pools is enough redundancy that you rarely hit a wall during normal use. The router auto-skips providers without credentials and any model that returns 402/429/503/529 mid-session.

---

## 💻 Usage

Just use OpenCode normally. BramhaShiv hooks `chat.message` and rewrites the model on every user turn.

### 📌 Pinning a model

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

### 🎛️ Tuning the catalog

Open `~/.config/bramhashiv/catalog.yaml` and adjust any model's scores (0–10 per trait). Hot-reloaded, no restart.

Verify model IDs against OpenCode's actual list:

```bash
opencode models openai
opencode models google
opencode models openrouter
opencode models huggingface
opencode models anthropic
```

If a model in your catalog isn't in OpenCode's list, dispatch will fail with `ProviderModelNotFoundError`.

---

## 🧠 How routing works

1. **Classify** — Gemini Flash reads your task and outputs six trait weights in `0..1`.
2. **Score** — each catalog model is scored: `score = Σ weight × model.score`. Hard filters (e.g. `min_context`) prune unsuitable models when the corresponding trait weight is high.
3. **Dispatch** — top-ranked model runs the task. If rate-limited or unavailable, the next-ranked model runs — logged to `~/.config/bramhashiv/overrides.log`.
4. **Learn** — if you've pinned a model whose id differs from the auto-top choice, BramhaShiv logs the override so you can review which tasks benefit from which model.

### 🛡️ Availability filtering

Two layers keep the router from picking models you can't reach:

- 🔐 **At activation** — providers missing from `~/.local/share/opencode/auth.json` are dropped. No more `ProviderModelNotFoundError` or auth-not-configured failures.
- 🚧 **During the session** — when a dispatch fails with `ProviderAuthError` or an `APIError` with status `402` / `429` / `503` / `529`, the offending model is added to the session's unavailable set. Next turns route around it. Useful when HF free quota depletes mid-session or a provider rate-limits you.

Unavailable state is **per OpenCode process** — it resets when you restart. If you need it persistent, edit your catalog or use `BRAMHASHIV_PIN`.

---

## 🔧 Development

```bash
bun install
bun test            # 89 unit + harness + golden-set tests
bun run typecheck
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts   # real Gemini call
```

---

## 🛣️ v2 Roadmap

- 🤖 **Subagents** — nested routing through the same router.
- ❓ **Confidence prompts** — confirm with user when classifier is uncertain.
- 📈 **Auto-tune** catalog weights from override telemetry.
- 🌐 **Shared catalog registry** so users can share well-tuned configs.

---

## 👤 Author

Made by **Abhirup Guha**.

<p align="center">
  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2c/Flag-of-India.gif" alt="Flag of India" width="80" />
  <br/>
  <strong>🪔 Proudly created in <img src="https://upload.wikimedia.org/wikipedia/commons/2/2c/Flag-of-India.gif" alt="India" height="14" align="center" />, by an Indian — open-sourced for the betterment of the AI future.</strong>
</p>

---

## 🔒 Security

**Your credentials never touch this repo.** All API keys, OAuth tokens, and session data live in your home directory — `~/.local/share/opencode/auth.json` and `~/.config/bramhashiv/`. Cloning this repo gives you zero credentials; you must auth your own providers via `opencode providers login`. See [`SECURITY.md`](./SECURITY.md) for the full threat model and a credential scan you can run against any clone.

## 📜 License

Licensed under the [**Apache License 2.0**](./LICENSE). Copyright © 2026 Abhirup Guha.

<div align="center">
  <sub>If this saved you time, ⭐ star it on <a href="https://github.com/fir3storm/bramhashiv-ai">GitHub</a>.</sub>
</div>
