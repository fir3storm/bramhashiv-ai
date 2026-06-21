<div align="center">

# 🕉️ BramhaShiv AI

### Smart multi-provider coding router for [OpenCode](https://github.com/sst/opencode)

[![npm version](https://img.shields.io/npm/v/bramhashiv?color=cb3837&logo=npm)](https://www.npmjs.com/package/bramhashiv)
[![npm downloads](https://img.shields.io/npm/dm/bramhashiv?color=cb3837&logo=npm)](https://www.npmjs.com/package/bramhashiv)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Tests](https://img.shields.io/badge/tests-233%20passing-brightgreen)](./tests)
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

**v0.4 (current):** 25-layer adaptive routing — everything in v0.3 + live metrics dashboard + routing rules DSL + conflict detection & resolution + multi-turn conversation optimization + model warmup prediction + model deprecation & migration + automated benchmarking + streaming cost estimator + context window pressure scoring + generic webhook alerting. Server plugin for OpenCode's `chat.message` hook, user-editable YAML catalog, env-var override, local telemetry, auto-filter of unauthed/depleted providers. All tunable via `BRAMHASHIV_*` env vars.

---

## 🗒️ Changelog

### [v0.3.x] — 2026-05-24

**15 new features shipped:**

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Routing Explanation Engine** | Full scoring breakdown per model — see why your model was chosen with `BRAMHASHIV_EXPLAIN=1` |
| 2 | **Budget Guardrails** | Tracks spend, enforces daily/monthly caps, auto-penalizes expensive models near limits |
| 3 | **Semantic Task Clustering** | Embeddings-based task similarity replaces naive Jaccard — better regeneration detection |
| 4 | **Conversation-Aware Routing** | Last 20 turns fed to classifier for context-aware trait scoring |
| 5 | **Dry-Run / Preview Mode** | `BRAMHASHIV_DRY_RUN=1` shows chosen model without dispatching |
| 6 | **Custom Trait Dimensions** | Add domain-specific traits (e.g., `security_audit`, `data_science`) to `catalog.yaml` |
| 7 | **Multi-Model Ensemble** | Fallback dispatch to secondary model when primary is unavailable |
| 8 | **Proactive Quota Management** | Monitors `x-ratelimit-remaining` headers — cools off models at ≤3 requests remaining |
| 9 | **Latency SLO Mode** | Target response time setting — penalizes slow models with configurable threshold |
| 10 | **Time-Based & Scheduled Routing** | Night mode boosts cost-efficiency and speed during off-hours |
| 11 | **Team-Synced Learning** | Shared state across team via `BRAMHASHIV_TEAM_STATE_PATH` |
| 12 | **Project-Level Catalog Overrides** | `.bramhashiv/catalog.yaml` per project for team-specific model preferences |
| 13 | **A/B Testing Mode** | Route a percentage of traffic to #2 ranked model for validation |
| 14 | **Model Performance Alerts** | Console warning + optional Telegram alert when model health drops below threshold |
| 15 | **Import/Export State** | Backup and migrate routing state across machines |

**Bug fixes:**
- Fixed `complexity_threshold` too high (3 → 1.5) — planner now triggers correctly for multi-concern tasks
- Fixed type bugs across scorer, config, and planner modules

**Test coverage:** 233 passing tests (16 golden-set routing + plugin harness + unit tests)

**v1.0+ roadmap:** TUI plugin with `/model` dialog picker + `/route` debug command, shared catalog registry, confidence prompts.

See [`docs/opencode-plugin-audit.md`](./docs/opencode-plugin-audit.md) for the OpenCode plugin API findings that shaped v1's architecture.

---

## 🚀 Install

### One-liner (recommended)

```bash
opencode plugin bramhashiv
```

OpenCode pulls the package from npm and auto-registers it in your global config. Done.

### Manual via npm

```bash
# pick your favourite — bun, npm, pnpm, yarn all work
bun add bramhashiv
npm install bramhashiv
pnpm add bramhashiv
```

Then add to your OpenCode config at `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["bramhashiv"]
}
```

### From source (development / contributing)

```bash
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai
bun install
bun test          # 216 unit + harness + golden-set tests
```

Point OpenCode at your local clone:

```jsonc
{
  "plugin": [
    "file:///absolute/path/to/bramhashiv-ai/src/plugin-server.ts"
  ]
}
```

### First-run behavior

On first activation, BramhaShiv copies `config/default-catalog.yaml` to `~/.config/bramhashiv/catalog.yaml` — edit freely, hot-reloaded on save.

✅ Verify the plugin loaded:

```bash
opencode debug config --print-logs --log-level INFO
```

You should see `service=plugin name=bramhashiv loading plugin` (or `path=...bramhashiv...` for source installs).

📦 **Package on npm:** [npmjs.com/package/bramhashiv](https://www.npmjs.com/package/bramhashiv)

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
  "last_classifier": null,
  "last_route_debug": null
}
```

Clear the pin by setting `pinned_model_id` to `null` or unsetting the env var.

### 🎛️ Tuning the catalog

Open `~/.config/bramhashiv/catalog.yaml` and adjust any model's scores (0–10 per trait). Hot-reloaded, no restart.

**Project-level overrides:** drop a `.bramhashiv/catalog.yaml` in your project root. It merges with the global catalog — project-specific models override global ones by ID. Great for team-shared model preferences per repo.

**Custom traits:** add `custom_traits` to your catalog for domain-specific routing:

```yaml
custom_traits:
  - name: security_audit
    description: does this task involve security review, vulnerability scanning, or threat modeling?
  - name: data_science
    description: does this task involve data analysis, ML pipelines, or statistical modeling?

models:
  - id: anthropic/claude-sonnet-4-6
    provider: anthropic
    scores:
      long_context: 9
      deep_reasoning: 9
      tool_use_accuracy: 9
      speed_priority: 5
      frontend_taste: 7
      cost_efficiency: 4
      security_audit: 9
      data_science: 6
```

The classifier dynamically includes custom traits in its prompt. Model scores for custom traits are weighted alongside the six base traits.

Verify model IDs against OpenCode's actual list:

```bash
opencode models openai
opencode models google
opencode models openrouter
opencode models huggingface
opencode models anthropic
```

If a model in your catalog isn't in OpenCode's list, dispatch will fail with `ProviderModelNotFoundError`. BramhaShiv exposes a pure `validateCatalogModelIds()` helper for tooling that wants to compare a catalog against provider model lists before runtime.

### Route debugging

Every route decision is persisted to `last_route_debug` in `~/.config/bramhashiv/state.json`. It includes the chosen model, ranked candidates, classifier weights, fallback state, and unavailable models. The `handleRouteCommand()` formatter can render this snapshot for a TUI `/route` command or any future wrapper that can read BramhaShiv state.

**Live explanation mode:** set `BRAMHASHIV_EXPLAIN=1` to see a full scoring breakdown appended to every response — why each model was scored, what penalties applied, and which traits dominated the decision.

**Dry-run mode:** set `BRAMHASHIV_DRY_RUN=1` to preview the chosen model without actually dispatching. Useful for tuning catalog scores or testing routing logic.

---

## 🧠 How routing works

BramhaShiv operates in 5 layers, each improving routing accuracy:

1. **Workspace analysis** — On activation, scans your project (up to 500 files) to detect languages, frontend/backend presence, tests, and git repo. Injected into all classification prompts for project-aware routing.
2. **Classify** — Gemini Flash reads your task + workspace summary + last 5 conversation turns and outputs six trait weights in `0..1`.
3. **Score** — Each catalog model is dot-product scored against the trait weights, then adjusted by six real-time signals:
   - **Provider health:** models with high error rates or slow latency get score penalties (up to 25%).
   - **Regeneration intelligence:** if you've regenerated this same task before, the previous model's score is penalized (escalating 5%→30%). Uses semantic similarity (code-aware token matching + n-grams) instead of naive Jaccard.
   - **Learned adjustments:** accumulated deltas from past task outcomes auto-tune the catalog base scores over time.
   - **Budget guardrails:** when daily/monthly spend approaches limits, expensive models are penalized. Tracks estimated cost per task from catalog `cost_per_1k_input/output` fields.
   - **Latency SLO:** models with EMA latency exceeding your target (`BRAMHASHIV_LATENCY_SLO_MS`) are progressively penalized.
   - **Time-based routing:** during night hours (configurable), cost-efficiency and speed are boosted to prefer cheaper, faster models.
4. **Dispatch** — Top-ranked model runs the task. If rate-limited or unavailable, falls back through the ranking. A/B testing mode can route a percentage of traffic to the #2 model for validation.
5. **Learn** — On task completion, the outcome (success, latency, regenerations) feeds back into the learning system, health monitor, and budget tracker for future routing decisions.

### 🛡️ Availability filtering

Three layers keep the router from picking models you can't reach:

- 🔐 **At activation** — providers missing from `~/.local/share/opencode/auth.json` are dropped. No more `ProviderModelNotFoundError` or auth-not-configured failures.
- 🚧 **During the session** — when a dispatch fails with `ProviderAuthError` or an `APIError` with status `402` / `429` / `503` / `529`, the offending model is added to the session's unavailable set. Next turns route around it.
- 📊 **Proactive quota management** — monitors `x-ratelimit-remaining` headers. When a model has ≤3 requests remaining, it enters a 5-minute cooldown before hitting the actual 429.

Unavailable state is **per OpenCode process** — it resets when you restart. If you need it persistent, edit your catalog or use `BRAMHASHIV_PIN`.

### 🤝 Team-synced learning

Set `BRAMHASHIV_TEAM_STATE_PATH=/shared/drive/bramhashiv-state.json` to share learned adjustments across your team. Local learning still dominates (team deltas are dampened 50%), but new team members benefit from collective model performance history.

### 📤 Import / export state

Backup or migrate your routing state across machines:

```typescript
import { exportState, importState } from "bramhashiv/state-io";

exportState("~/backups/bramhashiv-2026-05.json");
importState("~/backups/bramhashiv-2026-05.json", /* merge */ true);
```

---

## 🔧 Configuration

All tunable hyperparameters have sensible defaults and can be overridden via environment variables:

```bash
# Learning system
BRAMHASHIV_LEARNING_RATE=0.05       # how fast scores adjust per outcome (0-1)
BRAMHASHIV_LEARNING_DECAY=0.99      # decay factor for past adjustments
BRAMHASHIV_LEARNING_CAP=2.0         # max absolute adjustment per model+trait

# Health monitoring
BRAMHASHIV_HEALTH_DECAY=0.7         # EMA alpha for latency averaging
BRAMHASHIV_HEALTH_LATENCY_BASELINE=30000  # ms considered "slow"
BRAMHASHIV_ALERT_HEALTH_THRESHOLD=0.5  # console warning when model health drops below this

# Regeneration tracking
BRAMHASHIV_SIMILARITY_THRESHOLD=0.7 # semantic similarity threshold for task matching
BRAMHASHIV_REGENERATION_TTL_MS=3600000  # how long to remember regenerations

# Planner
BRAMHASHIV_PLANNER_TIMEOUT_MS=10000 # max time for task decomposition
BRAMHASHIV_COMPLEXITY_THRESHOLD=3   # heuristic score to trigger planning

# Classifier
BRAMHASHIV_CLASSIFIER_TIMEOUT_MS=8000  # Gemini Flash max wait

# Error tracking
BRAMHASHIV_ERROR_TTL_MODEL_MS=3600000   # per-model rate-limit TTL
BRAMHASHIV_ERROR_TTL_ACCOUNT_MS=43200000 # account-level quota TTL

# Workspace scanner
BRAMHASHIV_MAX_FILES_SCAN=500      # max files to scan for workspace analysis
BRAMHASHIV_MAX_DEPTH_SCAN=4        # max directory depth

# Budget guardrails
BRAMHASHIV_BUDGET_DAILY_USD=50      # daily spend cap
BRAMHASHIV_BUDGET_MONTHLY_USD=500   # monthly spend cap
BRAMHASHIV_BUDGET_NEAR_THRESHOLD=0.8  # penalty kicks in at 80% of limit

# Latency SLO
BRAMHASHIV_LATENCY_SLO_MS=0         # target response time (0 = disabled)
BRAMHASHIV_LATENCY_SLO_PENALTY=0.001 # penalty per ms over target

# Time-based routing
BRAMHASHIV_NIGHT_MODE_START=22      # hour to start night mode
BRAMHASHIV_NIGHT_MODE_END=7         # hour to end night mode
BRAMHASHIV_NIGHT_COST_BOOST=0.3     # boost cost_efficiency at night
BRAMHASHIV_NIGHT_SPEED_BOOST=0.2    # boost speed_priority at night

# A/B testing
BRAMHASHIV_AB_TEST_PCT=0            # % of traffic to route to #2 model

# Team sync
BRAMHASHIV_TEAM_STATE_PATH=         # path to shared state file

# Dashboard
BRAMHASHIV_DASHBOARD_ENABLED=0      # enable live metrics web UI
BRAMHASHIV_DASHBOARD_PORT=9876      # dashboard server port
BRAMHASHIV_DASHBOARD_MAX_HISTORY=100 # routing events to keep in memory

# Routing Rules DSL
BRAMHASHIV_RULES_ENABLED=1          # enable YAML routing rules
BRAMHASHIV_RULES_PATH=              # path to .bramhashiv/rules.yaml

# Conflict Detection
BRAMHASHIV_CONFLICT_ENABLED=1       # detect contradictory trait weights
BRAMHASHIV_CONFLICT_THRESHOLD=0.7   # both traits above this = conflict
BRAMHASHIV_CONFLICT_RESOLUTION=auto # auto | balance | log_only

# Multi-Turn Optimization
BRAMHASHIV_MULTITURN_ENABLED=1      # prefer same model across turns
BRAMHASHIV_MULTITURN_BASE_BONUS=0.1 # affinity bonus for current model
BRAMHASHIV_MULTITURN_DRIFT_THRESHOLD=0.4 # max trait drift before switching
BRAMHASHIV_MULTITURN_MAX_TURNS=10   # reset affinity after this many turns

# Model Warmup
BRAMHASHIV_WARMUP_ENABLED=1         # predict next model from conversation
BRAMHASHIV_WARMUP_REUSE_THRESHOLD=0.6 # semantic similarity for reuse

# Model Deprecation
BRAMHASHIV_AUTO_MIGRATE=1           # auto-migrate scores to successor
BRAMHASHIV_DEPRECATION_WARN_DAYS=30 # warn before EOL

# Automated Benchmarking
BRAMHASHIV_BENCHMARK_ENABLED=0      # run periodic synthetic benchmarks
BRAMHASHIV_BENCHMARK_INTERVAL_HOURS=24 # hours between benchmarks
BRAMHASHIV_BENCHMARK_AUTO_ADJUST=0  # auto-adjust catalog from benchmarks

# Streaming Cost
BRAMHASHIV_STREAMING_COST_ENABLED=1 # track real-time cost during responses
BRAMHASHIV_STREAMING_COST_LABEL=1   # show cost in routing label

# Context Window Pressure
BRAMHASHIV_CONTEXT_PRESSURE_ENABLED=1 # penalize models near context limit
BRAMHASHIV_CONTEXT_WARN=0.6         # 60% utilization = warning penalty
BRAMHASHIV_CONTEXT_HIGH=0.8         # 80% utilization = high penalty
BRAMHASHIV_CONTEXT_CRITICAL=0.95    # 95% utilization = critical penalty

# Generic Webhooks
BRAMHASHIV_WEBHOOKS_ENABLED=0       # enable Slack/Discord/PagerDuty alerts
BRAMHASHIV_WEBHOOKS_PATH=           # path to .bramhashiv/webhooks.yaml

# Debug / preview
BRAMHASHIV_EXPLAIN=0                # append scoring breakdown to responses
BRAMHASHIV_DRY_RUN=0                # preview chosen model without dispatching
BRAMHASHIV_DEBUG=0                  # verbose stderr debug output
```

---

## 🔧 Development

```bash
bun install
bun test            # 216 unit + harness + golden-set tests
bun run typecheck
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts   # real Gemini call
```

---

## 🛣️ v2 Roadmap

- 🤖 **Multi-turn orchestration** — executing planner sub-tasks sequentially with different models.
- ❓ **Confidence prompts** — confirm with user when classifier is uncertain.
- 🌐 **Shared catalog registry** — community-tuned configs for different tech stacks.
- 📊 **Learning dashboard** — `/stats` command showing model performance over time.

---

## 👤 Author

Made by **Abhirup Guha**.

<p align="center">
  <strong>🪔 Proudly created in 🇮🇳, by an Indian — open-sourced for the betterment of the AI future.</strong>
</p>

---

## 🔒 Security

**Your credentials never touch this repo.** All API keys, OAuth tokens, and session data live in your home directory — `~/.local/share/opencode/auth.json` and `~/.config/bramhashiv/`. Cloning this repo gives you zero credentials; you must auth your own providers via `opencode providers login`. See [`SECURITY.md`](./SECURITY.md) for the full threat model and a credential scan you can run against any clone.

## 📜 License

Licensed under the [**Apache License 2.0**](./LICENSE). Copyright © 2026 Abhirup Guha.

<div align="center">
  <sub>If this saved you time, ⭐ star it on <a href="https://github.com/fir3storm/bramhashiv-ai">GitHub</a>.</sub>
</div>
model without dispatching
BRAMHASHIV_DEBUG=0                  # verbose stderr debug output
```

---

## 🔧 Development

```bash
bun install
bun test            # 216 unit + harness + golden-set tests
bun run typecheck
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts   # real Gemini call
```

---

## 🛣️ v2 Roadmap

- 🤖 **Multi-turn orchestration** — executing planner sub-tasks sequentially with different models.
- ❓ **Confidence prompts** — confirm with user when classifier is uncertain.
- 🌐 **Shared catalog registry** — community-tuned configs for different tech stacks.
- 📊 **Learning dashboard** — `/stats` command showing model performance over time.

---

## 👤 Author

Made by **Abhirup Guha**.

<p align="center">
  <strong>🪔 Proudly created in 🇮🇳, by an Indian — open-sourced for the betterment of the AI future.</strong>
</p>

---

## 🔒 Security

**Your credentials never touch this repo.** All API keys, OAuth tokens, and session data live in your home directory — `~/.local/share/opencode/auth.json` and `~/.config/bramhashiv/`. Cloning this repo gives you zero credentials; you must auth your own providers via `opencode providers login`. See [`SECURITY.md`](./SECURITY.md) for the full threat model and a credential scan you can run against any clone.

## 📜 License

Licensed under the [**Apache License 2.0**](./LICENSE). Copyright © 2026 Abhirup Guha.

<div align="center">
  <sub>If this saved you time, ⭐ star it on <a href="https://github.com/fir3storm/bramhashiv-ai">GitHub</a>.</sub>
</div>
