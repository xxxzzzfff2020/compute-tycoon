# H5 终局收敛 · Phase 0/1 版本冻结与整合前收口

```yaml
task_id: COMPUTE_TYCOON_H5_ENDGAME_CONVERGENCE_01
date: 2026-08-07
author: Technical PM
status: PHASE0_1_COMPLETE
authority: 人工负责人/项目 GPT 裁决已确认（倍率 ×2.0；批准整合前收口与实施）
no_build_no_deploy: true
```

## Phase 0 版本冻结

- **基线 commit**：`41d873073d3c2b64752e284e946a42ab3fcc0709`（2026-08-03 14:20 +0800，main）
- **Tag**：`compute-tycoon-h5-endgame-convergence-baseline-20260807`（annotated，指向上述 commit）
- **工作区**：46 项 dirty（18 tracked 修改 + 28 untracked，含 CARD-01..06 实验批与终局文档）；未提交批保留，不删除、不覆盖
- **存档 schema**：v3（`SAVE_SCHEMA_VERSION=3`，`MAX_SUPPORTED_SCHEMA_VERSION=3`）
- **测试基线（本会话实测 2026-08-07）**：unit 311/311 PASS（23 files）、e2e 1/1 PASS、`tsc --noEmit` PASS
- **Build 状态**：production/review build 上次证据 2026-08-01；当前工作区（含终局批）**未 Build（NOT_RUN）**——工单未授权 Build
- **证据层**：`stage1/2/3 PASS`（历史 DOCUMENTED/TEST/WEB_PREVIEW 证据 2026-08-01 基线）、`endgame developing`（CARD-00..06 隔离实现 + 本会话 TEST 通过；未 Build/部署/发布）

## Phase 1 整合前收口结论

### 1. 隔离边界核验（PASS）

| 检查项 | 结论 | 证据 |
|---|---|---|
| 正式档命名空间 | `compute_tycoon_h5_mvp_v1`，不受终局影响 | `src/save/types.ts:4` |
| 终局隔离命名空间 | `compute_tycoon_h5_endgame_review_v1`，仅 `?endgame=1` 入口播种 | `src/save/types.ts:6`、`src/app/main.ts:50,61,77-90` |
| Review v2 检查点 | `compute_tycoon_h5_review_v2:<id>`，与终局互斥 | `src/review/checkpoints.ts:34,148` |
| 终局检查点 A–M | `compute_tycoon_h5_endgame_review_v1:<id>`，与正式/Review v2 互斥 | `src/review/endgame-checkpoints.ts:17,46` |
| Schema 门禁 | 正式档/损坏字段 `singularity` 一律归一为 `null`；仅 `mode==="endgame"` 透传 | `src/save/validate.ts:325-327,439-445,507` |
| 正式引擎行为 | 正式档仍收敛为最多 1 次迭代/永久 ×2（旧 Review v2 检查点依赖） | `src/save/validate.ts:440-444` |
| 播种逻辑 | `?endgame=1` 首次播种 `mode:"endgame"`，刷新续档；不触碰正式档 | `src/app/main.ts:77-90` |

**结论：隔离声明成立。** 测试断言覆盖命名空间互斥（`review_build.test.ts`、`endgame_review_checkpoints.test.ts`）。

### 2. 实验 Schema 并入正式 v3 的迁移影响评估

- `singularity` 为**可选字段**（`SingularityState | null`），`freshSaveData` 默认 `null`；旧档缺字段归一为 `null`，**向后兼容，无需强制迁移**。
- schema 版本**保持 3**，不升 `MAX_SUPPORTED_SCHEMA_VERSION`；未来写锁语义不变。
- 正式 v3 已有档：0 次迭代 → R1 起点；1 次迭代×2 → 按 R2 起点继续（×2.0 与裁决一致，无削弱）；不存在 ×2.5 正式档。
- CARD-00 旧档迁移候选（M1–M4）仅模拟、**不实施降级**。
- 唯一风险点：正式接入时 `validate.ts` 的「正式档收敛 ×2」分支需改为「终局模式放行 ≤3 次/×2.0」；当前已按 `endgameMode` 分支隔离，改动面小。

### 3. 唯一写入者与回滚基线

- 当前会话 Orca 无活动 team/worker（`worker_count:0`）；本批 P2 将创建**唯一 Code Worker** 执行全部写入，Technical PM 不直接写代码。
- 回滚基线：`41d8730` + 新 Tag；工作区未提交批保留；不使用 `reset --hard`/force checkout；diff 可完整回滚。

### 4. 收口结论

- 隔离声明**成立**；迁移影响**可控且向后兼容**；唯一写入者待 P2 建立；回滚基线已冻结。
- **倍率裁决**：`SINGULARITY_MULTIPLIERS` 当前 `[1.5, 2.0, 2.5]`（实验），P2 必须改为 `[1.5, 2.0, 2.0]`（第三次迭代 ×2.0），并同步测试断言与终局文档表述（`docs/PRODUCT_CONTRACT.md` 冻结项由 Product PM 同步，Technical PM 不改）。

## 下一步

P2 按任务单实施（拆唯一 Code Worker，任务卡见 `.planning/h5-endgame-convergence-20260807/`）；本阶段不 Build/部署/发布。
