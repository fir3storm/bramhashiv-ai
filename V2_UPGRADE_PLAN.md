# bramhashiv → OpenCode V2 Migration Plan

## Goal

Migrate `bramhashiv` (smart multi-provider coding router) from the OpenCode **V1** plugin API
to the **V2** plugin API, so it loads under OpenCode 2.x.

## Current V1 architecture (verified from source)

- Entry: `src/plugin-server.ts` (697 lines).
- Default export (line 697): `export default { id: "bramhashiv", server: bramhashivServer };`
- `server` = V1 `Plugin` = `async (_input) => Promise<Hooks>` (built by `createServerPlugin(config)`).
- **Only two V1 hooks** are registered:
  1. `"chat.message"` (lines 265–513) — the router.
  2. `"event"` (lines 514–644) — health / learning / failover / telemetry.

### Hook 1 — `chat.message` (the core router)

1. Extract task text from `hookOutput.parts`.
2. Handle pin / regeneration / task decomposition (`heuristicShouldPlan` + `planTask`).
3. Build scoring context (tokens, health, affinity, budget, India-context).
4. `runRouterPipeline(...)` → classifier (Gemini Flash) emits 6 trait weights → score catalog →
   pick top model.
5. **`hookOutput.message.model = { providerID, modelID }`** ← per-turn model override (the feature).
6. Optionally inject plan / explanation / dry-run text parts into `hookOutput.parts`.
7. Persist state, record budget/health, update affinity/warmup/dashboard.

### Hook 2 — `event` (feedback loop)

- `session.diff` → latest diff size (for outcome metrics).
- `message.updated` → token counts, rate-limit header → 5-min cooldown, task-complete outcome
  (success/latency → health `recordSuccess`).
- `session.error` → `recordError` health, `modelsToMarkUnavailable` failover, failed outcome.

### API surface size (important)

`grep -rl "@opencode-ai/(plugin|sdk)" src/` matches **only**:
- `src/plugin-server.ts` (type-only import of `Hooks`, `Plugin`, `PluginInput`).
- `src/error-tracking.ts` — but this only references `@opencode-ai/sdk` in a **comment**; its
  `SessionErrorPayload` type is self-defined.

All ~45 other files (classifier, router, scorer, catalog, budget, health, planner, dashboard,
telemetry, etc.) are **pure logic with zero OpenCode API dependency** and port unchanged.

## The critical blocker

V1 `chat.message` mutated `hookOutput.message.model` to pick the model **per request**.

V2 has **no per-request model override in any hook**:

| V2 hook        | Can it change the model? |
|----------------|--------------------------|
| `prompt`       | No — edits `text`/`files`/`metadata`/`delivery` only |
| `context`      | No — `event.model` is `readonly {providerID,id,variant}` |
| `compaction`/`generate`/`title` | No — same `readonly model` |

The only V2 model-change API is `ctx.session.switchModel({ sessionID, model })`, which is
**persistent** (affects subsequent requests), plus `ctx.session.switchAgent`.

## Recommended approach

Migrate `chat.message` → `ctx.session.hook("prompt", ...)` and call `switchModel`:

```ts
await ctx.session.hook("prompt", async (event) => {
  const chosen = await route(event.prompt.text);      // existing classifier/router
  if (chosen) {
    await ctx.session.switchModel({
      sessionID: event.sessionID,
      model: { providerID: chosen.providerID, id: chosen.modelID },
    });
  }
});
```

Why this works / caveats:

- `prompt` runs at **admission**, before the agent loop resolves the model for that turn, so
  `switchModel` should take effect for the **current** turn (needs validation — see Phase 0).
- Because bramhashiv routes **every** user turn, re-calling `switchModel` each turn gives
  effectively per-turn routing.
- Tool-continuation turns do **not** run `prompt`; the model stays as last set — desirable
  (consistent model throughout a tool loop).
- Trade-off: `switchModel` is an extra async round-trip per turn (adds to classifier latency).

### Rejected alternatives

- `context` hook + `switchModel`: `context` fires with the **current** request's readonly model,
  so `switchModel` there changes the *next* request — wrong turn. Not viable.
- Subagent routing (like `opencode-model-router`): spawn a subagent per task with the chosen
  model. V2-native but a large architectural rewrite and loses session continuity. Keep as
  fallback only if the `switchModel` spike fails.

