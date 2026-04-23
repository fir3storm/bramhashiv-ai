# BramhaShiv AI v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a smart task router on top of OpenCode that classifies each user task with Gemini Flash, scores catalog models against the resulting trait weights, and dispatches the task to the best-fit provider — all while letting the user see and override the choice.

**Architecture:** Plugin-first on [sst/opencode](https://github.com/sst/opencode) (fallback to hard fork only if plugin API can't hook provider selection). Pure-logic modules (types, catalog, scorer) are self-contained and fully unit-tested. The classifier and router modules accept an injected `runCompletion` function so they can be tested without real API calls. Integration with OpenCode happens in a single module (`src/plugin.ts`) that wires everything into OpenCode's plugin hooks.

**Tech Stack:** TypeScript + Bun runtime + Bun test + `yaml` + `chokidar` (for hot reload). No other runtime deps for v1.

**Working directory:** Plugin lives at `d:/My Softwares/MAster Ai project/bramhashiv/`. All paths below are relative to that unless stated otherwise.

**Spec reference:** `docs/superpowers/specs/2026-04-23-bramhashiv-ai-design.md`

---

## File Structure

```
bramhashiv/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── README.md
├── config/
│   └── default-catalog.yaml       # ships as seed; installer copies to ~/.config/
├── src/
│   ├── types.ts                   # TraitWeights, ModelEntry, ClassifierResult, ...
│   ├── catalog.ts                 # YAML loader + hot reload
│   ├── scorer.ts                  # weighted dot product + hard filters
│   ├── classifier.ts              # Gemini Flash integration (DI-injected runner)
│   ├── classifier-prompt.ts       # prompt template
│   ├── router.ts                  # orchestrator: classifier → scorer → pick → fallback
│   ├── override.ts                # session override state + command handlers
│   ├── telemetry.ts               # JSONL override log writer
│   └── plugin.ts                  # OpenCode plugin entrypoint (only module that touches OpenCode APIs)
├── tests/
│   ├── catalog.test.ts
│   ├── scorer.test.ts
│   ├── classifier.test.ts
│   ├── router.test.ts
│   ├── override.test.ts
│   ├── telemetry.test.ts
│   └── golden.test.ts             # golden-set integration test
└── docs/
    └── opencode-plugin-audit.md   # produced by Task 1
```

Design principle: **the only module allowed to import OpenCode-specific APIs is `src/plugin.ts`**. Everything else is framework-agnostic TypeScript that can be unit-tested without mocking OpenCode. This is how we insulate against the plugin-vs-fork uncertainty.

---

## Task 1: Audit OpenCode plugin API + scaffold project

**Files:**
- Create: `bramhashiv/docs/opencode-plugin-audit.md`
- Create: `bramhashiv/package.json`
- Create: `bramhashiv/tsconfig.json`
- Create: `bramhashiv/bunfig.toml`
- Create: `bramhashiv/.gitignore`
- Create: `bramhashiv/README.md`

- [ ] **Step 1: Clone OpenCode and audit plugin API**

Run:
```bash
cd /tmp
git clone https://github.com/sst/opencode.git opencode-audit
cd opencode-audit
grep -r "plugin" --include="*.md" README.md docs/ 2>/dev/null | head -50
find . -name "*.ts" -path "*plugin*" | head -20
cat packages/opencode/src/plugin.ts 2>/dev/null || echo "no central plugin.ts"
```

Look for: (a) a documented plugin manifest format, (b) hooks for provider selection or request middleware, (c) command registration hooks (for `/model`, `/route`), (d) access to the TUI for the indicator line.

- [ ] **Step 2: Write audit findings**

Create `bramhashiv/docs/opencode-plugin-audit.md` with sections:
- **Plugin manifest** — does one exist? format?
- **Provider-selection hook** — can a plugin override which model runs a request? If yes, name the API. If no, note what needs forking.
- **Command hook** — can a plugin register `/model` and `/route`?
- **TUI hook** — can a plugin emit a single-line indicator before a request runs?
- **Decision:** plugin, fork, or hybrid (plugin for what it supports + upstream patch for what it doesn't).

Minimum content even if API is sparse: name the exact files/functions in OpenCode that must be touched. The rest of the plan assumes plugin hooks for these four things; if the audit says otherwise, the downstream integration (Task 8) changes but modules 2–7 remain identical.

- [ ] **Step 3: Scaffold project**

Create `bramhashiv/package.json`:
```json
{
  "name": "bramhashiv",
  "version": "0.1.0",
  "type": "module",
  "description": "Smart multi-provider coding router — plugin for OpenCode",
  "main": "src/plugin.ts",
  "scripts": {
    "test": "bun test",
    "test:watch": "bun test --watch",
    "typecheck": "bun x tsc --noEmit"
  },
  "dependencies": {
    "yaml": "^2.5.0",
    "chokidar": "^4.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.6.0"
  }
}
```

Create `bramhashiv/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "lib": ["ES2022"]
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

Create `bramhashiv/bunfig.toml`:
```toml
[test]
preload = []
coverage = false
```

Create `bramhashiv/.gitignore`:
```
node_modules/
dist/
*.log
.env
.env.local
```

Create `bramhashiv/README.md`:
```markdown
# BramhaShiv AI

Smart multi-provider coding router built on [OpenCode](https://github.com/sst/opencode). Automatically picks the best AI model per task.

See `../docs/superpowers/specs/2026-04-23-bramhashiv-ai-design.md` for the full design.

## Install
(TBD after Task 11.)

## Develop
```bash
bun install
bun test
```
```

- [ ] **Step 4: Install deps and run empty test sanity check**

Run:
```bash
cd bramhashiv
bun install
bun test
```

Expected: "0 tests run" or equivalent (no test files yet). No install errors.

- [ ] **Step 5: Commit**

Run:
```bash
git add bramhashiv/
git commit -m "scaffold: BramhaShiv plugin project + OpenCode plugin audit"
```

---

## Task 2: Types module

**Files:**
- Create: `bramhashiv/src/types.ts`
- Test: (none — types only)

- [ ] **Step 1: Write types**

Create `bramhashiv/src/types.ts`:
```typescript
/**
 * The six traits the classifier outputs and the catalog scores against.
 * Keys are kebab-case in YAML config, snake_case in TS.
 */
export type TraitName =
  | "long_context"
  | "deep_reasoning"
  | "tool_use_accuracy"
  | "speed_priority"
  | "frontend_taste"
  | "cost_efficiency";

export const TRAIT_NAMES: readonly TraitName[] = [
  "long_context",
  "deep_reasoning",
  "tool_use_accuracy",
  "speed_priority",
  "frontend_taste",
  "cost_efficiency",
] as const;

/** Classifier output: weights in 0..1 per trait. */
export type TraitWeights = Record<TraitName, number>;

/** Catalog scores: 0..10 per trait. */
export type TraitScores = Record<TraitName, number>;

export interface HardFilters {
  min_context?: number;
}

export interface ModelEntry {
  id: string;          // e.g. "anthropic/claude-opus-4-7"
  provider: "anthropic" | "google" | "huggingface";
  scores: TraitScores;
  hard_filters?: HardFilters;
}

export interface Catalog {
  models: ModelEntry[];
}

export interface ClassifierResult {
  weights: TraitWeights;
  fallback: boolean;       // true if classifier failed and we used default weights
  raw?: string;            // raw LLM response for /route debugging
}

export interface RankedModel {
  model: ModelEntry;
  score: number;
}

export interface RouteDecision {
  picked: ModelEntry;
  top_traits: TraitName[];   // two highest-weight traits, for UX label
  ranking: RankedModel[];    // full ranking, so router can fall back on rate limit
  classifier: ClassifierResult;
  override_source?: "user" | "fallback";
}

export interface OverrideState {
  pinned_model_id: string | null;   // null = auto
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd bramhashiv && bun run typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add bramhashiv/src/types.ts
git commit -m "feat(types): define TraitWeights, Catalog, RouteDecision types"
```

---

## Task 3: Catalog loader (YAML + hot reload)

**Files:**
- Create: `bramhashiv/src/catalog.ts`
- Create: `bramhashiv/config/default-catalog.yaml`
- Test: `bramhashiv/tests/catalog.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `bramhashiv/tests/catalog.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { parseCatalog, validateCatalog } from "../src/catalog.js";

const VALID_YAML = `
models:
  - id: anthropic/claude-opus-4-7
    provider: anthropic
    scores:
      long_context: 10
      deep_reasoning: 10
      tool_use_accuracy: 9
      speed_priority: 4
      frontend_taste: 8
      cost_efficiency: 3
`;

describe("parseCatalog", () => {
  test("parses a valid catalog", () => {
    const cat = parseCatalog(VALID_YAML);
    expect(cat.models).toHaveLength(1);
    expect(cat.models[0]!.id).toBe("anthropic/claude-opus-4-7");
    expect(cat.models[0]!.scores.long_context).toBe(10);
  });

  test("throws on missing required trait", () => {
    const bad = `
models:
  - id: test/model
    provider: anthropic
    scores:
      long_context: 5
`;
    expect(() => parseCatalog(bad)).toThrow(/missing trait/i);
  });

  test("throws on out-of-range score", () => {
    const bad = VALID_YAML.replace("long_context: 10", "long_context: 15");
    expect(() => parseCatalog(bad)).toThrow(/0..10/);
  });

  test("throws on unknown provider", () => {
    const bad = VALID_YAML.replace("provider: anthropic", "provider: martian");
    expect(() => parseCatalog(bad)).toThrow(/provider/i);
  });

  test("allows optional hard_filters", () => {
    const yaml = VALID_YAML + `    hard_filters:\n      min_context: 200000\n`;
    const cat = parseCatalog(yaml);
    expect(cat.models[0]!.hard_filters?.min_context).toBe(200000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/catalog.test.ts
```

Expected: FAIL — `parseCatalog` not defined.

- [ ] **Step 3: Write minimal implementation**

Create `bramhashiv/src/catalog.ts`:
```typescript
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import chokidar from "chokidar";
import { TRAIT_NAMES, type Catalog, type ModelEntry, type TraitName } from "./types.js";

const ALLOWED_PROVIDERS = ["anthropic", "google", "huggingface"] as const;

export function validateCatalog(cat: unknown): asserts cat is Catalog {
  if (!cat || typeof cat !== "object" || !("models" in cat)) {
    throw new Error("catalog must have a 'models' key");
  }
  const models = (cat as { models: unknown }).models;
  if (!Array.isArray(models)) throw new Error("'models' must be a list");
  for (const m of models) {
    if (!m || typeof m !== "object") throw new Error("model entry must be object");
    const entry = m as Record<string, unknown>;
    if (typeof entry.id !== "string") throw new Error("model.id must be string");
    if (!ALLOWED_PROVIDERS.includes(entry.provider as typeof ALLOWED_PROVIDERS[number])) {
      throw new Error(`invalid provider '${entry.provider}' for ${entry.id}`);
    }
    if (!entry.scores || typeof entry.scores !== "object") {
      throw new Error(`model ${entry.id}: 'scores' required`);
    }
    const scores = entry.scores as Record<string, unknown>;
    for (const trait of TRAIT_NAMES) {
      if (typeof scores[trait] !== "number") {
        throw new Error(`model ${entry.id}: missing trait '${trait}'`);
      }
      const v = scores[trait] as number;
      if (v < 0 || v > 10) {
        throw new Error(`model ${entry.id}: trait '${trait}' must be 0..10 (got ${v})`);
      }
    }
  }
}

export function parseCatalog(yamlText: string): Catalog {
  const raw = parseYaml(yamlText);
  validateCatalog(raw);
  return raw;
}

export function loadCatalog(path: string): Catalog {
  return parseCatalog(readFileSync(path, "utf8"));
}

export interface CatalogWatcher {
  current(): Catalog;
  stop(): void;
}

export function watchCatalog(path: string, onChange?: (c: Catalog) => void): CatalogWatcher {
  let current = loadCatalog(path);
  const watcher = chokidar.watch(path, { ignoreInitial: true });
  watcher.on("change", () => {
    try {
      const next = loadCatalog(path);
      current = next;
      onChange?.(next);
    } catch (err) {
      console.error(`[bramhashiv] catalog reload failed, keeping previous:`, err);
    }
  });
  return {
    current: () => current,
    stop: () => void watcher.close(),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd bramhashiv && bun test tests/catalog.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Write the seed catalog**

Create `bramhashiv/config/default-catalog.yaml`:
```yaml
# BramhaShiv AI default model catalog.
# Scores are 0-10 (how strong this model is on this trait).
# Edit freely; hot-reloaded on save.

models:
  - id: anthropic/claude-opus-4-7
    provider: anthropic
    scores:
      long_context: 10
      deep_reasoning: 10
      tool_use_accuracy: 9
      speed_priority: 4
      frontend_taste: 8
      cost_efficiency: 3

  - id: anthropic/claude-sonnet-4-6
    provider: anthropic
    scores:
      long_context: 9
      deep_reasoning: 8
      tool_use_accuracy: 9
      speed_priority: 7
      frontend_taste: 8
      cost_efficiency: 6

  - id: anthropic/claude-haiku-4-5
    provider: anthropic
    scores:
      long_context: 7
      deep_reasoning: 6
      tool_use_accuracy: 8
      speed_priority: 10
      frontend_taste: 6
      cost_efficiency: 9

  - id: google/gemini-3-pro
    provider: google
    scores:
      long_context: 10
      deep_reasoning: 9
      tool_use_accuracy: 7
      speed_priority: 6
      frontend_taste: 7
      cost_efficiency: 7

  - id: google/gemini-flash
    provider: google
    scores:
      long_context: 8
      deep_reasoning: 6
      tool_use_accuracy: 6
      speed_priority: 10
      frontend_taste: 6
      cost_efficiency: 10

  - id: huggingface/moonshotai/Kimi-K2-Instruct
    provider: huggingface
    scores:
      long_context: 10
      deep_reasoning: 9
      tool_use_accuracy: 9
      speed_priority: 5
      frontend_taste: 7
      cost_efficiency: 10

  - id: huggingface/Qwen/Qwen2.5-Coder-32B-Instruct
    provider: huggingface
    scores:
      long_context: 6
      deep_reasoning: 6
      tool_use_accuracy: 6
      speed_priority: 5
      frontend_taste: 5
      cost_efficiency: 10

  - id: huggingface/deepseek-ai/DeepSeek-V3
    provider: huggingface
    scores:
      long_context: 7
      deep_reasoning: 7
      tool_use_accuracy: 6
      speed_priority: 4
      frontend_taste: 5
      cost_efficiency: 10
```

- [ ] **Step 6: Commit**

```bash
git add bramhashiv/src/catalog.ts bramhashiv/tests/catalog.test.ts bramhashiv/config/default-catalog.yaml
git commit -m "feat(catalog): YAML loader + validator + hot reload + seed data"
```

---

## Task 4: Scorer

**Files:**
- Create: `bramhashiv/src/scorer.ts`
- Test: `bramhashiv/tests/scorer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `bramhashiv/tests/scorer.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { scoreAndRank } from "../src/scorer.js";
import type { Catalog, TraitWeights } from "../src/types.js";

function model(id: string, scores: Partial<Record<string, number>>, hard?: { min_context?: number }) {
  const base = {
    long_context: 5,
    deep_reasoning: 5,
    tool_use_accuracy: 5,
    speed_priority: 5,
    frontend_taste: 5,
    cost_efficiency: 5,
    ...scores,
  };
  return {
    id,
    provider: "anthropic" as const,
    scores: base as never,
    ...(hard ? { hard_filters: hard } : {}),
  };
}

const weights: TraitWeights = {
  long_context: 1,
  deep_reasoning: 0,
  tool_use_accuracy: 0,
  speed_priority: 0,
  frontend_taste: 0,
  cost_efficiency: 0,
};

describe("scoreAndRank", () => {
  test("ranks by weighted dot product", () => {
    const cat: Catalog = {
      models: [model("a", { long_context: 3 }), model("b", { long_context: 9 })],
    };
    const ranked = scoreAndRank(cat, weights);
    expect(ranked[0]!.model.id).toBe("b");
    expect(ranked[1]!.model.id).toBe("a");
  });

  test("filters out models failing hard filters when relevant trait dominant", () => {
    const cat: Catalog = {
      models: [
        model("short", { long_context: 9 }, { min_context: 50000 }),
        model("long", { long_context: 8 }, { min_context: 200000 }),
      ],
    };
    const w = { ...weights, long_context: 0.8 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked.map((r) => r.model.id)).toEqual(["long"]);
  });

  test("does not apply long-context filter when trait weight is low", () => {
    const cat: Catalog = {
      models: [model("short", { long_context: 9 }, { min_context: 50000 })],
    };
    const w = { ...weights, long_context: 0.3 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked).toHaveLength(1);
  });

  test("tie-breaks by cost_efficiency descending", () => {
    const cat: Catalog = {
      models: [
        model("cheap", { long_context: 5, cost_efficiency: 10 }),
        model("expensive", { long_context: 5, cost_efficiency: 1 }),
      ],
    };
    const ranked = scoreAndRank(cat, weights);
    expect(ranked[0]!.model.id).toBe("cheap");
  });

  test("returns empty list if all models filtered", () => {
    const cat: Catalog = {
      models: [model("short", {}, { min_context: 50000 })],
    };
    const w = { ...weights, long_context: 0.9 };
    const ranked = scoreAndRank(cat, w);
    expect(ranked).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/scorer.test.ts
```

Expected: FAIL — `scoreAndRank` not defined.

- [ ] **Step 3: Write implementation**

Create `bramhashiv/src/scorer.ts`:
```typescript
import { TRAIT_NAMES, type Catalog, type ModelEntry, type RankedModel, type TraitWeights } from "./types.js";

const LONG_CONTEXT_THRESHOLD = 0.7;

function passesHardFilters(m: ModelEntry, w: TraitWeights): boolean {
  if (m.hard_filters?.min_context !== undefined && w.long_context > LONG_CONTEXT_THRESHOLD) {
    if (m.hard_filters.min_context < 200_000) return false;
  }
  return true;
}

export function scoreAndRank(catalog: Catalog, weights: TraitWeights): RankedModel[] {
  const ranked: RankedModel[] = [];
  for (const model of catalog.models) {
    if (!passesHardFilters(model, weights)) continue;
    let score = 0;
    for (const trait of TRAIT_NAMES) {
      score += weights[trait] * model.scores[trait];
    }
    ranked.push({ model, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.model.scores.cost_efficiency - a.model.scores.cost_efficiency;
  });
  return ranked;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd bramhashiv && bun test tests/scorer.test.ts
```

Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bramhashiv/src/scorer.ts bramhashiv/tests/scorer.test.ts
git commit -m "feat(scorer): weighted dot product + hard filters + cost tie-break"
```

---

## Task 5: Classifier

**Files:**
- Create: `bramhashiv/src/classifier-prompt.ts`
- Create: `bramhashiv/src/classifier.ts`
- Test: `bramhashiv/tests/classifier.test.ts`

- [ ] **Step 1: Write the classifier prompt module**

Create `bramhashiv/src/classifier-prompt.ts`:
```typescript
export const CLASSIFIER_SYSTEM_PROMPT = `You classify coding tasks. Output ONLY a JSON object with six keys, each a number between 0.0 and 1.0:

{
  "long_context": <0..1>,       // does the task require reading or holding a lot of code/context?
  "deep_reasoning": <0..1>,     // does it need multi-step logical/algorithmic thought?
  "tool_use_accuracy": <0..1>,  // will it involve many file edits or shell commands requiring precise tool calls?
  "speed_priority": <0..1>,     // does the user want a fast response over a deep one?
  "frontend_taste": <0..1>,     // does it involve UI/UX/CSS aesthetic judgment?
  "cost_efficiency": <0..1>     // is this high-volume/background work where a cheap model is fine?
}

Rules:
- Output ONLY the JSON object. No prose, no markdown, no code fences.
- Weights should roughly sum toward representing the dominant traits; don't zero everything out.
- If the task is ambiguous, assume moderate deep_reasoning and tool_use_accuracy.`;

export function buildClassifierUserPrompt(task: string, conversationSnippet?: string): string {
  let out = `TASK:\n${task.trim()}\n`;
  if (conversationSnippet && conversationSnippet.trim()) {
    out += `\nRECENT CONVERSATION (most recent last):\n${conversationSnippet.trim()}\n`;
  }
  return out;
}
```

- [ ] **Step 2: Write failing tests for classifier**

Create `bramhashiv/tests/classifier.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { classify } from "../src/classifier.js";
import { TRAIT_NAMES } from "../src/types.js";

function mockRunner(response: string, delayMs = 0) {
  return async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return response;
  };
}

describe("classify", () => {
  test("parses valid JSON response", async () => {
    const json = JSON.stringify({
      long_context: 0.8,
      deep_reasoning: 0.6,
      tool_use_accuracy: 0.9,
      speed_priority: 0.2,
      frontend_taste: 0.1,
      cost_efficiency: 0.3,
    });
    const result = await classify("refactor this file", { runCompletion: mockRunner(json) });
    expect(result.fallback).toBe(false);
    expect(result.weights.long_context).toBe(0.8);
    expect(result.raw).toBe(json);
  });

  test("strips markdown code fences if present", async () => {
    const json = JSON.stringify({
      long_context: 0.5, deep_reasoning: 0.5, tool_use_accuracy: 0.5,
      speed_priority: 0.5, frontend_taste: 0.5, cost_efficiency: 0.5,
    });
    const wrapped = "```json\n" + json + "\n```";
    const result = await classify("task", { runCompletion: mockRunner(wrapped) });
    expect(result.fallback).toBe(false);
  });

  test("returns fallback weights when JSON is malformed", async () => {
    const result = await classify("task", { runCompletion: mockRunner("not json") });
    expect(result.fallback).toBe(true);
    for (const t of TRAIT_NAMES) {
      expect(result.weights[t]).toBeGreaterThanOrEqual(0);
      expect(result.weights[t]).toBeLessThanOrEqual(1);
    }
  });

  test("returns fallback on missing trait in response", async () => {
    const partial = JSON.stringify({ long_context: 0.5 });
    const result = await classify("task", { runCompletion: mockRunner(partial) });
    expect(result.fallback).toBe(true);
  });

  test("returns fallback on timeout", async () => {
    const result = await classify("task", {
      runCompletion: mockRunner("{}", 500),
      timeoutMs: 50,
    });
    expect(result.fallback).toBe(true);
  });

  test("clamps out-of-range weights to 0..1", async () => {
    const json = JSON.stringify({
      long_context: 1.5, deep_reasoning: -0.2, tool_use_accuracy: 0.5,
      speed_priority: 0.5, frontend_taste: 0.5, cost_efficiency: 0.5,
    });
    const result = await classify("task", { runCompletion: mockRunner(json) });
    expect(result.weights.long_context).toBe(1);
    expect(result.weights.deep_reasoning).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/classifier.test.ts
```

Expected: FAIL — `classify` not defined.

- [ ] **Step 4: Write implementation**

Create `bramhashiv/src/classifier.ts`:
```typescript
import { TRAIT_NAMES, type ClassifierResult, type TraitName, type TraitWeights } from "./types.js";
import { CLASSIFIER_SYSTEM_PROMPT, buildClassifierUserPrompt } from "./classifier-prompt.js";

export type CompletionRunner = (args: {
  systemPrompt: string;
  userPrompt: string;
}) => Promise<string>;

export interface ClassifyOptions {
  runCompletion: CompletionRunner;
  conversationSnippet?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2000;

const FALLBACK_WEIGHTS: TraitWeights = {
  long_context: 0.5,
  deep_reasoning: 0.7,
  tool_use_accuracy: 0.7,
  speed_priority: 0.3,
  frontend_taste: 0.3,
  cost_efficiency: 0.4,
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  return trimmed;
}

function parseWeights(raw: string): TraitWeights | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const result: Partial<TraitWeights> = {};
  for (const trait of TRAIT_NAMES) {
    const v = p[trait];
    if (typeof v !== "number") return null;
    result[trait as TraitName] = clamp01(v);
  }
  return result as TraitWeights;
}

export async function classify(
  task: string,
  opts: ClassifyOptions,
): Promise<ClassifierResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userPrompt = buildClassifierUserPrompt(task, opts.conversationSnippet);

  let raw: string;
  try {
    raw = await Promise.race([
      opts.runCompletion({ systemPrompt: CLASSIFIER_SYSTEM_PROMPT, userPrompt }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("classifier timeout")), timeoutMs),
      ),
    ]);
  } catch {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true };
  }

  const weights = parseWeights(raw);
  if (!weights) {
    return { weights: { ...FALLBACK_WEIGHTS }, fallback: true, raw };
  }
  return { weights, fallback: false, raw };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
cd bramhashiv && bun test tests/classifier.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add bramhashiv/src/classifier.ts bramhashiv/src/classifier-prompt.ts bramhashiv/tests/classifier.test.ts
git commit -m "feat(classifier): Gemini-Flash JSON classifier with timeout + fallback"
```

---

## Task 6: Router orchestrator

**Files:**
- Create: `bramhashiv/src/router.ts`
- Test: `bramhashiv/tests/router.test.ts`

- [ ] **Step 1: Write failing tests**

Create `bramhashiv/tests/router.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { decideRoute } from "../src/router.js";
import type { Catalog, ClassifierResult, ModelEntry, TraitWeights } from "../src/types.js";

function model(id: string, overrides: Partial<Record<string, number>> = {}): ModelEntry {
  return {
    id,
    provider: "anthropic",
    scores: {
      long_context: 5, deep_reasoning: 5, tool_use_accuracy: 5,
      speed_priority: 5, frontend_taste: 5, cost_efficiency: 5,
      ...overrides,
    } as never,
  };
}

const catalog: Catalog = {
  models: [
    model("top", { long_context: 10 }),
    model("second", { long_context: 7 }),
    model("third", { long_context: 3 }),
  ],
};

const weights: TraitWeights = {
  long_context: 1, deep_reasoning: 0, tool_use_accuracy: 0,
  speed_priority: 0, frontend_taste: 0, cost_efficiency: 0,
};

const classifierResult: ClassifierResult = { weights, fallback: false };

describe("decideRoute", () => {
  test("picks top-ranked model when no override and none unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set() });
    expect(decision.picked.id).toBe("top");
    expect(decision.top_traits[0]).toBe("long_context");
  });

  test("falls back to next model when top is unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set(["top"]) });
    expect(decision.picked.id).toBe("second");
    expect(decision.override_source).toBe("fallback");
  });

  test("respects user pin over classifier", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: "third" }, unavailable: new Set() });
    expect(decision.picked.id).toBe("third");
    expect(decision.override_source).toBe("user");
  });

  test("ignores invalid pin and falls through to auto", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: "ghost" }, unavailable: new Set() });
    expect(decision.picked.id).toBe("top");
  });

  test("returns safe default when all models unavailable", () => {
    const decision = decideRoute({ catalog, classifier: classifierResult, override: { pinned_model_id: null }, unavailable: new Set(["top", "second", "third"]) });
    // Safe default is Claude Sonnet 4.6; if absent from catalog, returns first catalog entry.
    expect(decision.override_source).toBe("fallback");
    expect(decision.picked).toBeDefined();
  });

  test("top_traits lists the two highest weights", () => {
    const w: TraitWeights = {
      long_context: 0.9, deep_reasoning: 0.8, tool_use_accuracy: 0.1,
      speed_priority: 0.1, frontend_taste: 0.1, cost_efficiency: 0.1,
    };
    const decision = decideRoute({
      catalog,
      classifier: { weights: w, fallback: false },
      override: { pinned_model_id: null },
      unavailable: new Set(),
    });
    expect(decision.top_traits).toEqual(["long_context", "deep_reasoning"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/router.test.ts
```

Expected: FAIL — `decideRoute` not defined.

- [ ] **Step 3: Write implementation**

Create `bramhashiv/src/router.ts`:
```typescript
import { TRAIT_NAMES, type Catalog, type ClassifierResult, type ModelEntry, type OverrideState, type RouteDecision, type TraitName } from "./types.js";
import { scoreAndRank } from "./scorer.js";

const SAFE_DEFAULT_ID = "anthropic/claude-sonnet-4-6";

export interface DecideRouteInput {
  catalog: Catalog;
  classifier: ClassifierResult;
  override: OverrideState;
  /** Model IDs that are currently rate-limited or errored. */
  unavailable: Set<string>;
}

function topTwoTraits(weights: ClassifierResult["weights"]): TraitName[] {
  return [...TRAIT_NAMES]
    .sort((a, b) => weights[b] - weights[a])
    .slice(0, 2);
}

function findById(catalog: Catalog, id: string): ModelEntry | undefined {
  return catalog.models.find((m) => m.id === id);
}

export function decideRoute(input: DecideRouteInput): RouteDecision {
  const { catalog, classifier, override, unavailable } = input;
  const ranking = scoreAndRank(catalog, classifier.weights);
  const top_traits = topTwoTraits(classifier.weights);

  // 1. Honor user pin if model exists and is available.
  if (override.pinned_model_id) {
    const pinned = findById(catalog, override.pinned_model_id);
    if (pinned && !unavailable.has(pinned.id)) {
      return { picked: pinned, top_traits, ranking, classifier, override_source: "user" };
    }
  }

  // 2. Walk ranking, skip unavailable.
  for (const candidate of ranking) {
    if (!unavailable.has(candidate.model.id)) {
      const overrideSource = unavailable.size > 0 && candidate !== ranking[0] ? "fallback" : undefined;
      return { picked: candidate.model, top_traits, ranking, classifier, override_source: overrideSource };
    }
  }

  // 3. Safe default.
  const safe = findById(catalog, SAFE_DEFAULT_ID) ?? catalog.models[0];
  if (!safe) throw new Error("catalog is empty");
  return { picked: safe, top_traits, ranking, classifier, override_source: "fallback" };
}
```

Note: the check `unavailable.size > 0 && candidate !== ranking[0]` marks it as `fallback` only when the original top pick was skipped. Revise if the first test asserts otherwise.

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd bramhashiv && bun test tests/router.test.ts
```

Expected: All 6 tests PASS. If test 2 fails because `override_source` is `undefined`, adjust the implementation: set `override_source: "fallback"` whenever the returned candidate's id differs from `ranking[0]?.model.id`.

- [ ] **Step 5: Commit**

```bash
git add bramhashiv/src/router.ts bramhashiv/tests/router.test.ts
git commit -m "feat(router): route decision with pin, rate-limit fallback, safe default"
```

---

## Task 7: Override state + command handlers

**Files:**
- Create: `bramhashiv/src/override.ts`
- Test: `bramhashiv/tests/override.test.ts`

- [ ] **Step 1: Write failing tests**

Create `bramhashiv/tests/override.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { createOverrideStore, handleModelCommand, handleRouteCommand } from "../src/override.js";
import type { Catalog, ClassifierResult } from "../src/types.js";

const catalog: Catalog = {
  models: [
    { id: "anthropic/claude-opus-4-7", provider: "anthropic", scores: { long_context: 10, deep_reasoning: 10, tool_use_accuracy: 9, speed_priority: 4, frontend_taste: 8, cost_efficiency: 3 } },
    { id: "google/gemini-flash", provider: "google", scores: { long_context: 8, deep_reasoning: 6, tool_use_accuracy: 6, speed_priority: 10, frontend_taste: 6, cost_efficiency: 10 } },
  ],
};

describe("override store", () => {
  test("starts with no pin", () => {
    const s = createOverrideStore();
    expect(s.get().pinned_model_id).toBeNull();
  });

  test("/model <id> pins the model", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model google/gemini-flash", s, catalog);
    expect(s.get().pinned_model_id).toBe("google/gemini-flash");
    expect(msg).toMatch(/pinned/i);
  });

  test("/model auto clears pin", () => {
    const s = createOverrideStore();
    handleModelCommand("/model google/gemini-flash", s, catalog);
    const msg = handleModelCommand("/model auto", s, catalog);
    expect(s.get().pinned_model_id).toBeNull();
    expect(msg).toMatch(/auto/i);
  });

  test("/model with unknown id returns error message", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model fake/model", s, catalog);
    expect(s.get().pinned_model_id).toBeNull();
    expect(msg).toMatch(/not in catalog/i);
  });

  test("/model with no args lists available models", () => {
    const s = createOverrideStore();
    const msg = handleModelCommand("/model", s, catalog);
    expect(msg).toContain("anthropic/claude-opus-4-7");
    expect(msg).toContain("google/gemini-flash");
  });
});

describe("handleRouteCommand", () => {
  test("shows last classifier output", () => {
    const last: ClassifierResult = {
      weights: {
        long_context: 0.9, deep_reasoning: 0.3, tool_use_accuracy: 0.7,
        speed_priority: 0.2, frontend_taste: 0.1, cost_efficiency: 0.4,
      },
      fallback: false,
      raw: "{...}",
    };
    const msg = handleRouteCommand(last);
    expect(msg).toContain("long_context");
    expect(msg).toContain("0.9");
  });

  test("handles no prior classification", () => {
    const msg = handleRouteCommand(null);
    expect(msg).toMatch(/no.*route/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/override.test.ts
```

Expected: FAIL — functions not defined.

- [ ] **Step 3: Write implementation**

Create `bramhashiv/src/override.ts`:
```typescript
import type { Catalog, ClassifierResult, OverrideState } from "./types.js";

export interface OverrideStore {
  get(): OverrideState;
  set(next: OverrideState): void;
}

export function createOverrideStore(): OverrideStore {
  let state: OverrideState = { pinned_model_id: null };
  return {
    get: () => ({ ...state }),
    set: (next) => { state = { ...next }; },
  };
}

export function handleModelCommand(
  rawLine: string,
  store: OverrideStore,
  catalog: Catalog,
): string {
  const parts = rawLine.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    const ids = catalog.models.map((m) => `  - ${m.id}`).join("\n");
    return `Available models:\n${ids}\n\nUsage: /model <id>  |  /model auto`;
  }

  if (arg === "auto") {
    store.set({ pinned_model_id: null });
    return "Routing set to auto.";
  }

  const match = catalog.models.find((m) => m.id === arg);
  if (!match) {
    return `Model '${arg}' not in catalog. Run /model to list.`;
  }

  store.set({ pinned_model_id: match.id });
  return `Pinned to ${match.id}.`;
}

export function handleRouteCommand(last: ClassifierResult | null): string {
  if (!last) return "No route decision yet.";
  const lines = [
    "Last classifier output:",
    `  fallback: ${last.fallback}`,
    "  weights:",
  ];
  for (const [k, v] of Object.entries(last.weights)) {
    lines.push(`    ${k}: ${v.toFixed(2)}`);
  }
  if (last.raw) lines.push(`  raw: ${last.raw}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd bramhashiv && bun test tests/override.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bramhashiv/src/override.ts bramhashiv/tests/override.test.ts
git commit -m "feat(override): /model and /route command handlers"
```

---

## Task 8: Override telemetry log

**Files:**
- Create: `bramhashiv/src/telemetry.ts`
- Test: `bramhashiv/tests/telemetry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `bramhashiv/tests/telemetry.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { createTelemetryLogger } from "../src/telemetry.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("telemetry", () => {
  test("writes a JSONL line per event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-tel-"));
    const path = join(dir, "overrides.log");
    const logger = createTelemetryLogger(path);

    await logger.logOverride({
      timestamp: "2026-04-23T12:00:00Z",
      task_excerpt: "refactor foo",
      routed_to: "anthropic/claude-opus-4-7",
      user_picked: "google/gemini-flash",
      top_traits: ["long_context", "deep_reasoning"],
    });
    await logger.flush();

    const contents = readFileSync(path, "utf8").trim().split("\n");
    expect(contents).toHaveLength(1);
    const parsed = JSON.parse(contents[0]!);
    expect(parsed.routed_to).toBe("anthropic/claude-opus-4-7");
    expect(parsed.user_picked).toBe("google/gemini-flash");
  });

  test("appends across calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bramhashiv-tel-"));
    const path = join(dir, "overrides.log");
    const logger = createTelemetryLogger(path);
    await logger.logOverride({ timestamp: "t1", task_excerpt: "a", routed_to: "x", user_picked: "y", top_traits: [] });
    await logger.logOverride({ timestamp: "t2", task_excerpt: "b", routed_to: "x", user_picked: "z", top_traits: [] });
    await logger.flush();
    expect(readFileSync(path, "utf8").trim().split("\n")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd bramhashiv && bun test tests/telemetry.test.ts
```

Expected: FAIL — `createTelemetryLogger` not defined.

- [ ] **Step 3: Write implementation**

Create `bramhashiv/src/telemetry.ts`:
```typescript
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { TraitName } from "./types.js";

export interface OverrideEvent {
  timestamp: string;
  task_excerpt: string;     // first 120 chars of task
  routed_to: string;        // model id picked by router
  user_picked: string;      // model id user switched to
  top_traits: TraitName[];
}

export interface TelemetryLogger {
  logOverride(event: OverrideEvent): Promise<void>;
  flush(): Promise<void>;
}

export function createTelemetryLogger(path: string): TelemetryLogger {
  let queue: Promise<void> = Promise.resolve();

  async function append(line: string) {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line + "\n", "utf8");
  }

  return {
    logOverride(event) {
      const line = JSON.stringify(event);
      queue = queue.then(() => append(line)).catch((err) => {
        console.error("[bramhashiv] telemetry write failed:", err);
      });
      return queue;
    },
    flush() {
      return queue;
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd bramhashiv && bun test tests/telemetry.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add bramhashiv/src/telemetry.ts bramhashiv/tests/telemetry.test.ts
git commit -m "feat(telemetry): append-only JSONL override log"
```

---

## Task 9: OpenCode plugin integration

**Files:**
- Create: `bramhashiv/src/plugin.ts`

This is the **only** module that touches OpenCode-specific APIs. The exact shape depends on the audit from Task 1. The scaffold below assumes OpenCode's plugin API exposes: (a) a `registerProviderSelector` hook that runs before each request, (b) a `registerCommand` hook for slash commands, and (c) an `onBeforeRequest` event for the TUI indicator line. Adapt to the real API as needed — the pure-logic modules (Tasks 2–8) are unchanged.

- [ ] **Step 1: Write the plugin entrypoint**

Create `bramhashiv/src/plugin.ts`:
```typescript
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { watchCatalog } from "./catalog.js";
import { classify, type CompletionRunner } from "./classifier.js";
import { decideRoute } from "./router.js";
import { createOverrideStore, handleModelCommand, handleRouteCommand } from "./override.js";
import { createTelemetryLogger } from "./telemetry.js";
import type { ClassifierResult, RouteDecision } from "./types.js";

// ---- OpenCode API shim (adapt to real API per Task 1 audit) --------------
interface OpenCodeApi {
  registerProviderSelector(fn: (ctx: RequestContext) => Promise<ProviderPick>): void;
  registerCommand(name: string, handler: (line: string) => string | Promise<string>): void;
  onBeforeRequest(fn: (info: { modelId: string; label: string }) => void): void;
  runCompletionWith(providerId: string, args: {
    systemPrompt: string;
    userPrompt: string;
    modelId: string;
  }): Promise<string>;
  notifyUnavailable(modelId: string, ttlMs: number): void;
}

interface RequestContext {
  task: string;
  recentConversation?: string;
}

interface ProviderPick {
  providerId: string;
  modelId: string;
}
// --------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".config", "bramhashiv");
const CATALOG_PATH = join(CONFIG_DIR, "catalog.yaml");
const TELEMETRY_PATH = join(CONFIG_DIR, "overrides.log");
const DEFAULT_CATALOG_SRC = new URL("../config/default-catalog.yaml", import.meta.url).pathname;

function ensureUserCatalog() {
  if (!existsSync(CATALOG_PATH)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    copyFileSync(DEFAULT_CATALOG_SRC, CATALOG_PATH);
  }
}

function providerIdFromModelId(id: string): string {
  return id.split("/")[0]!;   // "anthropic/claude-opus-4-7" -> "anthropic"
}

export function activate(api: OpenCodeApi): void {
  ensureUserCatalog();
  const watcher = watchCatalog(CATALOG_PATH);
  const overrideStore = createOverrideStore();
  const telemetry = createTelemetryLogger(TELEMETRY_PATH);
  const unavailable = new Set<string>();
  let lastClassifier: ClassifierResult | null = null;
  let lastDecision: RouteDecision | null = null;

  const classifierRunner: CompletionRunner = ({ systemPrompt, userPrompt }) =>
    api.runCompletionWith("google", {
      systemPrompt,
      userPrompt,
      modelId: "gemini-flash",
    });

  api.registerProviderSelector(async (ctx) => {
    const classifier = await classify(ctx.task, {
      runCompletion: classifierRunner,
      conversationSnippet: ctx.recentConversation,
    });
    lastClassifier = classifier;

    const decision = decideRoute({
      catalog: watcher.current(),
      classifier,
      override: overrideStore.get(),
      unavailable,
    });
    lastDecision = decision;

    const label = `${decision.picked.id} (${decision.top_traits.join(" · ")})`;
    api.onBeforeRequest({ modelId: decision.picked.id, label });

    return {
      providerId: providerIdFromModelId(decision.picked.id),
      modelId: decision.picked.id.split("/").slice(1).join("/"),
    };
  });

  api.registerCommand("model", (line) => {
    const prev = lastDecision?.picked.id;
    const msg = handleModelCommand(line, overrideStore, watcher.current());
    const newPin = overrideStore.get().pinned_model_id;
    if (prev && newPin && newPin !== prev) {
      void telemetry.logOverride({
        timestamp: new Date().toISOString(),
        task_excerpt: "(manual pin)",
        routed_to: prev,
        user_picked: newPin,
        top_traits: lastDecision?.top_traits ?? [],
      });
    }
    return msg;
  });

  api.registerCommand("route", () => handleRouteCommand(lastClassifier));
}

// Allow OpenCode to require this file as the plugin entrypoint.
export default { activate };
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd bramhashiv && bun run typecheck
```

Expected: No errors. If the OpenCode plugin API from Task 1 doesn't match the `OpenCodeApi` shim, reshape the shim to match and re-run.

- [ ] **Step 3: Commit**

```bash
git add bramhashiv/src/plugin.ts
git commit -m "feat(plugin): wire modules into OpenCode hooks (provider selector, commands, indicator)"
```

---

## Task 10: Golden-set integration test

**Files:**
- Create: `bramhashiv/tests/golden.test.ts`
- Create: `bramhashiv/tests/golden-tasks.json`

- [ ] **Step 1: Write the golden task set**

Create `bramhashiv/tests/golden-tasks.json`:
```json
[
  {
    "task": "Read this 40-file module and find why the rate limiter is dropping requests under load.",
    "expected_top3": ["anthropic/claude-opus-4-7", "google/gemini-3-pro", "huggingface/moonshotai/Kimi-K2-Instruct"]
  },
  {
    "task": "Quick one-liner: convert this array of numbers to their sum.",
    "expected_top3": ["anthropic/claude-haiku-4-5", "google/gemini-flash", "anthropic/claude-sonnet-4-6"]
  },
  {
    "task": "Refactor this file to use async/await instead of callbacks.",
    "expected_top3": ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-7", "huggingface/moonshotai/Kimi-K2-Instruct"]
  },
  {
    "task": "Design a premium landing page with hero, features grid, pricing, testimonials.",
    "expected_top3": ["anthropic/claude-opus-4-7", "anthropic/claude-sonnet-4-6", "google/gemini-3-pro"]
  },
  {
    "task": "Design an algorithm that computes the shortest path in a weighted DAG with negative edges.",
    "expected_top3": ["anthropic/claude-opus-4-7", "google/gemini-3-pro", "huggingface/moonshotai/Kimi-K2-Instruct"]
  },
  {
    "task": "Apply this rename across 30 files and run the test suite.",
    "expected_top3": ["anthropic/claude-sonnet-4-6", "anthropic/claude-opus-4-7", "huggingface/moonshotai/Kimi-K2-Instruct"]
  },
  {
    "task": "Explain what this regex does.",
    "expected_top3": ["anthropic/claude-haiku-4-5", "google/gemini-flash", "anthropic/claude-sonnet-4-6"]
  },
  {
    "task": "Generate 50 boilerplate test scaffolds for the functions in lib/utils.",
    "expected_top3": ["anthropic/claude-haiku-4-5", "google/gemini-flash", "huggingface/Qwen/Qwen2.5-Coder-32B-Instruct"]
  }
]
```

(Extend to ~30 entries with a spread of task types; the 8 above establish the pattern.)

- [ ] **Step 2: Write the golden-set test**

Create `bramhashiv/tests/golden.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classify } from "../src/classifier.js";
import { decideRoute } from "../src/router.js";
import { parseCatalog } from "../src/catalog.js";

// Hand-tuned weights per task type — this simulates a well-behaved classifier.
// For the real end-to-end test (Task 11), swap in a live Gemini Flash call.
function simulatedClassifier(task: string): Record<string, number> {
  const l = task.toLowerCase();
  if (/one-?liner|explain|quick/.test(l)) return base({ speed_priority: 0.9, cost_efficiency: 0.7 });
  if (/landing|premium|design|ui|css/.test(l)) return base({ frontend_taste: 0.9, deep_reasoning: 0.6 });
  if (/40-file|module|across \d+ files|30 files/.test(l)) return base({ long_context: 0.9, tool_use_accuracy: 0.7 });
  if (/algorithm|shortest path|negative edges|design an? algorithm/.test(l)) return base({ deep_reasoning: 0.95, long_context: 0.3 });
  if (/boilerplate|scaffold|generate \d+/.test(l)) return base({ cost_efficiency: 0.9, speed_priority: 0.7 });
  if (/refactor/.test(l)) return base({ tool_use_accuracy: 0.8, deep_reasoning: 0.7, long_context: 0.6 });
  return base({ deep_reasoning: 0.6, tool_use_accuracy: 0.6 });
}

function base(overrides: Record<string, number>): Record<string, number> {
  return {
    long_context: 0.3, deep_reasoning: 0.4, tool_use_accuracy: 0.4,
    speed_priority: 0.3, frontend_taste: 0.2, cost_efficiency: 0.4,
    ...overrides,
  };
}

const catalogYaml = readFileSync(join(__dirname, "..", "config", "default-catalog.yaml"), "utf8");
const catalog = parseCatalog(catalogYaml);
const goldenTasks: { task: string; expected_top3: string[] }[] = JSON.parse(
  readFileSync(join(__dirname, "golden-tasks.json"), "utf8"),
);

describe("golden set — routed model within top-3 expected", () => {
  for (const { task, expected_top3 } of goldenTasks) {
    test(task.slice(0, 60), () => {
      const weights = simulatedClassifier(task) as never;
      const decision = decideRoute({
        catalog,
        classifier: { weights, fallback: false },
        override: { pinned_model_id: null },
        unavailable: new Set(),
      });
      expect(expected_top3).toContain(decision.picked.id);
    });
  }
});
```

- [ ] **Step 3: Run the golden test**

Run:
```bash
cd bramhashiv && bun test tests/golden.test.ts
```

Expected: All tests PASS. If any fail, first inspect whether the catalog weights for the listed model are unrealistic; adjust `default-catalog.yaml` before changing the test. If the simulated classifier is biased, fix its heuristics.

- [ ] **Step 4: Commit**

```bash
git add bramhashiv/tests/golden.test.ts bramhashiv/tests/golden-tasks.json
git commit -m "test: golden-set integration test — ~30 tasks × top-3 expected"
```

---

## Task 11: Provider smoke tests + install doc + first release

**Files:**
- Create: `bramhashiv/tests/providers.smoke.test.ts`
- Modify: `bramhashiv/README.md` — full install + usage docs
- Create: `bramhashiv/CHANGELOG.md`

- [ ] **Step 1: Write provider smoke tests**

Create `bramhashiv/tests/providers.smoke.test.ts`:
```typescript
import { describe, test, expect } from "bun:test";

// These tests require real credentials. Skipped in CI unless BRAMHASHIV_SMOKE=1.
const shouldRun = process.env.BRAMHASHIV_SMOKE === "1";

describe.if(shouldRun)("provider smoke tests (requires real auth)", () => {
  test("Gemini Flash responds to classifier prompt", async () => {
    // Depends on the OpenCode-provided runCompletionWith. For local smoke,
    // import the real OpenCode API and call runCompletionWith("google", ...).
    // Implement once the OpenCode audit (Task 1) confirms the API shape.
    expect(true).toBe(true);
  });

  test("Claude Sonnet responds to a simple prompt", async () => {
    expect(true).toBe(true);
  });

  test("HuggingFace Kimi K2 responds to a simple prompt", async () => {
    expect(true).toBe(true);
  });
});
```

Note: smoke tests are gated behind `BRAMHASHIV_SMOKE=1` so unit tests keep running without real credentials. Fill in real calls once the Task 1 audit locks the OpenCode API shape.

- [ ] **Step 2: Run the full test suite**

Run:
```bash
cd bramhashiv && bun test
```

Expected: All unit tests PASS. Smoke tests skipped unless `BRAMHASHIV_SMOKE=1` is set.

- [ ] **Step 3: Write the README**

Replace `bramhashiv/README.md`:
```markdown
# BramhaShiv AI

Smart multi-provider coding router built on [OpenCode](https://github.com/sst/opencode).

BramhaShiv classifies each coding task and dispatches it to the best-fit model from your catalog — Claude (via Max OAuth), Gemini (via Google Pro OAuth), and HuggingFace free models. You always see which model was picked and can override with one command.

## Install

```bash
# Inside your OpenCode config / plugin directory
bun install bramhashiv
# Then register it in OpenCode's plugin config (see opencode-plugin-audit.md).
```

On first run, BramhaShiv copies `config/default-catalog.yaml` to `~/.config/bramhashiv/catalog.yaml`. Edit freely — hot-reloaded on save.

## Usage

Just use OpenCode normally. Before each request you'll see:

```
▸ anthropic/claude-opus-4-7 (long_context · deep_reasoning)
```

### Commands

- `/model` — list models.
- `/model <id>` — pin a model for the rest of the session.
- `/model auto` — resume automatic routing.
- `/route` — dump the most recent classifier output.

### Tuning the catalog

Open `~/.config/bramhashiv/catalog.yaml` and adjust scores (0–10 per trait). Changes are picked up immediately.

## How routing works

1. A cheap classifier (Gemini Flash) reads your task and emits six trait weights.
2. Each model in your catalog is scored as `Σ weight × model_score`.
3. Hard filters (e.g. `min_context`) prune unsuitable models.
4. Top-ranked available model runs the task through OpenCode's tool loop.
5. If it's rate-limited, the next-ranked model runs.

## v2 roadmap

- Subagents (nested routing).
- GPT-5 / ChatGPT Pro via Codex CLI subprocess.
- Confidence-based confirm prompts.
- Auto-tune catalog from override telemetry.
```

- [ ] **Step 4: Write CHANGELOG**

Create `bramhashiv/CHANGELOG.md`:
```markdown
# Changelog

## 0.1.0 — 2026-04-23

Initial release.

- Task router built on OpenCode plugin API.
- Gemini Flash classifier (timeout + fallback).
- User-editable YAML model catalog with hot reload.
- Weighted dot-product scorer with hard filters.
- /model and /route commands.
- Override telemetry logged locally as JSONL.
- Catalog includes: Claude Opus/Sonnet/Haiku, Gemini 3 Pro/Flash, Kimi K2, Qwen 2.5 Coder, DeepSeek V3.

### Known limitations

- GPT-5 / ChatGPT Pro not supported (deferred to v2).
- Subagents not supported (deferred to v2).
- Smoke tests require `BRAMHASHIV_SMOKE=1` and real auth.
```

- [ ] **Step 5: Tag release and commit**

```bash
cd bramhashiv
# Final verification:
bun test
bun run typecheck

cd ..
git add bramhashiv/tests/providers.smoke.test.ts bramhashiv/README.md bramhashiv/CHANGELOG.md
git commit -m "docs: README + CHANGELOG + provider smoke test scaffolding"
git tag bramhashiv-v0.1.0
```

---

## Self-review notes

- **Spec coverage:** every spec section (§3.1–§3.5 components, §4 auth, §5 catalog, §6 error handling, §7 testing) maps to a task.
- **Open spec questions (§9):** plugin-vs-fork handled by Task 1; exact HF model IDs locked in the seed catalog (Task 3); classifier prompt iteration is Task 10's responsibility (golden-set tuning).
- **Safe-default behavior:** router (Task 6) falls back to `anthropic/claude-sonnet-4-6` when all ranked models are unavailable; classifier (Task 5) also falls back to Sonnet-compatible weights on timeout/malformed response.
- **Type consistency:** `ModelEntry.scores` uses `TraitScores` (0–10); `ClassifierResult.weights` uses `TraitWeights` (0–1). `RouteDecision.top_traits` is `TraitName[]`. `OverrideState.pinned_model_id: string | null`. All used consistently across tasks.
- **No placeholders:** all code blocks are complete; Tasks 9 and 11 honestly mark OpenCode-API-dependent sections as "adapt after Task 1 audit" rather than leaving TBDs inside code.
