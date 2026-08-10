# 《算力大亨》终局重构 · CARD-00 非功能只读审计（返修后终版）

```yaml
task_id: COMPUTE-TYCOON-H5-ENDGAME-DESIGN-09
doc_type: CARD_00_NONFUNCTIONAL_READONLY_AUDIT
date: 2026-08-05
status: READONLY_AUDIT_COMPLETE_NO_CODE_CHANGES
rework_revision: 5
review_baseline: version_8
review_candidate_commit: 41d873073d3c2b64752e284e946a42ab3fcc0709
scope: 只读；不改任何 src/ 代码；输出待办清单
priority_legend: P0=真人体验前必须处理 | P0_ENDGAME=Stage5/永续上线前必须处理（CARD-01 实验 Schema 冻结前关闭） | P1=Stage4 实现前处理 | P2=正式整合前处理 | HOLD=目前无需处理
```

## 审计方法

- 只读检查 `src/` 引擎/会话/存档/渲染/样式/Review 入口代码与既有测试，无 Build、无浏览器、无修改。
- 与终局相关的 1×/32×、订单渲染、存档事务、离线幂等、命名空间隔离、宽度、长挂机、无障碍、大数格式逐项取证。
- 本审计为 CARD-00 交付物之一；每项给出证据定位与优先级。不做视觉/美术判断（当前非多模态模型）。

## 1. 1×～32× 状态同步与时间源（结论：无混用；已用真实语义复验）

- 证据：`src/app/main.ts:176-179` rAF 循环 `session.update(dt * runtimeSpeed)`；`src/app/session.ts:161-176` `update(dtSec)` 将 `elapsed` 直接传入 `tick`；`tick`（`src/economy/engine.ts:239`）与 `advanceFlagship`（`src/economy/stage3.ts:517`）均为 `elapsedSec` 线性推进，**不读墙钟**。离线锚点走 `lastTickAtMs`（`session.ts:214`），与 speed 解耦。
- 复验（替换旧“同函数同步长两次”方法）：`scripts/_verify_speed_sync.ts` 复用真实 `GameSession.update(frameDt × speed)`；同一帧序列 1× vs 32×；覆盖 60Hz / 30Hz / 抖动+后台大帧；自动订单、旗舰工程、时代工程（era_national 真实引擎 + 模拟器 R1 基线）三里程碑。每结果返回 reached/wall_seconds/game_seconds/frames；完成时刻帧内线性插值（连续完成时刻），原始帧末检测值如实列出；全部 `reached:true` 且差 ≤1%（最大 0.38%）。
- 说明：32× 的推进语义与 1× 相同（都是逐帧 update），归一化比较成立；不把实际路径差异称为“量化伪影”后排除——真实语义下无差异。
- 优先级：P1（Stage4 实现前把该口径写入 CARD-06 检查点定义）。

## 2. 自动订单渲染：闪烁 / 节点重建 / 按钮状态延迟

- 证据：渲染为“结构性签名 + 局部 patch”两段式（`src/ui/render.ts:316-342` 注释与 `sigForOrders`/`rebuildOrderList`/`patchOrders`）。订单静态列表仅按 `model.acquired|automationUnlocked|automationEnabled` 签名重建（`render.ts:446-450`）；自动模式 active 子区签名恒定 `automation:4`（`render.ts:452-455`），高频进度走 `patchActiveRow` 局部更新；流水/算力聚合模式折叠单笔列表（`render.ts:551-559`）。会话层同帧补满槽位避免 4→3→4 缺口（`session.ts:184-190`）。
- 残余技术债：`replaceChildren` 仍用于订单/服务器/机房/档案等结构性重建（`render.ts:491,522,584,925` 等），注释明示“render 每帧 replaceChildren 替换按钮”（`render.ts:180,215,231`）——按钮节点每帧可能被替换，已通过 pointerup 坐标回退（`render.ts:222-253`）与 suppressClick 防重复兜底。
- 判定：自动模式下列表闪烁风险已缓解（签名恒定 + 局部 patch）；按钮被替换的点击兜底存在但依赖坐标回退。
- 优先级：P1（Stage4 引入新交互前补订单区渲染契约测试：行结构不变时不重建节点；评估“按钮事件在替换瞬间丢失”窗口）。

## 3. 存档事务 / 重复点击 / 刷新 / 离线结算幂等

