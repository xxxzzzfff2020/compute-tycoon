# AGENTS.md — Guidance for AI coding agents

This file gives coding agents (Codex, Claude, etc.) the project context they need.

## Project

Compute Tycoon (算力大亨) — an H5 incremental/idle tycoon game, also a case study of AI-agent-driven game development with human product governance.

## Structure

- `src/app/` — boot, session, command routing
- `src/core/` — time, big numbers
- `src/data/` — product contract content (do not change numbers casually)
- `src/economy/` — game rules, viewmodel, offline settlement
- `src/save/` — storage, validation, migration
- `src/ui/` — DOM renderer (read-only over viewmodel)
- `src/i18n/` — locale dictionaries (zh-CN / en-US)
- `src/platform/` — TapTap runtime adapters
- `src/review/` — isolated review runtime (separate build)
- `scripts/` — simulations, browser verification
- `tests/` — unit + E2E

## Commands

```bash
npm install
npm run dev          # dev server
npm run typecheck    # tsc --noEmit
npm test             # unit tests
npm run e2e          # E2E (jsdom)
npm run build        # production build
npm run simulate     # economy simulation
```

## Rules

1. **Do not change the product contract** (`docs/PRODUCT_CONTRACT.md`) without explicit human approval. Gameplay numbers and progression are governed there.
2. **Never hardcode player-visible strings** outside `src/i18n/`. Add keys to both `zh-CN.ts` and `en-US.ts`.
3. The renderer (`src/ui/render.ts`) is read-only over the viewmodel; state changes go through session commands.
4. Keep offline exactly-once and save-schema compatibility (`docs/SAVE_CONTRACT.md`).
5. Tests are evidence: `npm test` must stay green; add tests for changes.
6. Do not commit secrets, local absolute paths, or `store-materials/` content.
7. Comments may stay Chinese (project convention); player-facing text must be i18n keys.
