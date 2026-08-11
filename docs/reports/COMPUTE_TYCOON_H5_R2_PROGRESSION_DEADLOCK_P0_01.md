# 《算力大亨》H5 R2 主线死锁 P0 收口报告

> **Historical audit:** 本文记录修复发生时的私有发布门禁；缺陷已收口，当前公开版本状态以 `CHANGELOG.md` 和 GitHub Releases 为准。

```yaml
task_id: COMPUTE_TYCOON_H5_R2_PROGRESSION_DEADLOCK_P0_01
result: READY_FOR_DEVICE_FULL_RUN_REVIEW
product_status: READY_FOR_DEVICE_FULL_RUN_REVIEW
human_review: DEVICE_FULL_RUN_PENDING
release: BLOCKED
priority: P0_CLOSED_LOCALLY
baseline_commit: 0ee4a13a4696dfc232da062383cd1c427cf36f26
```

> 结论边界：本报告证明工程、自动化、构建和本地真实浏览器自然流程通过；不构成 HUMAN、DEVICE 或 RELEASE 通过。

## 一、复现结论

| 案例 | 原始结果 | 根因 | 收口结果 |
|---|---|---|---|
| A：当前正式新档 | R1 后可进入 R2，但运行中的时代工程仍保留启动按钮；重复点击会把工程进度清零，且旧轮工程可在新轮出现 | 当前轮校验、活动工程防重入缺失 | 仅当前轮时代工程可见；活动或待领奖励存在时禁止再次启动；R1→R2→R3 自然通过 |
| B：旧档 iteration=1、singularity 缺失 | 迁移后进入 R2，但没有 `core_1`，R2 时代工程永久不可达 | 迁移只创建空奇点状态，没有回填历史完成事实 | 幂等回填 `core_1`；资金、倍率、模型、迭代次数、revision 均不改变，不补发奖励 |
| C：旧档 iteration=2、singularity 缺失 | 迁移后进入 R3，但没有 `core_1/core_2`，R3 时代工程永久不可达 | 同上 | 幂等回填 `core_1/core_2`；不补发奖励 |

额外阻断一并发现并有界修复：Stage 4 领奖后缺少 Stage 5 入口；Stage 4/5 参数化节点命令没有进入正式命令路由。二者均已增加回归断言。

## 二、修复合同

- 旧档仅根据既有 `technologyIterationCount` 恢复对应历史核心；迭代 3 同时恢复“地外计划已揭示”事实。
- 迁移是幂等事实修复，不改变经济、模型、迭代次数、永久倍率或正式存档结构，不重复发奖。
- R1/R2/R3 时代工程只能在对应轮次出现；运行中和待领奖励阶段禁止重启。
- Stage 4 完成后必须出现“进入戴森算力纪元”；Stage 4/5 节点按钮必须通过正式命令路由生效。
- 新增隔离自然评审入口 `?natural=1`：只从全新档开始，不提供检查点跳转或状态注入；与正式存档隔离。

## 三、验证证据

```yaml
deterministic:
  typecheck: PASS
  unit: 319/319_PASS
  e2e: 1/1_PASS
  production_build: PASS
  review_build: PASS
  sites_review_build: PASS
  git_diff_check: PASS
natural_browser:
  route: "?natural=1&qa=1&speed=240"
  state_injection: false
  checkpoint_jump: false
  wall_seconds: 118.945
  required_milestones: 21/21_PASS
  refresh_boundaries: 11/11_PASS
  close_and_reenter: PASS
  background_pause_resume: PASS
  real_pointer_actions: 12
  console_errors: 0
  page_errors: 0
  resource_404s: 0
  final_iteration_count: 3
  final_permanent_multiplier: 2
  final_state: STAGE5_PERPETUAL_ENDING
```

自然流程证据文件：`evidence/review/p0-natural-endgame.json`。

真实点击覆盖：三枚核心领取、三次迭代/地外揭示、启动地外计划、Stage 4 工程启动与领奖、进入 Stage 5、戴森工程启动与终局领奖。宇宙节点批量建设使用同一页面任务内同步点击，以避免 240× 下节点在可负担瞬间替换；它不替代 R2/R3 门禁按钮的真实指针证据。

## 四、文档与范围

- `docs/PRODUCT_CONTRACT.md` 已同步三轮地球迭代、固定架构解锁、60 秒投产红利、Stage 4/5、旧档历史回填和自然评审入口。
- 未加入广告、排行榜、新模型、新阶段、广泛 UI 重做或经济重构。
- Lua 工程、商店、正式发布和正式存档均未触碰。

## 五、后续唯一产品动作

在私密评审站使用真实设备完成一轮从全新档到 Stage 5 的集中体验。若出现新的主线阻断，回到 `ONE_REWORK_REQUIRED`；否则再单独裁决 HUMAN/DEVICE 状态。任何正式发布仍保持阻断。

```yaml
explicit_nonclaims:
  - NOT_HUMAN_PASS
  - NOT_DEVICE_PASS
  - NOT_RELEASE_CANDIDATE
  - NOT_FORMAL_RELEASE
```
