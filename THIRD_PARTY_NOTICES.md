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
- `public/assets/audio/compute-tycoon-stellar-tide-v1.mp3` — AI-generated BGM (instrumental), owned by the project. Not covered by the MIT code license; redistribution outside this repository requires separate permission.

See `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md` for the full asset provenance audit.

## Platform integrations

`src/platform/` calls the TapTap runtime `tap` object at runtime. No TapTap SDK code or binaries are included in this repository.
