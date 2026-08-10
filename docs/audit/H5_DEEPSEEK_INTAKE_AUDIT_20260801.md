# H5 DeepSeek 接收审计｜2026-08-01

> 历史审计快照：其开放产品问题已由 `docs/product/H5_CONTRACT_RECONCILIATION_01.md` 正式协调；本文件只保留当时证据，不是当前任务入口。

## 结论

```yaml
task: ComputeTycoon-CODEX-LUA-FREEZE-AND-H5-INTAKE-20260801
candidate: H5_REVIEW_CANDIDATE
acceptance: ONE_REWORK_REQUIRED
engineering_flow: PASS_AFTER_ONE_BOUNDED_REPAIR
product_contract: NOT_ACCEPTED
release: NOT_RELEASE_CANDIDATE
```

DeepSeek 的 Stage 1–3、第一次技术迭代和二周目主链是真实实现，不是页面桩；Codex 在隔离分支完成一次有界确定性修复后，自动化门禁与 production 浏览器闭环均通过。仍不能进入集中真人评审基线：模型只有 4 个而合同要求 6–8 个，一周目复算超出最新节奏目标，旧算力中心和存储作用尚未由产品权威冻结。

## 基线真值

```yaml
source_repository: /Users/xxxzzzfff2002/code/TaptapMaker/TaptapMaker/H5算力大亨H5
source_branch: main
deepseek_final_commit: f6bd80d8b7d982598f29d901ad7e8fff55b8674c
source_workspace_modified_by_codex: false
audit_worktree: /Users/xxxzzzfff2002/code/TaptapMaker/STUDIO_CONTROL/04_LOCAL_OPERATIONS/PM_RUNTIME/compute_tycoon/h5_intake_20260801/worktree
audit_branch: codex/h5-intake-audit-20260801
origin_main: NOT_CONFIGURED
node: 25.8.0
npm: 11.11.0
typescript: 7.0.2
vite: 8.2.0
vitest: 4.1.10
e2e: Vitest + jsdom
build_output: dist/
production_runtime: static_browser_h5
formal_save_namespace: compute_tycoon_h5_mvp_v1
qa_save_namespace: compute_tycoon_h5_dev_v1
save_schema: 2
```

`base: "./"` 的 production `dist` 可由普通静态 HTTP 服务运行。生产 `src/` 未引用 Express、`fs`、`path`、`child_process` 或 `node:*` 运行时模块，也没有本地绝对路径/开发服务 API 依赖。

## 独立基线审计发现

DeepSeek 原提交在 Node 25 下为 unit 139/142；3 个 boot 生命周期测试因宿主暴露非标准 `localStorage` 而失败。静态与运行审计另确认：

- 模型档案只有单一当前模型数据；二轮重新获得首模型会覆盖永久收藏；重复研发升级对象错误。
- 3 服和 8 服蓝图没有分别消费，Stage 2 选择 UI 被提前返回遮蔽。
- 离线不推进模型研发/旗舰工程；首服算力多计 1；迭代 buy-max 和科技档案被动只有文案。
- 未来 schema 仍可能被后续自动保存覆盖；正式写失败被吞掉，命令无法可靠回滚。
- 导入导出按钮未接正式命令；QA `speed` 可在无合法检查点时影响正式档；检查点数值与文案不一致。
- 多处玩家反馈不等于真实公式：订单汇总、训练预估、瓶颈推荐、首服进度、旗舰卡片映射、机房前置、服务器按钮状态。
- DeepSeek 的“完整浏览器验证”实际是 Vite 开发地址上的局部 Stage 2 观察，不覆盖 production 闭环。

## 唯一有界修复包

| 范围 | 修复结果 |
|---|---|
| 存档 | schema v2、深层迁移、永久模型档案、蓝图里程碑、未来 schema 会话写锁、写失败感知与事务回滚 |
| 模型 | 现有 4 模型全部显示；收藏/等级/研发/训练/贡献永久记录；重复研发升级正确模型；迭代后重获不覆盖 |
| 蓝图 | 3 服与 8 服各一次三选一；收藏/等级永久保留；每轮只激活一项 |
| 离线 | 推进资金报价、模型研发和进行中的旗舰；继续禁止自动购买/选择/投产/领奖/结算/迭代 |
| 迭代 | 永久 ×2、3 单自动化、研发 +25%、科技档案被动和服务器 buy-max 全部进入真实命令/公式 |
| Stage 1/2 | 首服替换占位功率，8 服 329；手动订单领奖、首服进度、三档汇总、动态购服按钮和蓝图 UI 修复 |
| Stage 3 | 真实瓶颈差值、机房前置、旗舰映射/完成态、QA 90% 检查点、8 真实+8 锁定纪元修复 |
| UI/QA | 未解锁区折叠、档案卡节点稳定、导入导出接线、合法 QA 才可加速、同检查点刷新恢复 |
| 模拟/测试 | 模拟器真实消费蓝图并输出失败率/模型/训练/订单占比；新增确定性缺陷与稳定性覆盖 |

没有增加第二/第三次迭代、无尽、广告、排行、云、新货币、新模型、新蓝图、新资产或大型 UI 框架。

## 功能矩阵

