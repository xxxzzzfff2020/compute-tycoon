# Third-Party Notices

## Runtime dependencies

| Package | Version | License |
|---|---|---|
| [decimal.js](https://github.com/MikeMcl/decimal.js) | ^10.6.0 | MIT |
| [lucide](https://lucide.dev/) | ^1.30.0 | ISC (icons); see `public/third-party/lucide-LICENSE.txt` |

## Development dependencies

| Package | Version | License |
|---|---|---|
| TypeScript | ^7.0.2 | Apache-2.0 |
| Vite | ^8.2.0 | MIT |
| Vitest | ^4.1.10 | MIT |
| tsx | ^4.23.1 | MIT |
| jsdom | ^29.1.1 | MIT |
| puppeteer-core | ^24.43.1 | Apache-2.0 |

## Media assets

- `public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg` — AI-generated key art, owned by the project. Not covered by the MIT code license; redistribution outside this repository requires separate permission.
- `public/assets/audio/compute-tycoon-stage1-solo-spark-v1.mp3` — AI-generated Stage 1 BGM (instrumental), owned by the project.
- `public/assets/audio/compute-tycoon-stage2-cluster-pulse-v1.mp3` — AI-generated Stage 2 BGM (instrumental), owned by the project.
- `public/assets/audio/compute-tycoon-stage3-compute-citadel-v1.mp3` — AI-generated Stage 3 BGM (instrumental), owned by the project.
- `public/assets/audio/compute-tycoon-stage4-earth-moon-relay-v1.mp3` — AI-generated Stage 4 BGM (instrumental), owned by the project.
- `public/assets/audio/compute-tycoon-stage5-dyson-ascension-v1.mp3` — AI-generated Stage 5 BGM (instrumental), owned by the project.
- `public/official-site/assets/compute-tycoon-icon-1440x1440.jpg` and `public/official-site/assets/compute-tycoon-{promo-16x9-1920x1080,promo-square-1440x1440,cover-horizontal-1840x860,cover-vertical-1440x2160}.jpg` — V1 official promotional artwork, generated for the project and retained as project-owned marketing assets.
- `public/official-site/assets/compute-tycoon-trailer.mp4` — project-supplied official promotional trailer.

The BGM files and official-site media are not covered by the MIT code license; redistribution outside this repository requires separate permission. See `docs/oss/BGM_GENERATION_RECORD.md` for BGM provenance.

See `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md` for the full asset provenance audit.

## Platform integrations

`src/platform/` calls the TapTap runtime `tap` object at runtime. No TapTap SDK code or binaries are included in this repository.
