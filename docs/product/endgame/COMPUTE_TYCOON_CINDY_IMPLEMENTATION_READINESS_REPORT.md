# 《算力大亨》终局实施就绪报告（CARD-00 PASS；CARD-01..06 隔离实现完成）

```yaml
task_id: COMPUTE-TYCOON-H5-ENDGAME-DESIGN-09
rework_revision: 6
date: 2026-08-06
status: CARD_00_PASS + CARD_06_IMPLEMENTED（隔离实现完成；等待集中真人复核）
runtime_implementation_started: true
new_content_data_created: true
release_commitment: false
review_baseline: version_8
review_candidate_commit: 41d873073d3c2b64752e284e946a42ab3fcc0709
pm_direction: ACCEPTED_STRATEGY_ONLY
implementation_authorized: true
open_owner_decisions: []
remaining_conflicts: []
product_definition_ready: true
card_00_authorized: true
card_01_authorized: true
card_02_authorized: true
card_03_authorized: true
card_04_authorized: true
card_05_authorized: true
card_06_authorized: true
```

## 返修结论

四份文档已完成最终补丁，统一唯一时序、删除全部开放决策与提问、冻结六项产品决策。推荐迭代次数为 **3 次地球迭代**（加法式倍率 1.5/2.0/2.5，避免旧无限几何倍率造成周目坍塌）。

**CARD-00 已执行并 PASS（终局证据返修完成）**：8 策略 × 1000 局全部通过合同门（standard R1=87min、R2=57:34/66%、R3=48:55/85%、R3 高潮门 45:41=R2 的 85%、压缩 ≤40%、S4=93min、S5=155min、S4 门 9min）；1×/32× 终版复验三里程碑 × 三帧序列全部 `reached:true` 且差 ≤1%（最大 0.38%）；离线双层证据（CURRENT_ENGINE_BASELINE + ENDGAME_CANDIDATE_MODEL）全通过、A 表 PROVISIONAL；日历离散会话调度（每日1次≈5.0 天、每日2次≈4.5 天）；旧档迁移仅模拟不降级。

**CARD-01 已隔离实现（2026-08-06）**：三次迭代上限 + 加法式倍率 1.5/2.0/2.5 + 奇点核心 n/3（手动领取、exactly-once、顺序唯一）+ R2/R3 时代工程（全球算力骨干环/行星算力统一场）+ 核心奖励（批量购买已验证项目/早期流程压缩/地外算力计划揭示）+ `?endgame=1` 隔离命名空间入口。未修改正式 v3 与 Review v2 检查点 A-N；未 Build/部署/发布。验证：257 单测 + 1 E2E 回归 + typecheck 全通过。

**CARD-02 已隔离实现（2026-08-06）**：地外算力计划惊喜事件（揭示后自动弹出一次、可关闭、档案馆重开、仅手动启动）+ 独立 Stage 4 地月算力网（`src/economy/stage4.ts`：进入里程碑授予首节点、顺序自费节点、地月一体化算力网唯一最终工程、exactly-once 手动领取）+ 身份/配色/阵列跃迁（`stage=4` 地月算力运营商、深空粒子背景、全屏 CSS 揭示卡）+ 离线 A 表 6h/75%（只推工程，不自动购节点/领奖/迭代/进阶段）。全部走 `compute_tycoon_h5_endgame_review_v1`；正式 v3 与 Review v2 检查点 A-N 未受影响；未 Build/部署/发布。验证：275 单测（含 stage4 13 项 + CARD-02 渲染契约 6 项）+ 1 E2E 回归 + typecheck 全通过。CARD-03..06 未授权。

**CARD-03 已隔离实现（2026-08-06）**：戴森算力纪元 Stage 5（`src/economy/stage5.ts`：进入里程碑授予首节点、顺序自费恒星节点、戴森算力球唯一最终巨构）+ 主线结局（全屏“银河算力大亨”结算卡，只触发一次、可关闭，无“未完待续”文案）+ 永续增长模式（解锁后仅禁技术迭代与游戏内进度型清档/转生；设置中“完整重置存档”保留并二次确认）+ 反馈爽点合同（`stage=5` 身份 + 金色戴森配色/星尘背景 + 恒星收入数量级跃迁 + 节点阵列 + 结算动画）+ 离线 A 表 8h/75%（只推工程，不自动购节点/领奖/清档）。全部走 `compute_tycoon_h5_endgame_review_v1`；正式 v3 与 Review v2 检查点 A-N 未受影响；未 Build/部署/发布。验证：290 单测（含 stage5 12 项 + CARD-03 渲染契约 3 项）+ 1 E2E 回归 + typecheck 全通过。CARD-04..06 未授权。

