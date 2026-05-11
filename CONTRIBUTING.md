# Contributing to BramhaShiv AI

Thanks for helping improve BramhaShiv AI. This project is a TypeScript plugin for OpenCode that routes coding tasks across multiple model providers, so contributions should be careful with provider behavior, credentials, and routing quality.

## Good First Contributions

- Fix unclear docs or install steps.
- Add or improve tests around routing decisions.
- Improve catalog validation and error messages.
- Add safe provider/model metadata updates.
- Report real-world routing cases where the selected model felt wrong.

## Local Setup

```bash
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai
bun install
bun test
bun run typecheck
```

The provider smoke test is skipped by default because it requires real auth. Run it only when you intentionally want to use live credentials:

```bash
BRAMHASHIV_SMOKE=1 bun test tests/providers.smoke.test.ts
```

## Development Guidelines

- Keep changes focused and easy to review.
- Add or update tests for routing, scoring, catalog, telemetry, or provider behavior changes.
- Keep TypeScript strict and avoid broad `any` usage.
- Prefer existing helpers and patterns in `src/` and `tests/`.
- Do not commit credentials, local state files, auth files, or generated secrets.
- Do not log API keys, OAuth tokens, prompts that may contain secrets, or provider responses that may contain private data.
- When changing `config/default-catalog.yaml`, make sure model IDs match OpenCode provider model IDs.

## Before Opening a Pull Request

Run:

```bash
bun run typecheck
bun test
```

Then check:

- Documentation still matches behavior.
- New env vars or config fields are documented.
- Security-sensitive changes are explained.
- Release notes or changelog updates are included when user-facing behavior changes.

## Reporting Bugs

Use the bug report template and include:

- BramhaShiv version or commit.
- OpenCode version.
- Provider auth setup, without secrets.
- The expected route and actual route.
- Any relevant error message.

## Requesting Features

Use the feature request template and describe the workflow you want to improve. For routing features, include an example task and the model/provider behavior you expected.

## Security Issues

Do not open public issues for vulnerabilities, credential leaks, or token exposure. Follow [SECURITY.md](./SECURITY.md).