- 证据：`src/save/repository.ts` 保存前校验 + revision 递增 + 写失败不入内存（`repository.ts:53-77`）；`session.ts:239-262` `commit` 先 `structuredClone` 备份，失败回滚；高版本 schema 写锁（`repository.ts:44-52`，`writesBlockedByFutureSchema`）。
- 离线：`settleOfflineReward`/`claimOfflineReward` exactly-once（`src/save/offline.ts:52-118`），已有报价不重复计算；`hasPendingOfflineReward` 刷新后可恢复；`session.ts:214` 启动时 `Math.min((now-lastTickAtMs)/1000, offlineCapSeconds)` 封顶。既有测试 `tests/unit/offline.test.ts`、`session_offline.test.ts` 覆盖。
- 重复点击：命令级回滚（`commit`）保证失败不落状态；旗舰奖励 `claimFlagshipReward` exactly-once（`stage3.ts:553+`）。
- 判定：幂等基础良好。CARD-00 离线上限双层证据（`scripts/_verify_offline_matrix.ts`）：① CURRENT_ENGINE_BASELINE 用真实 `settleOfflineReward` 验证现有引擎 cap 与 exactly-once（2×上限/刷新重入/日期回拨/二次累计全通过）；② ENDGAME_CANDIDATE_MODEL 用隔离结算模型验证候选 cap（上限-1s/恰好/上限+1s/1.5×/2×/多次累计/重入/回拨，同一 cap 决定有效/超出/金额/工程/二次累计）全通过。
- 优先级：P2（终局加入“核心领取/离线回执”后，把 20 连击 + 刷新回放纳入 CARD-06 断言）。

## 4. Review 与 Production 入口、命名空间与存档隔离

- 证据：正式命名空间 `compute_tycoon_h5_mvp_v1`（`src/save/types.ts:4`）；dev 命名空间 `compute_tycoon_h5_dev_v1`（`src/app/devverify.ts:9`）；Review 命名空间按检查点 `compute_tycoon_h5_review_v2:<id>`（`src/review/checkpoints.ts:34,148`）。Review 入口经 `window.__CT_REVIEW_RUNTIME_OVERRIDE__` 注入独立 storage（`src/app/main.ts:39-62`），`devParams` 加速仅限隔离档（`main.ts:44-51`），正式档 speed 恒 1。
- 重置：`resetReviewCheckpoint` 先 teardown 再删槽位再导航（`src/review/reset.ts:23-43`）；Review 主入口有未知检查点拒绝（`src/review/main.ts:192-198`）。
- 判定：隔离机制符合终局需求。CARD-01..04 统一新增 `compute_tycoon_h5_endgame_review_v1` 命名空间与同一实验 Schema（不连续设计正式 v4→v5→v6→v7）。
- 优先级：P1（确保该命名空间不走正式 `LocalStorageSaveStorage()` 默认键，Review 主页不列出终局检查点防误触正式档）。

## 5. 320/350/390/430 宽度溢出风险

- 证据：`#app` 最大宽 430px（`src/styles/main.css:31,145,176`）；350px 断点（`main.css:792-798`：stats 收窄、infra-grid 单列、archive-tabs 双列）；`overflow-wrap: anywhere` 于金额/架构行（`main.css:325,342,413`）；`min-width:0` 于 stats/订单行（`main.css:346,461,591,686`）；Review 面板 430/620 断点（`src/review/review.css:261,283`）。
- 风险点：顶部资金 `font-size: clamp(27px,8vw,32px)` + `overflow-wrap:anywhere`（`main.css:322-330`）在超大体量金额（≥1e20 科学计数法）下仍可能换行超高；`toolbar` 五个按钮在 320px 宽（`main.css:140-148`，`flex:1` + 12px 字）有挤压风险。
- 判定：350/390/430 已有断点与换行防护，风险中低。
- 优先级：P2（终局顶部需容纳“奇点核心 n/3”+ 大额资金，CARD-01 实现时在 320px 实机复核；本审计未做浏览器验证）。

## 6. 长时间挂机：性能 / 定时器 / 渲染压力