**CARD-04 已隔离实现（2026-08-06）**：离线回归回执（`OfflineReward` 快照新增 本次离线/上限/研发增量/工程推进；旧报价回填不丢收益）+ 回归结算弹窗固定七项（本次离线 / 有效结算 / 本阶段上限 / 超出未计入 / 获得资金 / 获得研发进度 / 推进工程）+ 同一有效时长驱动资金/研发/工程（A 表 3h/6h/8h，超出不计入）+ exactly-once（20 连刷不重复、日期回拨无负时长/重复区间、领取后锚点刷新）+ 离线禁止清单（不自动购/领核心/迭代/进阶段）。全部走 `compute_tycoon_h5_endgame_review_v1`；正式 v3 与 Review v2 检查点 A-N 未受影响；未 Build/部署/发布。验证：301 单测（含 offline_receipt 10 项 + CARD-04 渲染契约 1 项）+ 1 E2E 回归 + typecheck 全通过。CARD-05..06 未授权。

**CARD-05 已隔离完成（2026-08-06，HOLD）**：排行榜前置设计文档（`COMPUTE_TYCOON_ENDGAME_LEADERBOARD_DESIGN.md`）——仅指标（主榜=历史最高算力；终局榜=银河纪元指数占位，公式不冻结）、云端权威校验前置（服务端重算/签名、版本号校验、异常值过滤）、作弊边界（本地可修改→榜单须云端权威）、数据合同（三组输入+版本化需求）；默认 HOLD，不落新存档字段、不采集行为日志、无 UI。不触碰正式存档与正式 v3。

**CARD-06 已隔离完成（2026-08-06，PASS）**：终局检查点 A–M（`src/review/endgame-checkpoints.ts`，隔离命名空间 `compute_tycoon_h5_endgame_review_v1`；13 项全 schema v3 合法、不变量通过、与正式/Review v2 互斥）+ Review 入口“终局复验检查点”分区 + 集中复验脚本 `scripts/verify-endgame-review.ts`（24 项全 PASS：检查点 13、1×/32× 模拟器收敛步长 + 引擎级真实帧复验、迁移候选 4 型、重复领取 20 连击 exactly-once、离线回拨、永续边界）+ 复验单测 4 项 + 指南 v9 与复验报告。未 Build/部署/发布；未触碰正式 v3、正式存档与 Lua 冻结工程。

## 全文档唯一时序（强制）

```text
R1 时代工程完成 → 手动领取核心 1 → 执行第一次技术迭代 → 进入 R2
R2 时代工程完成 → 手动领取核心 2 → 执行第二次技术迭代 → 进入 R3
R3 时代工程完成 → 手动领取核心 3 → 第三次技术迭代转化为“地外算力计划”揭示（不再执行普通地球清档）→ 玩家确认后进入 Stage 4
```

## 已冻结决策（全项目统一，不再提问）

1. 保留“地球纪档案页”入口（第三次迭代后可回看成长史）
2. 沿用现有 6 模型图鉴承担永久收藏加成
3. 宇宙模型仅作阶段包装，不增加独立抽取、配置或复杂槽位
4. 离线回执合并进回归弹窗（不单独设页）
5. 奇点核心必须手动领取（不自动领取、不挂机领取）
6. Review 检查点扩展为 A–M

## 已落实的 PM 裁决（不再询问）

| 项 | 结论 |
|---|---|
| 奇点核心顺序 | R1→核心1→×1.5；R2→核心2→×2.0；R3→核心3→×2.5→地外计划；顶部只显示“奇点核心 n/3” |
| 地球轮次 | R1 80–100min；R2=R1×65%–85%；R3=R2×65%–85%；单次压缩 ≤40% |
| 倍率表 | A(1.5/2.0/2.5) 首选；A 失败自动回退 B(1.35/1.70/2.00) |
| 离线上限 | A(3h/6h/8h) 首选；B/C 仅模拟对照；CARD-00 冻结 |
| 时代工程名 | R2=全球算力骨干环；R3=行星算力统一场 |
| 里程碑授予 | Stage4/5 进入时授予第一个节点；首次自费升级/第二个节点 8–15 分钟 |
| 隔离命名空间 | CARD-01..04 统一 `compute_tycoon_h5_endgame_review_v1` + 实验 Schema；正式 v3 不变 |
| 旧档迁移 | 不决定正式降级；已有 ×2 不归一为 ×1.5；CARD-00 仅模拟候选 |
| 永续边界 | 仅禁技术迭代与进度型清档/转生；保留“完整重置存档”+二次确认 |
| 1×/32× 一致性 | 比较归一化模拟时间，非墙钟时间 |
| 排行榜 | HOLD；银河纪元指数公式不冻结 |

## 风险与决策清单

