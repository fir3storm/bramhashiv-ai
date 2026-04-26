# OpenCode Plugin Audit

## Plugin manifest
- **Yes, for npm plugins:** OpenCode treats `package.json` as the install/runtime manifest via `readPluginManifest()` in `packages/opencode/src/plugin/install.ts`.
- `packageTargets()` in the same file reads `exports["./server"]`, `exports["./tui"]`, `main` (server fallback), optional `oc-themes`, and `engines.opencode`.
- **For path/file plugins, no separate manifest file is required:** module shape is validated by `readV1Plugin()` in `packages/opencode/src/plugin/shared.ts` (default export object with `server()` or `tui()`), and path plugins must provide `id` (`resolvePluginId()`).
- Plugin specs are declared as config `plugin` entries (`Spec`) in `packages/opencode/src/config/plugin.ts`.

## Provider-selection hook
- **Yes (indirect, but real):** `Hooks["chat.message"]` in `packages/plugin/src/index.ts` lets a plugin mutate `output.message` before persistence.
- In `SessionPrompt.createUserMessage` (`packages/opencode/src/session/prompt.ts`), OpenCode calls:
  - `plugin.trigger("chat.message", ..., { message: info, parts })`
  - then `sessions.updateMessage(info)`.
- In `runLoop` (same file), request execution resolves model from persisted `lastUser.model` and calls `getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)`.
- Therefore, a plugin can override which model runs by rewriting `output.message.model` in `chat.message`.
- There is **no dedicated** `registerProviderSelector`-style API.

## Command hook
- **TUI slash commands: yes.**
  - API: `TuiPluginApi.command.register()` and `TuiCommand.slash` in `packages/plugin/src/tui.ts`.
  - Runtime wiring: `pluginApi().command.register` in `packages/opencode/src/cli/cmd/tui/plugin/runtime.ts`.
  - Slash exposure: `slashes()` in `packages/opencode/src/cli/cmd/tui/component/dialog-command.tsx`; consumed by prompt autocomplete in `packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`.
- **Server slash command registration: no.**
  - Prompt submission only dispatches `/...` when command exists in `sync.data.command` (`submit()` in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`).
  - Server command list is built in `packages/opencode/src/command/index.ts` from config/MCP/skills; plugin hooks do not register new server command handlers.
  - A fork patch would likely touch `packages/opencode/src/command/index.ts` (registration surface) and `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` (dispatch path), plus server route wiring.

## TUI hook
- **No single dedicated "before request" callback exists.**
- **But plugins can emit UX indicators before execution:**
  - Server plugin hook `chat.message` can call `PluginInput.client.tui.showToast()` / `appendPrompt()` (SDK methods in `packages/sdk/js/src/gen/sdk.gen.ts`, class `Tui`).
  - Backing endpoints exist in `packages/opencode/src/server/routes/instance/tui.ts` (`/tui/show-toast`, `/tui/append-prompt`).
  - TUI plugins can render persistent status text via slots (`session_prompt_right` in `TuiHostSlotMap`, `packages/plugin/src/tui.ts`) using `api.slots.register(...)`.

## Decision
**Hybrid** — model routing itself is plugin-capable via `chat.message`, but exact `/model <id>` + `/route` server-command semantics are not first-class plugin hooks and need either UX adaptation to TUI plugin commands or a small OpenCode core patch.