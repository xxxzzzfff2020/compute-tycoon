# 《算力大亨》终局集中复验报告（CARD-06）

```yaml
task: COMPUTE_TYCOON_CARD_06
status: CARD_06_PASS（24/24 判定项通过；证据包见下）
date: 2026-08-06
isolation: compute_tycoon_h5_endgame_review_v1（终局检查点 + 复验样本全部隔离）
touched: 未触碰正式 v3、正式存档、Review v2 A–N、Lua 冻结工程；未 Build/部署/发布
```

## 1. 终局检查点 A–M（13/13 PASS）

- 文件：`src/review/endgame-checkpoints.ts`
- 覆盖：A 终局新档 R1 起点 / B R1 时代工程前 / C R1 核心 1 可领取 / D R2 起点 / E R2 时代工程前 / F R2 核心 2 可领取 / G R3 起点 / H R3 时代工程前 / I R3 核心 3 可领取 / J 地外揭示 / K Stage 4 中期 / L Stage 5 戴森球冲刺 / M 永续入口。
- 每项：schema v3 合法、`endgameReviewInvariantIssues` 为空、命名空间 `compute_tycoon_h5_endgame_review_v1:<id>` 与正式/Review v2/终局共享命名空间互斥。
- 单元测试：`tests/unit/endgame_review_checkpoints.test.ts`（6 项）。

## 2. 1×/32× 一致性（PASS，差 ≤1%）

- 模拟器时代工程：两速均用同一收敛步长（stepSec=0.01），1× 与 32× 到达 R3 时代工程的 game_seconds 均为 11266.9s，差 0.0000%（归一化 game_seconds，非墙钟）。
- 引擎级真实更新语义：子进程运行 CARD-00 终版 `scripts/_verify_speed_sync.ts`（`session.update(frameDt × speed)`；60Hz/30Hz/抖动+后台大帧 × 自动订单/旗舰/时代工程），全部 `reached:true` 且连续完成时刻差 ≤1%。

## 3. 旧档迁移候选（4/4 PASS，仅模拟不降级）

- M1 新档 0 迭代、M2 已有 ×2 保留、M3 ×2 折算核心等价（×1.5+进度）、M4 异常倍率 ×1.99999 保留+打标。
- 全部在隔离终局样本通过 schema 校验；不决定正式降级；不实施正式迁移。

## 4. 重复领取 exactly-once（3/3 PASS）

- 奇点核心 20 连击 → 领取 1 次；离线回执 20 连刷 → 领取 1 次；旗舰奖励 20 连击 → 领取 1 次。

## 5. 离线回拨（PASS）

- 系统时钟早于上次结算：不产生负时长、不产生重复区间、资金不回退。

## 6. 永续边界（PASS）

- 永续激活后 `canEndgameIterate` 为 false（技术迭代被禁）；游戏内进度型清档/转生被禁；设置中“完整重置存档”保留并二次确认（手动重置入口不受影响）。

## 证据包

- 复验脚本：`scripts/verify-endgame-review.ts`（判定表：24 项全 PASS，最终 `CARD_06_PASS`）。
- 复验单测：`tests/unit/endgame_review_verify.test.ts`（4 项）。
- 检查点单测：`tests/unit/endgame_review_checkpoints.test.ts`（6 项）。
- 指南：`COMPUTE_TYCOON_ENDGAME_CONCENTRATED_REVIEW_GUIDE_V9.md`。
- 全量：311 单测（23 文件）+ 1 E2E + `tsc --noEmit` 全通过。

## 结论

`CARD_06_PASS`：全部硬停止条件未命中；任一检查点失败即回滚对应卡（本轮无失败）。等待负责人与 Product PM 复核后决定是否进入正式整合卡（正式 v3 迁移、Production 入口、榜单接入等均不在本卡范围）。
