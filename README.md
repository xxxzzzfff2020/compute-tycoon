# Compute Tycoon (算力大亨)

> An open-source incremental AI infrastructure tycoon game — and a reproducible case study of AI-agent-driven game development with human product governance.

**Compute Tycoon** is a fully playable H5 incremental/idle tycoon game about building a personal AI studio into a planetary-scale compute empire. It is also a reference implementation: the entire pipeline — product contract, agent roles, code, automated tests, economic simulation, device QA, ads/cloud adapters, release process — is open, documented, and reproducible from a clean clone.

**Play it live:** https://xxxzzzfff2020.github.io/compute-tycoon/

---

## The Game

You start with one AI studio, research models, and accept compute orders. Grow from a single server to server clusters, then to a compute center with machine rooms and flagship projects. Through technology iterations (prestige) you keep permanent progress, discover Singularity Cores, and unlock the endgame:

`AI Studio → Model R&D → Orders → First Server → Server Cluster → Compute Center → Technology Iterations → Off-world Compute Plan → Earth-Moon Compute Network → Dyson Compute Sphere`

- **Locales:** zh-CN (default) and en-US, switchable in-game, preference stored outside the save schema
- **Offline progression:** exactly-once offline receipts, stage-based offline caps
- **Save safety:** schema-versioned localStorage saves, export/import, exactly-once claims
- **No framework lock-in:** TypeScript + Vite + Vitest + decimal.js, DOM-first rendering

## Features

- 6 model archetypes with roles, training, and permanent archive bonuses
- Manual order flow → automation unlock → high-throughput server clusters
- 8 servers → Stage 2 settlement → Compute Center (power / compute cards / optical / storage)
- 3 machine rooms + 3 flagship projects, era/tech archives, blueprint milestones
- Technology iterations (×1.5 / ×2.0 / ×2.0 permanent multipliers)
- Singularity Cores (3), Off-world Compute Plan reveal, Stage 4 lunar network, Stage 5 Dyson sphere
- Honor Hall / Archive: models, blueprints, tech, eras, cores, growth history, leaderboards
- Platform adapters for rewarded ads, cloud save, leaderboards — runtime-injected, safe fallbacks
- Fully documented i18n layer (`src/i18n/`), 760+ keys per locale

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| Tests | Vitest (unit) + jsdom/Puppeteer (E2E) |
| Numbers | decimal.js |
| Icons | lucide |
| State/Save | localStorage, versioned schema + validation |
| Platform | TapTap adapters via runtime `tap` object (ads / cloud save / leaderboards) |

## Quick Start

```bash
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run e2e          # browser E2E (full loop: new save → iteration)
npm run typecheck    # TypeScript check
npm run build        # production build → dist/
npm run simulate     # economy simulation (8 strategies × 1000 runs)
```

Requires Node.js 20+ and npm. No platform accounts are needed to build or run the core game; TapTap features are optional at runtime.

## Architecture

- `src/app/` — boot, session, command routing, review/dev entrypoints
- `src/core/` — time, big-number utilities
- `src/data/` — product contract content (models, orders, servers, stage 3+)
- `src/economy/` — game rules engine, viewmodel, offline settlement, singularity/stage 4/5
- `src/save/` — storage, schema validation, migration, repository
- `src/ui/` — DOM renderer (no Canvas main UI), final-feel layer
- `src/i18n/` — locale dictionaries and runtime (zh-CN / en-US)
- `src/platform/` — TapTap adapters (ads, cloud save, leaderboards)
- `src/audio/` — BGM controller
- `src/review/` — isolated founder-concentrated review runtime (separate build)
- `scripts/` — simulations, browser verification, release tooling
- `tests/` — unit + E2E suites (383 unit tests at the RC baseline)

## AI Development Workflow

This project is a **case study in AI-agent-driven game development**. The workflow is documented in `docs/ai-development/`:

- `01_OVERVIEW.md` — how AI agents and humans collaborated
- `02_PRODUCT_GOVERNANCE.md` — product contract as source of truth
- `03_AGENT_ROLES.md` — PM / coding / testing / review roles
- `04_DEVELOPMENT_WORKFLOW.md` — one task, one owner, one acceptance standard
- `05_EVIDENCE_DRIVEN_QA.md` — why "tests pass" ≠ "player experience passes"
- `07_CODEX_WORKFLOW.md` — how Codex was used (audit, repair, tests, docs)
- `AI_GAME_STUDIO_PRINCIPLES.md` — reusable principles for AI-assisted studios

**Division of labor:** AI agents implement code, write tests, run economic simulations, do deterministic QA, and prepare releases. Humans own product direction, gameplay judgment, and the final experience gate. No claims of "fully autonomous AI" are made — this is a real, evidence-driven collaboration.

## Testing

- **Unit (383 tests):** economy rules, save/migration, offline exactly-once, stage 3–5, platform adapters, i18n acceptance
- **E2E:** full game loop from new save through first technology iteration (jsdom/Puppeteer)
- **Economic simulation:** `npm run simulate` — 8 strategies × 1000 runs, budget/balance checks
- **Review checkpoints:** isolated state-machine checkpoints for human experience reviews
- **Evidence-driven QA:** browser matrices, runtime soaks, save/load round-trips — see `docs/reports/`

## Internationalization

- Dictionaries: `src/i18n/zh-CN.ts`, `src/i18n/en-US.ts` (identical key sets, enforced by tests)
- Runtime: `src/i18n/index.ts` — locale detection, persistence, interpolation, Intl number/percent formatting
- Terminology is frozen in `docs/i18n/TERMINOLOGY.md` (e.g. 算力 = Compute Power, 技术迭代 = Technology Iteration)
- Player-visible strings must never be hardcoded outside `src/i18n/` (see `AGENTS.md`)
- English is natural game English, not a literal translation

## Documentation

- `docs/PRODUCT_CONTRACT.md` — product contract and numeric sources
- `docs/ECONOMY_SIMULATION.md` — simulation methodology and results
- `docs/SAVE_CONTRACT.md` — save / offline / idempotency contract
- `docs/ai-development/` — the AI-agent development case study
- `docs/oss/` — open-source scope, security audit, license audit, release plan
- `docs/platform/` — platform capability audit
- `docs/release/` — release notes and checklists

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and PRs are welcome. Please keep player-facing strings in the i18n dictionaries and respect the product contract (`docs/PRODUCT_CONTRACT.md`) — gameplay/economy changes need design discussion first.

## Security

See [SECURITY.md](SECURITY.md). The repository is released through a sanitized OSS mirror: `store-materials/` (platform store assets) and internal review URLs are excluded. No credentials are committed.

## License

Code: [MIT](LICENSE). Media assets in `public/assets/` (key art, BGM) are project-owned but **not** covered by the code license — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md` for details.

## Roadmap

- [ ] Japanese / Korean / Traditional Chinese locales
- [ ] Community-contributed content hooks
- [ ] Webhook-driven issue/PR triage automation
- [ ] Release automation via GitHub Actions

*Roadmap reflects current intent; items are not commitments.*
