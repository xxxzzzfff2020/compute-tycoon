# H5 终局正式整合 · 实施报告

> **Historical audit:** 本文记录 2026-08-07 终局整合时的私有门禁；当前公开版本以 `CHANGELOG.md` 和 GitHub Releases 为准。

```yaml
task_id: COMPUTE_TYCOON_H5_ENDGAME_FORMAL_INTEGRATION_01
date: 2026-08-07
author: Technical PM（本人直接执行；禁 orca/再分发已遵守）
status: INTEGRATED_TEST_BUILD_PASS
commit: 4d65ad7
tag: compute-tycoon-h5-endgame-integration-20260807
baseline_tag: compute-tycoon-h5-endgame-convergence-baseline-20260807（41d8730）
build: PASS（npm run build + build:review）
deploy_review_site: WEB_PREVIEW 待部署（构建产物就绪）
release: NOT_RELEASE_CANDIDATE（发布/商店提交仍禁止）
```

## changed

- `src/app/main.ts`：正式入口接线——正式新档直接开启终局（`fresh + ensureEndgameSingularity`）；旧正式档迁移 A（`singularity` 缺失/为 null 时初始化空终局状态，幂等、不丢数据）；`?endgame=1` 保留 QA 隔离入口；Review v2 / dev 隔离入口不经过迁移分支。
- `src/economy/singularity.ts`：新增 `ensureEndgameSingularity`（迁移 A 纯函数，幂等）；`SINGULARITY_MULTIPLIERS=[1.5,2.0,2.0]`。
- `src/economy/stage4.ts`：太空冷却动机叙事、首节点里程碑授予、批量购买已验证节点。
- `src/economy/stage5.ts`：戴森完成 exactly-once 传奇档案快照（完成时间/最大算力/最大收入/达成纪元）。
- `src/economy/viewmodel.ts`、`src/ui/render.ts`：成长历史档案 + 传奇档案 Tab；离线回执标题「回归结算 · 公司在成长」；Stage5 庆典文案。
- `src/save/types.ts`：可选 `legendaryArchive` 字段（schema v3 兼容）。
- `tests/unit/singularity.test.ts`：新增迁移 A 测试（旧档开启终局/幂等/不丢数据/已有终局档不动）。
- 文档：`docs/PRODUCT_CONTRACT.md` 倍率冻结项更新；`README.md` 同步；终局历史文档 ×2.5 引用标注被 ×2.0 取代（PRODUCT_DEFINITION/DEVELOPMENT_CARDS/NUMERIC_PLAN/NUMERIC_RESULTS/PRODUCT_DECISION）。

## implemented

- 正式 v3 迁移（A_向前兼容）：旧正式档 singularity=null 正常载入、直接开启终局、不重复迁移、不丢数据（浏览器冒烟验证：money/saveId/serverCount/revision 全部保留）。
- 正式入口接线（A_自然流程）：正式档（新/旧）均开启终局能力；Stage3 完成后自然进入 3 次迭代；`?endgame=1` 仅作 QA 隔离入口。
- 倍率落地：×1.5 / ×2.0 / ×2.0；R3 揭示地外算力计划不清档。
- R1→R2 首服语义：二轮首服仍由里程碑授予、保留累计收入秒达（与 MVP 合同一致）。
- keep 范围全部并入：CARD-01 三次迭代+核心 1/2/3+时代工程；成长历史+戴森传奇档案；CARD-04 离线七项回执+exactly-once（标题「公司在成长」）；Stage4 太空冷却叙事+首节点授予+批量购买；Stage5 戴森=最终目标+庆典结局；自动经营提前（迭代后阈值 6→3 单）。
- hold 未实现：排行榜/随机事件/无限解锁/服务器部件图鉴/运输燃料/新货币/广告/成就签到。

## validation（本人复跑）

- `npm run test`：23 files / **315 tests PASS**（基线 311 → 315）
- `npm run e2e`：1/1 PASS
- `npm run typecheck`：PASS
- `npm run build`：PASS（JS 173.03 kB / CSS 27.28 kB）
- `npm run build:review`：PASS（review 构建 finalized）
- 浏览器冒烟（vite preview 真实构建）：正式新档 `singularity=endgame` 开启终局；旧档迁移 A 数据保留（money 123456789、saveId legacy-save-1、serverCount 5、revision 5 不变）；Review 首页正常；console 错误 0

## player_experience

- 新玩家首次进入即开启完整成长闭环（工作室 → 地球 3 次迭代 → 地外计划 → 地月 → 戴森 → 传奇档案）。
- 老玩家旧档载入无缝迁移，不丢数据，直接获得终局能力。
- 第三次迭代「揭示地外算力计划」不清档；戴森完成=庆典+传奇档案，无无限解锁承诺。

## unknown / risks

- 未做真人体验（HUMAN_PENDING）、未做真机（DEVICE_NOT_TESTED）
- 评审站点部署（WEB_PREVIEW）产物已就绪，实际部署动作需 MCP 通道/新授权（本卡已授权部署评审站点，但当前会话无 Maker/部署通道，标记为待部署）
- 正式 v3 已迁移（向前兼容），发布仍禁止

## 回传字段

- 正式 v3 迁移是否实施：**是（A_向前兼容）**——旧正式档 singularity=null 正常载入、直接开启终局、不重复迁移、不丢数据
- 正式入口接线方式：**A_自然流程**——正式档（新/旧）均开启终局；Stage3 完成后自然进入 3 次迭代；`?endgame=1` 保留仅作 QA
- 倍率落地值：**×1.5 / ×2.0 / ×2.0**
- Build/部署状态：build + build:review PASS；评审站点产物就绪（WEB_PREVIEW 部署待通道）；发布仍禁止
- 未使用 orca/未分发：**确认**（本人直接完成开发/测试/构建/提交/Tag）
- git commit：`4d65ad7`；tag：`compute-tycoon-h5-endgame-integration-20260807`
