# Compute Tycoon v1.0.0-rc.1

The first public release candidate of Compute Tycoon is both a playable incremental game and a reproducible case study of human-governed, AI-agent-assisted software development.

## Play

- Game: https://xxxzzzfff2020.github.io/compute-tycoon/
- Stage BGM review: https://xxxzzzfff2020.github.io/compute-tycoon/bgm-review.html

## Included

- Complete progression from a personal AI studio to the Dyson Compute Sphere endgame
- `zh-CN` and `en-US` with in-game switching and persisted locale preference
- Versioned local saves, migration validation, and exactly-once offline/reward handling
- Five independently generated stage BGM tracks and original endgame key art
- Public product governance, agent-role, testing, simulation, and failure-analysis documents

## Release Evidence

- TypeScript typecheck: pass
- Unit tests: 383 pass
- End-to-end test: 1 pass
- Production build: pass
- Economy evidence: 8 strategies × 1,000 deterministic runs, 0% first-iteration failure (`docs/ECONOMY_SIMULATION.md`)
- Dependency audit: 0 known vulnerabilities after the `nanoid` security update
- CI: Ubuntu and Windows jobs

## Known Limitations

- TapTap ads, cloud save, and leaderboards require the TapTap runtime and remain disabled or gracefully degraded on GitHub Pages.
- Public locale coverage is limited to Simplified Chinese and English.
- `store-materials/` is intentionally excluded from the public repository.
- Media under `public/assets/` is project-owned but is not licensed under the MIT code license.

## License

Source code is MIT licensed. Media licensing and third-party notices are documented in `THIRD_PARTY_NOTICES.md` and `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md`.
