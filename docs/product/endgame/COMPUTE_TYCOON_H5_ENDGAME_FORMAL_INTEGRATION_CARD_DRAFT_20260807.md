# H5 终局正式整合卡（草案，待总控/人工裁决）

```yaml
task_id: COMPUTE_TYCOON_H5_ENDGAME_FORMAL_INTEGRATION_01
status: APPROVED（总控/人工按推荐采纳全部裁决，2026-08-07）
owner:
  Product_PM: 产品合同更新 + 范围守门
  Technical_PM: 工程整合实施（本人执行，禁 orca/再分发）
prerequisite:
  - COMPUTE_TYCOON_H5_ENDGAME_CONVERGENCE_01 P2 产品复核通过（ACCEPT_STAGE）
  - 三项裁决已确认：第三次迭代倍率 ×2.0；批准整合前收口；执行方式=本人直改禁分发
baseline: compute-tycoon-h5-endgame-convergence-baseline-20260807（HEAD 41d8730 + 工作区未提交终局批）
```

## 一、目标

把当前"隔离终局实验批"正式接入正式版本，形成完整成长闭环：
`个人工作室 → AI 公司 → 全球算力中心 → 地球算力文明（3 次迭代/核心 n/3）→ 地月算力网（Stage4）→ 戴森算力球（Stage5 最终目标）→ 传奇档案`。
本卡不引入任何新系统、不改 Stage1~3 核心循环。

## 二、前置（必须先完成）

1. 对 P2 工作区未提交批执行收口提交：确认唯一写入者、形成可回滚基线（baseline Tag 已建，指向 41d8730）。
2. 澄清并确认 R1→R2 首服语义（二轮首服仍由里程碑授予、保留累计收入秒达，与 MVP 合同一致；排除"资金扣减买首服"歧义）。
3. 人工/总控确认：正式 v3 迁移方案与正式档开启终局的范围（见 §四）。

## 三、正式接入范围

### keep（直接并入正式版）
- CARD-01 三次地球迭代 + 奇点核心 1/2/3 + 时代工程（R1/R2/R3）
- 永久成长倍率：核心1 ×1.5 → 核心2 ×2.0 → 核心3 ×2.0（裁决值）
- 成长历史档案（模型历史/技术迭代历史/奇点核心/文明阶段/银河纪元）+ 戴森传奇档案（完成时间/最大算力/最大收入/达成纪元）
- CARD-04 离线七项回执 + exactly-once；标题「回归结算 · 公司在成长」
- Stage4 太空冷却动机叙事 + 首节点里程碑授予 + 批量购买已验证节点（去重复购买）
- Stage5 戴森算力球 = 最终目标 + 庆典结局（非功能门、不承诺无限解锁）
- 自动经营提前（迭代后阈值 6→3 单生效）

### modify（随本卡完成）
- 正式产品合同更新：`docs/PRODUCT_CONTRACT.md` 冻结项「当前只实现一次迭代、永久倍率 ×2」→「三次迭代上限；核心3/第三次迭代倍率 ×2.0」；同步 README 核心命令/文档索引。
- 终局历史文档一致化：将 `PRODUCT_DECISION/NUMERIC_RESULTS/DEVELOPMENT_CARDS/PRODUCT_DEFINITION` 中 ×2.5 引用更新/标注为已被裁决 ×2.0 取代（避免后续误用）。
- 正式 v3 迁移整合：确认实验 Schema（singularity/stage4/stage5/legendaryArchive）并入正式档的迁移路径与兼容策略（正式档 singularity=null 旧档可正常载入、不重复迁移、不丢数据）。
- 正式入口接线：终局从 `?endgame=1` 隔离入口转为正式 Stage 3→3 次迭代自然流程（若总控确认），同时保留隔离评审入口仅作 QA。

### hold（不实现）
- 排行榜、随机事件、无限解锁、服务器/部件/硬件图鉴、运输/燃料/供应链、新货币、广告、成就签到。

## 四、需总控/人工裁决的开放项

1. 正式档开启终局的方式：`A. 自然流程`（Stage 3 完成后进入 3 次迭代，推荐）或 `B. 保留 ?endgame=1 隔离入口`（仅 QA）。
2. 正式 v3 迁移策略：旧正式档（singularity=null）如何处理——A. 直接开启终局能力（推荐，向前兼容）；B. 保留旧档单次迭代行为（不迁移）。
3. 是否授权 Build/部署/发布预览：本卡需 `npm run build` + `build:review` + 部署到评审站点（需新授权；发布仍禁止）。

## 五、执行边界（Technical PM 任务卡）

- 本人直接实施，禁 orca/worker/subagent 再分发。
- 不改变 Stage1~3 经济曲线；不新增复杂资源/部件/运输/燃料；不接排行榜/随机事件；不将 CARD-02/03 原设计直接搬入。
- 倍率落地 ×1.5/×2.0/×2.0；R3 揭示不清档、只进入地外算力计划。
- 测试全量回归（unit/e2e/typecheck）；Build 仅在授权后执行。
- 回传格式沿用任务单第十节（changed/implemented/validation/player_experience/unknown/git/tag）。

## 六、产品验收门（Product PM 复核）

- 玩家完成第一次迭代后「进入新时代」而非「重新开始」；第三次迭代「揭示地外算力计划」不清档。
- Stage4 进入有明显「新游戏阶段」感（身份/视觉/数字跃迁），无「服务器扩张2.0」感。
- 戴森完成=庆典+传奇档案，无无限解锁承诺。
- 离线回归强化「公司在成长」；正式档迁移 exactly-once、不丢档。
- 正式产品合同与 README 已同步更新；历史文档 ×2.5 引用已清理。

## 七、本卡边界

- 本卡为草案，未授权任何代码/Build/部署/发布；需总控/人工负责人对 §二、§四 明确裁决后生效。
- 生效后由 Technical PM 本人实施，完成后交 Product PM 复核。

## 八、批准记录（2026-08-07 总控/人工裁决）

```yaml
approved: true
decisions:
  - 正式档开启终局方式: A_自然流程（Stage3 完成后自然进入 3 次迭代；保留 ?endgame=1 仅作 QA 隔离入口）
  - 正式 v3 迁移策略: A_向前兼容（旧正式档 singularity=null 正常载入、直接开启终局能力、不重复迁移、不丢数据）
  - Build/部署: 授权 npm run build + build:review + 部署评审站点（WEB_PREVIEW）；发布/商店提交仍禁止
  - R1→R2 首服语义: 确认=二轮首服仍由里程碑授予、保留累计收入秒达（与 MVP 合同一致）
execution: 由 Technical PM 本人实施（禁 orca/再分发），完成后交 Product PM 复核
```