| 区域 | 状态 | 证据/边界 |
|---|---|---|
| Stage 1 | PASS | 首模型、手动订单、自动经营、经验/等级/累计收入、Lv6+累计收入首服、免费且 exactly-once |
| Stage 2 | PASS | 第2–8服资金购买、1/3/5/8里程碑、三档表现、长期订单非零、免费研发、8服结算 |
| Stage 3 | CONDITIONAL_PASS | 8服+结算后进入、四基础设施、机房2/3、25秒×4、三旗舰、离线推进；旧中心/存储语义待裁决 |
| 模型档案 | CONTRACT_CONFLICT | 永久数据语义已修复；实际只有4模型，合同要求6–8 |
| 蓝图档案 | PASS | 3个现有蓝图，3服/8服各选一次，迭代后保留 |
| 科技档案 | PASS | 8项按真实条件解锁，被动进入公式，不抽取/装备/阻塞 |
| 算力纪元 | PASS | 8个真实可达，8个未来锁定；锁定无加成 |
| 第一次迭代 | PASS | 三机房+最终旗舰；原子重置/保留；四项奖励真实生效 |
| 二轮加速 | PASS | 首服 59–70 秒，为首轮 11.0%–13.5% |
| 离线与存档 | PASS_WITH_OPEN_SEMANTICS | exactly-once、回拨、迁移、损坏恢复、导入导出、写失败回滚通过；存储旗舰作用未冻结 |
| 产品节奏 | FAIL | standard 八服33:15、迭代1:32，超出最新目标 |

## 自动化门禁

| 命令/检查 | 退出码 | 结果 |
|---|---:|---|
| `npm ci` | 0 | 178 packages，0 vulnerabilities |
| `npm run typecheck` | 0 | PASS |
| `npm test` | 0 | 13 files / 168 tests PASS |
| `npm run e2e` | 0 | 1 file / 1 full-loop PASS |
| `npm run build` | 0 | PASS；JS 121.91 kB / gzip 39.24 kB，CSS 5.83 kB / gzip 1.77 kB |
| `npm run simulate`（分组并行） | 0 | 8策略×1000=8000，失败率0% |

单元范围包含 schema v1→v2、未来 schema 写锁、损坏档、写失败回滚、日期回拨、离线 exactly-once、100 次保存/加载、20 次独立迭代事务、10 分钟 DOM 稳定和 30 分钟逻辑 soak。

## Production 浏览器证据

- 构建：正式 `dist`，普通静态 HTTP；不是 Vite dev server。
- 视口：390×867 DPR1。
- 走通：新档→首模型→3笔手动订单→自动经营→首服→3服/蓝图→免费研发→8服/蓝图→Stage2结算→Stage3→四基础设施→机房2→旗舰→机房3→最终旗舰→档案馆→第一次迭代→二轮自动化→二轮首服→buy-max。
- 正式新档 DOM 117、应用根 1；高频 QA/档案场景 5 秒采样 DOM 173→173、应用根 1→1、scrollY 659.5→659.5。
- Console error/warning 0；刷新同一检查点不重播种，离开后重新打开恢复原 `saveId` 和当前进度。
- `localhost` 正式档保持全新 Stage 1，同时 `127.0.0.1` QA 档保持二轮 Stage 2，证明验收模式未改写正式命名空间。

## 稳定性指标

```yaml
browser_dom_initial: 117
browser_dom_stable_sample: 173_to_173
browser_app_roots: 1_to_1
root_replacement_count: 0
ordinary_tick_full_render_delta: 0
ordinary_tick_partial_patch_count: ">=59 per 60 ticks"
console_error_or_warning: 0
logical_soak: 30_minutes_PASS
dom_soak: 10_minutes_PASS
save_load_cycles: 100_PASS
iteration_transactions: 20_PASS
autosave_interval: 15_seconds
runtime_loops: 1_requestAnimationFrame
normal_timers: 0_intervals; toast_only_2s_timeout
listener_model: one_delegated_root_set + visibilitychange + beforeunload; teardown_removes_lifecycle_handlers
heap_trend: NOT_EXPOSED_BY_IN_APP_BROWSER
```

没有把“堆指标不可用”伪写为 PASS；用 DOM、root identity、循环/监听器静态真值和逻辑 soak 作为现有证据。

## 经济结果摘要

标准策略：首服 8:53、3服 21:30、5服 23:44、8服/Stage3 33:15、机房2 57:24、机房3 1:22、第一次迭代 1:32、二轮首服 0:59。完整矩阵见 `docs/ECONOMY_SIMULATION.md`。

## 不接收原因

1. 4 模型与冻结的 6–8 模型合同冲突；本轮又明确禁止新增模型批次。
2. 一周目八服、机房和第一次迭代未达到最新节奏门。
3. 旧算力中心入口与存储的旗舰作用没有产品权威定义。
4. H5 仓库未配置 remote，无法满足 `main == origin/main`；由于产品门不通过，也不应合并 main 或创建接收 tag。

因此不创建 `compute-tycoon-h5-stage3-review-candidate-20260801` tag，不合并原 H5 `main`，不发布。

## HUMAN REVIEW

当前分支可用于内部问题定位，但不建议发出正式集中评审邀请。若产品权威先完成合同协调，评审重点应只看：Stage 3 进入是否像升级而非降档、3/8服蓝图是否有决策价值、机房投产是否有数量级反馈、第一次迭代是否像奖励、二轮是否明显更快。