- 证据：rAF 循环每帧 `session.update` + `render`（`main.ts:169-182`）；`session.update` 每帧 clone 仅发生在 `commit`（命令时），rAF 路径不 clone；离线结算仅启动一次（`settleOfflineAtBoot`）。自动模式订单槽位恒 4，active 子区局部 patch；聚合模式折叠列表避免逐笔重建。`visibilitychange`/`beforeunload` 显式保存（`main.ts:184-196`）。
- 风险点：`tick` 内 `incomePerSecond` 每次调用构建 Decimal 链（每帧多次），长挂机时 CPU 持续占用；`totalRequests += Math.floor(compute*elapsedSec/12)`（`engine.ts:305`）在 32× 下每帧累加可能快速增大（Number 精度边界，见 §8）。
- 判定：常规挂机压力可接受。
- 优先级：P2（Stage4/5 若引入额外每帧计算，CARD-02 后做一次 60min 虚拟时长渲染压力测试；永续阶段数字增长复核 Number 精度 §8）。

## 7. 无障碍 / 禁用状态 / 实际点击状态一致性

- 证据：`syncButtonAffordance` 同步 `disabled` + `.disabled` class + `aria-disabled`（`render.ts:339-343`）；点击处理统一检查 `disabled`（`render.ts:222-226,282-289`）；`.btn.disabled{pointer-events:none}`（`main.css`）。
- 判定：禁用态三处一致，事件层在节点替换后按坐标回退。
- 优先级：P2（终局新按钮——领取核心/启动地外计划/永续确认——沿用同一 `syncButtonAffordance` 模式并接入 `aria-disabled`；Review 速度控件已有 `focus-visible` 样式）。

## 8. 数字格式超大数量级稳定性（P0_ENDGAME）

- 2026-08-08 收口：显示单位冻结为万→亿→兆→京→科学计数法；顶部资金 `<=1e12` 保留完整千分位，超过后从兆开始缩写。
- 存档升级为 schema v4；规模型数值在安全整数范围内保持 number，超界后以 24 位 Decimal 规范字符串持久化。生产写回、购买判定、峰值统计、离线收益与终局快照不再用 Number 强制截断大数。
- 证据：大数/存档/Stage4/Stage5 针对性 56/56 PASS；超界数值存储→导出→导入精确往返 PASS；v3 number 存档→v4 迁移 PASS；真实终局页 `1e16/2e16` 显示为 `1京/2京`。
- 判定：

```yaml
priority: P0_ENDGAME_CLOSED
closed_on: 2026-08-08
save_schema: 4
```

- 产品验收只冻结结果（不指定实现方法，存储方案由 Technical PM 决定）：
  1. Stage5 和永续阶段数字持续单调增长；
  2. 临界价格前后购买判断准确；
  3. 保存、重载后数值不倒退；
  4. 不出现 `Infinity`、`NaN` 或可见精度停滞；
  5. 顶部资金与详细数值语义一致。
- 旧 v1–v3 档可向前迁移；未知高版本仍写锁保护。

## 9. 已知但不阻断 CARD-00 的技术债

| 项 | 证据 | 处置 |
|---|---|---|
| 自动订单/按钮节点稳定性 | 四槽位局部 patch；32× 真实浏览器 25 次采样节点引用不变、无领取按钮；按钮 `disabled/class/aria` 一致 | CLOSED（未复现玩家可见闪烁） |
| 32× 一致性口径 | 已用真实 `_verify_speed_sync.ts` 复验（全部检查点 reached:true、差 ≤1%，最大 0.38%） | P1：CARD-06 固化真实 update 语义口径 |
| 离线 30 分钟常量 `OFFLINE_MAX_SECONDS` 未使用 | `offline.ts:8` | P2：终局统一离线常量表 |
| 宇宙阶段离线 75% 效率为模拟器假设 | `scripts/simulate-endgame.ts` | P2：CARD-04 冻结真实值 |
| `render.ts` 订单聚合模式折叠单笔列表 | 设计有意（`main.css` 折叠态） | HOLD |
| 排行榜云端校验未就绪 | 产品定义 CARD-05 | HOLD（保持 HOLD） |

## 10. 结论

- P0_ENDGAME 大数精度已关闭；自动订单/按钮的玩家可见 P1 也已关闭。剩余条目为 HOLD、已吸收的历史口径或发布前证据工作，不是当前确认的玩家主线阻断。
- 全部结论基于只读检查、既有测试与本轮新增验证脚本（`_verify_speed_sync.ts` / `_verify_offline_matrix.ts` / `_verify_calendar_scenarios.ts`）；未执行 Build/浏览器验证（本轮授权范围外）。
- 不做视觉/美术判断。