| 类别 | 风险 | 处置 |
|---|---|---|
| 节奏 | 后一轮压缩 >40% 或宇宙阶段被 ×2.5 跳过 | CARD-00 模拟门禁；A 失败自动回退表 B；Stage4 数值门 8–15min |
| 留存 | 离线上限过高→回访稀疏；过低→等待感 | A 表 3h/6h/8h 首选；B/C 对照后由 CARD-00 冻结 |
| 作弊 | 本地存档可修改→排行榜失真 | 排行榜 HOLD；云端校验/版本号/异常过滤未就绪不接入 |
| 边界 | 永续模式被误锁死 | 仅禁迭代/进度清档；手动完整重置存档保留并二次确认 |
| 迁移 | 旧永久 ×2 被错误削弱 | 已有 ×2 不归一为 ×1.5；CARD-00 只模拟候选 |
| 体验 | 第三轮高潮不足 | R3 时代工程投入 ≥ R2 的 80%（终局证据：45:41 = 85%）；完成时反馈跃迁 |

## 最终交付 YAML（CARD-00 结果）

```yaml
task: COMPUTE_TYCOON_CARD_00
result: CARD_00_PASS
selected_multiplier_table: [1.0, 1.5, 2.0, 2.5]
selected_offline_cap: { earth: 3h, stage4: 6h, stage5: 8h, status: PROVISIONAL }
simulation_runs: 8 strategies x 1000 runs (A) + 200 (multB) + speed-sync 10 checkpoints (reached:true) + offline dual-layer matrix + calendar 4 discrete-session scenarios + migration candidates
hard_stop_hits: []
numeric_contract_passed: true
nonfunctional_audit_completed: true
product_files_changed:
  - docs/product/endgame/COMPUTE_TYCOON_ENDGAME_NUMERIC_RESULTS.md
  - docs/product/endgame/COMPUTE_TYCOON_ENDGAME_NONFUNCTIONAL_AUDIT.md
  - docs/product/endgame/COMPUTE_TYCOON_ENDGAME_NUMERIC_PLAN.md
  - docs/product/endgame/COMPUTE_TYCOON_ENDGAME_DEVELOPMENT_CARDS.md
  - docs/product/endgame/COMPUTE_TYCOON_CINDY_IMPLEMENTATION_READINESS_REPORT.md
gameplay_files_changed: []
build_calls: 0
hosting_changes: 0
production_changes: 0
card_01_started: false
recommendation: 采纳倍率A与离线上限A(PROVISIONAL)；等待负责人与Product PM复核后授权CARD-01
```

## 产品契约 YAML（保持不变）

```yaml
recommended_iteration_count: 3
recommended_multiplier_table: [1.0, 1.5, 2.0, 2.5]
rare_run_reward:
  name: 奇点核心
  cap: 3
  order: [R1工程→手动领核心1→迭代1→R2, R2工程→手动领核心2→迭代2→R3, R3工程→手动领核心3→迭代3转化为地外算力计划揭示→Stage4]
  display: "奇点核心 n/3"（当前动态值，不显示全序列）
  manual_claim: true（不自动领取、不挂机领取）
  exactly_once: true
cosmic_stage_4:
  name: 地月算力网
  identity: 地月算力运营商
  actions: [研发宇宙模型, 购买轨道算力节点, 推进地月超级工程]
  milestone_first_node: true（进入时授予，不扣资金）
  numeric_gate: 首次自费升级或第二个节点 8–15 分钟
  final_project: 地月一体化算力网
  target_minutes: 90-150
cosmic_stage_5:
  name: 戴森算力纪元
  identity: 银河算力大亨
  actions: [研发模型, 购买恒星计算节点, 推进巨构工程]
  milestone_first_node: true（进入时授予，不扣资金）
  final_project: 戴森算力球
  target_minutes: 120-240
  perpetual_mode:
    forbids: [技术迭代, 游戏内进度型清档/转生]
    keeps: 设置中的“完整重置存档”（二次确认）
offline_cap: { earth: 3h, stage4: 6h, stage5_perpetual: 8h }（A 首选，B/C 对照，CARD-00 冻结）
leaderboard_status: HOLD（银河纪元指数公式不冻结）
top_risks:
  - 宇宙阶段被永久倍率瞬间跳过
  - 第三轮高潮不足或压缩超过40%
  - 离线收益无限膨胀
  - 本地存档作弊影响排行榜
  - 旧档迁移被误降级
open_owner_decisions: []
product_definition_ready: true
implementation_authorized: false
actions:
  code_changes: 0
  git_writes: 0
  build_calls: 0
  hosting_changes: 0
  production_save_changes: 0
  workers_created: 0
```

## 文档索引（本轮最终补丁，仅文档）

- docs/product/endgame/COMPUTE_TYCOON_ENDGAME_PRODUCT_DEFINITION.md
- docs/product/endgame/COMPUTE_TYCOON_ENDGAME_NUMERIC_PLAN.md
- docs/product/endgame/COMPUTE_TYCOON_ENDGAME_DEVELOPMENT_CARDS.md
- docs/product/endgame/COMPUTE_TYCOON_CINDY_IMPLEMENTATION_READINESS_REPORT.md
- .planning/endgame-design-09/（task_plan.md / findings.md / progress.md）

## 下一步

等待 Product PM 重新审阅。仅在明确回复“批准实施 CARD-00”（或指定某张 CARD）后进入开发；本报告不构成任何实施授权。
