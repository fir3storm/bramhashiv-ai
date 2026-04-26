# Security & Credentials

## Where your secrets actually live

BramhaShiv **does not bundle, copy, or commit any credentials**. All API keys, OAuth tokens, and session data stay on your machine in OpenCode's user-private locations:

```
~/.local/share/opencode/auth.json   — OAuth + API keys (provider auth)
~/.config/bramhashiv/catalog.yaml   — your edited model catalog
~/.config/bramhashiv/state.json     — pinned model + last classifier output
~/.config/bramhashiv/overrides.log  — local-only telemetry of override events
```

These paths are **outside the git repository** and never tracked. Cloning this repo gives you zero access to anyone else's credentials.

## What you need to provide yourself

When you install BramhaShiv, you must supply your own provider auth via OpenCode:

```bash
opencode providers login -p openai        # ChatGPT OAuth (uses your subscription)
opencode providers login -p google        # paste your own Gemini API key
opencode providers login -p huggingface   # paste your own HF token
opencode providers login -p openrouter    # paste your own OpenRouter key
opencode providers login -p anthropic     # paste your own Anthropic API key (optional)
```

The plugin reads from `~/.local/share/opencode/auth.json` at activation. If a provider isn't authed, BramhaShiv automatically filters its models out of routing — you'll never accidentally try to dispatch through a missing credential.

## What's in this repo

- TypeScript source code (`src/`, `tests/`)
- A model **scoring** catalog (`config/default-catalog.yaml`) — opinions about model strengths, no credentials
- Build / test config (`package.json`, `tsconfig.json`, `bunfig.toml`)
- Documentation

Test files contain string literals like `"AIza-test-key"` and `"hf_x"`. These are intentionally **invalid placeholder strings** used as fixtures. They are not real credentials and cannot authenticate against any service.

## Verifying for yourself

Run a credential scan against a fresh clone:

```bash
git clone https://github.com/fir3storm/bramhashiv-ai.git
cd bramhashiv-ai

# Live working tree
git grep -nE 'AIza[A-Za-z0-9_-]{15,}|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|gh[op]_[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9._-]{50,}'

# Full git history
git log --all -p | grep -E 'AIza[A-Za-z0-9_-]{15,}|hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}'
```

Both should return nothing. If you find anything that looks like a real credential, please file an issue immediately.

## Reporting security issues

If you discover a vulnerability or accidental credential leak, please:

1. **Do not** open a public issue.
2. Email the maintainer directly (see `package.json` author field) with the details and a minimal reproduction.

## Threat model recap

- **What this plugin does:** route your text-completion requests across providers you've already authenticated.
- **What this plugin does NOT do:** capture, transmit, log, or share any of your credentials with anyone.
- **What you control:** every API key and OAuth token belongs to you, lives in your home directory, and never leaves your machine.
