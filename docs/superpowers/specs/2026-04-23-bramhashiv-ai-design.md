# BramhaShiv AI — Design Spec

**Status:** Approved 2026-04-23. Ready for implementation planning.
**Base:** OpenCode (sst/opencode). Plugin-first; hard fork as fallback.
**Scope:** v1 — smart task router on top of OpenCode. v2+ adds subagents, OpenAI/GPT-5 support, telemetry-driven tuning.

Name origin: **Brahma** (Hindu god of creation) + **Shiva** (architect / formation) — the AI that creates and shapes code using the right tool for each job.

---

## 1. Product

BramhaShiv AI is a multi-provider coding assistant that automatically picks the best AI model for each task. It stands on OpenCode's existing CLI, tool loop, sandbox, and multi-provider auth, and adds a **smart router** that classifies each task and dispatches to the best-fit backend model.

### Goals
- User types a coding task; system picks optimal model; task runs.
- Use only the user's existing subscriptions (Claude Max, Google Pro, HuggingFace API). Zero new spend.
- Router decision is transparent: user always sees *which model* and *why*.
- User can override with a single command.
- Ship v1 in weeks, not months.

### Non-goals (v1)
- Subagent orchestration / nested routing.
- GPT-5 / ChatGPT Pro integration.
- Auto-learning from override telemetry.
- Custom TUI — reuse OpenCode's.

---

## 2. Architecture

Build as a plugin on OpenCode. Fall back to a hard fork **only** if the plugin API can't hook provider selection (first planning task: audit that API).

```
user prompt
    │
    ▼
[Classifier: Gemini Flash]
    │ outputs JSON trait weights:
    │ { long_context, deep_reasoning, tool_use_accuracy,
    │   speed_priority, frontend_taste, cost_efficiency } each 0..1
    ▼
[Scorer: weighted dot product vs catalog]
    │ applies hard filters first, then ranks remaining models
    ▼
[Router]
    │ picks top-ranked available model (skips rate-limited)
    │ emits TUI line: "▸ using <model> — top traits: <t1>, <t2>"
    ▼
[OpenCode tool loop] runs task with chosen provider
    │
    ▼
[Override hook]  /model <name>  — force model for rest of session
                 /model auto    — resume routing
                 /route         — dump last classifier output
```

---

## 3. Components

### 3.1 Classifier
- **Model:** Gemini Flash via Google Pro OAuth (OpenCode built-in).
- **Input:** user task + current conversation state.
- **Output:** JSON object with six trait weights, each `0.0–1.0`.
- **Fallback:** if classifier times out (>2s) or returns malformed JSON, route to Claude Sonnet 4.6 as safe default and show user a one-line notice.
- **Cost:** near-zero per call; fits inside Google Pro free quota.

### 3.2 Model Catalog
- **Format:** YAML at `~/.config/bramhashiv/catalog.yaml`. User-editable.
- **Schema per entry:**
  ```yaml
  - id: anthropic/claude-opus-4-7
    provider: anthropic
    scores:
      long_context: 10
      deep_reasoning: 10
      tool_use_accuracy: 9
      speed_priority: 4
      frontend_taste: 8
      cost_efficiency: 3
    hard_filters:
      min_context: 200000   # optional
  ```
- **Hot reload:** watch file, reload on change. No restart.

### 3.3 Scorer
- **Algorithm:** `score(model) = Σ_trait classifier_weight[trait] × model.scores[trait]`.
- **Hard filters:** applied *before* scoring. E.g. if `classifier.long_context > 0.7`, drop any model whose `hard_filters.min_context < 200k`.
- **Tie-breaker:** prefer higher `cost_efficiency`.

### 3.4 Router
- Orchestrates classifier → scorer → OpenCode's provider switch.
- Tracks session-level override state.
- On rate-limit from top pick: try next-ranked model, log the swap, show user why.

### 3.5 Override UX
- Before each task run: single-line TUI indicator — `▸ claude-opus-4-7 (long-context · deep-reasoning)`.
- `/model <name>` — pin model for rest of session.
- `/model auto` — resume routing.
- `/route` — dump most recent classifier output for debugging.

---

## 4. Auth

All free to the user. All handled by OpenCode natively.

| Provider | Auth method | Models used |
|---|---|---|
| Anthropic (Claude Max) | OAuth | Opus 4.7, Sonnet 4.6, Haiku 4.5 |
| Google (Pro) | OAuth | Gemini 3 Pro, Gemini Flash |
| HuggingFace | API key | Kimi K2, Qwen Coder, DeepSeek |

OpenAI / GPT-5 deferred to v2 (no clean non-API-key path from ChatGPT Pro today).

---

## 5. Seed Catalog (v1)

Scores on 0–10 scale. User-editable after install.

| Model ID | long-ctx | deep-reason | tool-use | speed | frontend | cost-eff |
|---|---|---|---|---|---|---|
| `anthropic/claude-opus-4-7` | 10 | 10 | 9 | 4 | 8 | 3 |
| `anthropic/claude-sonnet-4-6` | 9 | 8 | 9 | 7 | 8 | 6 |
| `anthropic/claude-haiku-4-5` | 7 | 6 | 8 | 10 | 6 | 9 |
| `google/gemini-3-pro` | 10 | 9 | 7 | 6 | 7 | 7 |
| `google/gemini-flash` | 8 | 6 | 6 | 10 | 6 | 10 |
| `huggingface/moonshotai/Kimi-K2-Instruct` | 10 | 9 | 9 | 5 | 7 | 10 |
| `huggingface/Qwen/Qwen2.5-Coder-32B-Instruct` | 6 | 6 | 6 | 5 | 5 | 10 |
| `huggingface/deepseek-ai/DeepSeek-V3` | 7 | 7 | 6 | 4 | 5 | 10 |

Exact HF model IDs lockable in YAML; above is the v1 starter set.

---

## 6. Error Handling

| Condition | Behavior |
|---|---|
| Classifier timeout (>2s) | Fall back to Claude Sonnet 4.6. Notify user. |
| Classifier returns malformed JSON | Same fallback. |
| Top-ranked model rate-limited | Try next-ranked. Log swap, show user one-line reason. |
| No model passes hard filters | Fall back to Sonnet 4.6. |
| Provider auth expired | Prompt user to re-login via OpenCode's existing flow. |

---

## 7. Testing

- **Golden set:** ~30 hand-labeled tasks with expected top-3 models ("refactor big file" → Opus/Sonnet/Kimi, "quick one-liner" → Haiku/Flash, "design landing page" → Opus/Sonnet, etc.). Router must return one of top-3.
- **Provider smoke tests:** in CI, hit each real provider (Claude, Gemini, HF) with a trivial prompt.
- **Override telemetry:** local-only JSONL at `~/.config/bramhashiv/overrides.log`. User inspects to retune their catalog. No upload.

---

## 8. v2+ Roadmap (not in scope)

- Subagent system — extend OpenCode's agent primitive with nested routing (each subagent independently goes through the router).
- GPT-5 support via Codex CLI subprocess.
- Confidence-based confirm: if classifier confidence is low, ask user before running.
- Auto-learn catalog weights from override logs.
- Shared/community catalog registry.

---

## 9. Open Questions

- **Plugin vs fork:** depends on whether OpenCode's plugin API exposes hooks for provider selection. **First planning task** must audit this.
- **Exact HF model IDs:** lock during implementation after confirming HF inference availability for each.
- **Classifier prompt design:** needs iteration with the golden set to minimize misclassification.
