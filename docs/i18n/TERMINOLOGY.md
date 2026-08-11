# Terminology —《算力大亨》/ Compute Tycoon

This document freezes the product terminology used across the codebase, UI strings, and documentation.
It is the single source of truth for both `zh-CN` and `en-US` dictionaries (`src/i18n/`).

## Core terms

| Chinese | English (product) | Internal field / i18n key prefix | Explanation |
|---|---|---|---|
| 算力大亨 | Compute Tycoon | `app.title` | Game title. |
| 算力 | Compute Power | `app.compute`, `feel.computeLabel.total` | The core resource; displayed as "Compute" in the HUD. |
| 总算力 | Total Compute | `computeLabel` | Aggregate compute across servers/nodes. |
| 模型蓝图 | Model Blueprint | `model.*`, `archive.category.models` | Collected model archetypes that persist across iterations. |
| 服务器集群 | Server Cluster | `server.*`, `civilization.stage2` | The 8-server mid-game stage. |
| 算力中心 | Compute Center | `center.*`, `stage3.*`, `civilization.stage3` | Stage-3 facility with machine rooms and flagship projects. |
| 机房 | Machine Room | `room.*`, `era.room*.name` | Commissionable rooms inside the Compute Center. |
| 旗舰工程 | Flagship Project | `flagship.*`, `stage3.*` | Stage-3 era-defining projects. |
| 技术迭代 | Technology Iteration | `prestige.*`, `archive.iterationLabel` | Prestige mechanic; keeps blueprints/permanent multipliers, resets the round. |
| 奇点核心 | Singularity Core | `singularity.*`, `core.*` | Collectible core per round (3 total) that drives the endgame reveal. |
| 地外算力计划 | Off-world Compute Plan | `spacePlan.*`, `spaceReveal.*` | The narrative trigger after collecting all 3 cores. |
| 地月算力网 | Earth-Moon Compute Network | `stage4.*` | Stage 4: lunar node deployment and the final Earth-Moon project. |
| 戴森算力球 | Dyson Compute Sphere | `stage5.*` | The final megastructure and ultimate goal. |
| 银河算力大亨 | Galactic Compute Tycoon | `civilization.dyson`, `stage5.identity` | Endgame identity after the Dyson sphere is complete. |
| 离线收益 / 离线回执 | Offline progression / Offline receipt | `offline.*` | Exactly-once offline settlement receipt shown on return. |
| 自动经营 | Automation | `order.automation*`, `action.enableAutomation` | Automated order processing unlocked via orders. |
| 荣誉馆 / 档案馆 | Honor Hall / Archive | `archive.*`, `hall.*` | Collection/record UI (models, blueprints, eras, cores, legendaries, leaderboards). |

## Formatting conventions

| Concept | zh-CN | en-US |
|---|---|---|
| Currency | `¥` prefix | `$` prefix |
| Large numbers | 万 / 亿 / 兆 / 京 | K / M / B / T |
| Per-second | `/秒` | `/s` |
| Section numbering | ① ② ③ ④ (decoration) | ① ② ③ ④ (kept as cross-language decoration) |
| Colon between label and value | `：` | `: ` (`common.colon`) |
| Duration | `X小时Y分钟` | `Xh Ym` |

## Rules for contributors

1. Never hardcode a player-visible string outside `src/i18n/` (see `AGENTS.md`).
2. Add new keys to **both** `zh-CN.ts` and `en-US.ts` with identical key names.
3. English must read as natural game English, not a literal translation.
4. Dynamic values use `{placeholder}` interpolation; per-key params go through `t(key, params)`.
5. Debug/review-only strings (e.g. `src/review/`, `DEV_VERIFY_STATES`) may stay Chinese but must not surface in the player UI.
6. When adding a locale, extend `SUPPORTED_LOCALES` in `src/i18n/index.ts` and both dictionaries.