## Migration phases

### Phase 0 — validation spike (do first, blocks everything)

Confirm `switchModel` inside the `prompt` hook changes the **current** turn's model.

- Minimal throwaway plugin: log `event.sessionID`, call `switchModel` with a distinctive model,
  observe which model actually handles the turn.
- Also confirm `event.sessionID` and `event.prompt.text` are populated in the `prompt` hook.
- If the timing is wrong (model applies to next turn only), fall back to the subagent-routing
  approach before porting the rest.

### Phase 1 — package.json

- `peerDependencies`: `@opencode-ai/plugin` → `@opencode/plugin` (V2), `@opencode-ai/sdk` → drop
  (not actually used — only a comment in error-tracking.ts).
- `devDependencies` likewise.
- Bump version (project master is 0.4.0; npm is stale at 0.1.5).
- Add `Plugin.define` import path.

### Phase 2 — entry rewrite (plugin-server.ts)

Replace `createServerPlugin(...): Plugin` returning `async (_input) => ({...hooks})` with:

```ts
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "bramhashiv",
  async setup(ctx) {
    // config init, catalog watcher, state load (move from old server fn)
    // register prompt hook
    // subscribe to event stream
    return () => { /* cleanup: dispose watcher, abort event stream */ };
  },
});
```

(Optionally keep a dual V1+V2 shape — `{ ...Plugin.define({...}), async server(){...} }` — if
upstream wants to preserve V1 compat. Recommended default: clean V2.)

### Phase 3 — `chat.message` → `prompt` hook

- Move the classification + scoring + `runRouterPipeline` body into the `prompt` hook.
- `hookOutput.parts` text → `event.prompt.text`.
- `hookOutput.message.model = {...}` → `ctx.session.switchModel({...})`.
- Injected plan/explanation/dry-run text parts → either prepend to `event.prompt.text` or drop
  (V2 has no "extra parts" on prompt; could append to text or emit via `ctx.session.synthetic`).

### Phase 4 — `event` → `ctx.event.subscribe()`

- `const controller = new AbortController();`
- `for await (const ev of ctx.event.subscribe({ signal: controller.signal })) { ... }`
- Return `() => controller.abort()` as cleanup.
- **Verify V2 event payloads**: V1 `session.error` / `message.updated` / `session.diff` have
  different names/shapes in V2 (`V2EventEncoded`). Map each one; the failover
  (`modelsToMarkUnavailable`) and health/outcome logic depend on exact fields.
- This is the second riskiest part after model override — the event schema changed.

### Phase 5 — auth

- `opencode-auth.ts` reads `~/.local/share/opencode/auth.json` (V1 path) for the Google API key.
- V2 stores credentials via the `credential`/`integration` domain. Options:
  - Keep reading auth.json (may still exist / may move).
  - Fall back to `ctx.integration.connection` or env (`GOOGLE_GENERATIVE_AI_API_KEY` already
    supported as fallback).
- Verify where V2 actually writes the google API key.

### Phase 6 — tests + verify

- `bun test` (404 tests) — pure-logic tests should pass unchanged; any that exercise
  plugin-server.ts need updating.
- `bun x tsc --noEmit` typecheck against `@opencode/plugin` types.
- Manual: load into OpenCode 2.x, confirm it routes and failover works.

## Secondary notes

- README install currently shows V1 (`"plugin": ["bramhashiv"]` + `opencode plugin bramhashiv`).
  Update to V2 `plugins` + `@opencode/plugin` usage.
- `exports` in package.json points at `src/plugin-server.ts` (TS shipped raw). V2 loads TS fine,
  but consider a build/dist step for a cleaner publish.

## PR mechanics

- Repo `fir3storm/bramhashiv-ai`, default branch `master`, Apache-2.0, not archived, 0 open issues.
- Need a fork (no write access to upstream) → push branch → open PR.
- `advanced-routing` branch exists; base PR off `master` unless told otherwise.
- Suggest: `git checkout -b feat/v2-migration` off `master`.

## Open questions for maintainer / user

1. Clean V2-only, or dual V1+V2 export for backward compat?
2. Keep injected plan/explanation text (needs a V2 text-injection mechanism), or drop it?
3. Ship TS source directly (current) or add a build step to `dist/`?
