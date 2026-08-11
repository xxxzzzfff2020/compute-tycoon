# 《算力大亨》H5 导入存档仍被阻断 P0 收口报告

> **Historical audit:** 本文记录修复发生时的私有发布门禁；缺陷已收口，当前公开版本状态以 `CHANGELOG.md` 和 GitHub Releases 为准。

```yaml
task_id: COMPUTE_TYCOON_H5_IMPORTED_SAVE_DEADLOCK_P0_02
result: READY_FOR_OWNER_IMPORT_RETEST
product_status: READY_FOR_DEVICE_FULL_RUN_REVIEW
release: BLOCKED
baseline_commit: 9c42e7c8b167dc007160c942f4bca08c7aed8789
```

> 证据边界：本报告证明导入命令、存档迁移、刷新恢复、自动化、构建和本地真实浏览器文件选择通过；负责人原始文件仍需在新版私密站重新导入确认。不是 HUMAN、DEVICE 或 RELEASE 通过。

## 根因

导入发生在应用启动之后。旧实现只在启动时调用终局迁移：

```text
旧存档文件
→ importJson 先按旧正式合同标准化
→ iteration=2 可能被压回 1
→ singularity 仍为 null
→ 直接写盘并替换当前会话
→ UI进入“本版本技术迭代已完成／后续尚未开放”旧终态
```

P0 自然评审入口还有同类刷新风险：导入文件的 `saveId` 与评审种子不同，刷新时会被种子覆盖。

## 修复

- 在解析后的隔离对象上、标准化之前恢复终局历史事实；只有随后校验通过才单次写盘。
- R1/R2/R3 分别恢复核心 1、核心 1/2、核心 1/2/3；R3 同时恢复地外计划已揭示。
- 不改资金、累计收入、模型、永久倍率或迭代次数，不重新发奖、不重新清档。
- JSON、schema、校验或准备失败时，现有内存状态与持久化状态均不覆盖。
- 文件导入与游戏内完整重置统一进入当前终局合同。
- P0 自然评审入口允许合法导入文件保留自身 `saveId`，刷新不再覆盖导入档；“重置当前检查点”仍可明确清除并恢复种子。
- 已在旧版评审站中写盘的导入档会在新版自然入口打开时就地自愈，不要求负责人再次选择同一文件。

## 证据

```yaml
deterministic:
  legacy_R1_import: PASS
  legacy_R2_import: PASS
  legacy_R3_import: PASS
  current_endgame_import_unchanged: PASS
  rejected_import_preserves_current_save: PASS
  in_session_reset_endgame_enabled: PASS
  unit: 327/327_PASS
  e2e: 1/1_PASS
  typecheck: PASS
  production_build: PASS
  review_build: PASS
browser_file_import:
  native_file_chooser: PASS
  restored_cores: [core_1]
  obsolete_terminal_copy_visible: false
  refresh_preserved_imported_save: PASS
  repeated_import_idempotent: PASS
  console_errors: 0
  page_errors: 0
natural_endgame_regression:
  status: PASS
  wall_seconds_at_240x: 119.021
  missing_milestones: 0
  final_iteration_count: 3
  final_permanent_multiplier: 2
```

浏览器导入证据：`evidence/review/p0-import-migration.json`。
自然终局证据：`evidence/review/p0-natural-endgame.json`。

## 非声明

```yaml
explicit_nonclaims:
  - NOT_OWNER_ORIGINAL_FILE_RETEST
  - NOT_HUMAN_PASS
  - NOT_DEVICE_PASS
  - NOT_RELEASE_CANDIDATE
  - NOT_FORMAL_RELEASE
```
