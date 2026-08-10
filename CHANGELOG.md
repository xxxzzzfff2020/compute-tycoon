# Changelog

All notable changes are documented here. The project follows a `vMAJOR.MINOR.PATCH[-rc.N]` scheme.

## [1.0.0-rc.1] - 2026-08-10

Internationalization and open-source release candidate.

### Added

- Full i18n layer (`src/i18n/`): `zh-CN` (default) + `en-US`, in-game language switcher, locale persistence independent of the save schema, Intl-based number/percent formatting, pluralization hook.
- `docs/i18n/TERMINOLOGY.md` freezing product terminology.
- i18n acceptance tests (identical key sets, no raw-key rendering, en-US rendering, save-schema immutability).
- Open-source governance docs: `docs/oss/SECURITY_AND_SECRET_AUDIT.md`, `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md`, `docs/oss/OSS_SCOPE_AND_SANITIZATION.md`, `docs/oss/RELEASE_AND_MAINTENANCE_PLAN.md`.
- AI-development case study docs under `docs/ai-development/`.

### Changed

- Player-visible strings extracted from `src/ui/`, `src/economy/`, `src/platform/`, `src/save/`, `src/app/` into locale dictionaries.
- Room names and seeds now store i18n keys instead of hardcoded Chinese.
- `README.md` rewritten in English; `README.zh-CN.md` added.

### Security

- Sanitized the OSS mirror: removed local absolute paths, private review URLs, and platform account identifiers from public docs; excluded `store-materials/`.

### Known limitations (RC)

- `store-materials/` (TapTap store assets) is intentionally excluded from the public repo.
- TapTap ads/cloud-save/leaderboards require the TapTap runtime; they degrade gracefully elsewhere.
- Locale coverage: `zh-CN` + `en-US` only.

## Before 1.0.0-rc.1

The project was developed privately as an H5 rebuild of the Lua golden contract (`4a661c8`). See `docs/reports/` and `docs/ai-development/` for the development history and evidence.
