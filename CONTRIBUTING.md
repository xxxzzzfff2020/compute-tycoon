# Contributing to Compute Tycoon

Thanks for your interest! This project is both a game and an AI-agent-driven development case study. Two rules keep it healthy:

1. **The product contract is the source of truth.** Gameplay, economy numbers, and progression are governed by `docs/PRODUCT_CONTRACT.md`. Coding agents and contributors must not silently change them.
2. **Player-visible strings live only in `src/i18n/`.** Never hardcode a player-facing string outside the locale dictionaries.

## How to report an issue

- **Bug:** include the browser/device, a repro step, and the expected vs actual behavior.
- **Balance/gameplay:** describe the stage and numbers you observed; gameplay changes need design discussion first.
- **Security:** do NOT open a public issue. Email/notify per [SECURITY.md](SECURITY.md).

## How to submit a PR

1. Fork and create a feature branch.
2. Make focused changes; keep the diff minimal.
3. Add or update tests (unit tests live in `tests/unit/`; E2E in `tests/e2e/`).
4. Run locally:
   ```bash
   npm install
   npm run typecheck
   npm test
   npm run build
   ```
5. For player-facing text: add keys to **both** `src/i18n/zh-CN.ts` and `src/i18n/en-US.ts`.
6. Open a PR with a clear description and reference the issue if any.

## Adding a language

1. Add a `Locale` value to `SUPPORTED_LOCALES` in `src/i18n/index.ts`.
2. Create `src/i18n/<locale>.ts` exporting a `Dict` with **all** keys matching `zh-CN.ts`.
3. Run `npm test` — the i18n acceptance suite enforces identical key sets.
4. Update `docs/i18n/TERMINOLOGY.md` and this README's locale list.

## Changing economy/gameplay logic

- Start from the product contract. If the change alters numbers or progression, open a design discussion first (issue label: `design`).
- Keep offline exactly-once semantics and save-schema compatibility intact (`docs/SAVE_CONTRACT.md`).
- Run `npm run simulate` to check balance across strategies.

## Code style

- TypeScript, no major UI framework, DOM-first rendering.
- Keep the renderer read-only over the viewmodel; commands go through the session command router.
- Comments may stay in Chinese (project convention), but player-visible strings must be i18n keys.
