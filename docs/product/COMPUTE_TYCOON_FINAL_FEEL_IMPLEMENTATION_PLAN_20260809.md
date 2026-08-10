# 《算力大亨》最终表现优化实施计划

```yaml
plan_id: COMPUTE_TYCOON_H5_FINAL_FEEL_IMPLEMENTATION_PLAN_20260809
source_audit: docs/product/COMPUTE_TYCOON_FINAL_FEEL_AND_INTERACTION_AUDIT_20260809.md
product_contract_revision: FINAL_FEEL_R1
baseline: 27084613fb6697a0db800ec1dd4e6817ce054e89
status: IMPLEMENTATION_AUTHORIZED
implementation_authorized: true
release_authorized: false
```

## 1. 实施目标

在不改变经济、玩法、存档Schema、广告合同和阶段范围的前提下，一次性补齐中后期的持续运转感、真实增长反馈和可操作发现性。

完成后玩家应获得：

- 5分钟不点击仍能看见公司运行；
- 总算力数量级突破会改变同一个算力引擎的形态；
- 钱够后能在首屏知道有哪些既有投资可做；
- 购买、瓶颈释放、机房、节点和终局有分级而低频的爽点；
- 离线回来能看懂真实增长和下一步；
- 1×–256×不会加速视觉动画或制造手机性能风险。

## 2. 统一治理字段

```yaml
return_to: 当前唯一 Lightweight PM

approved_sequence_when_authorized:
  - FFI-A0_REAL_PRESENTATION_SELECTORS
  - FFI-A1_COMPUTE_ENGINE_AND_INCOME_SCALE
  - FFI-A2_ACTIONABILITY_AND_COMPACT_LAYOUT
  - FFI-A3_MILESTONE_AND_BOTTLENECK_FEEDBACK
  - FFI-A4_OFFLINE_RETURN_FEEDBACK
  - FFI-A5_LIFECYCLE_PERFORMANCE_AND_REVIEW

continuation_policy:
  allowed: 前一张卡PASS，合同revision/范围/CUT/语义不变，基线和单写入者清楚，且无审批门命中
  worker_self_dispatch: forbidden
  automatic_later_phase: forbidden

bounded_rework_limit:
  per_card: 1
  on_second_same_failure_without_new_evidence: STOP_AND_ESCALATE

approval_gates:
  - 任何经济、倍率、成本、进度速度或广告合同变化
  - 新存档字段或正式迁移
  - 新玩法、新资源、新任务、新事件、新页面或新导航
  - Level B媒体生产或任何新BGM
  - Build、TapTap上传、部署、提审或发布
  - 不能用真实指标完成而需要假算力
  - 必须大规模重构UI或引入第二写入者

task_result_required: true
task_result_minimum_fields:
  - task_id
  - result
  - baseline_before
  - baseline_after
  - changed_scope
  - verification
  - evidence
  - known_issues
  - risks
  - blockers
  - approval_gate_hit
  - action_counts
```

任何PASS/PARTIAL/FAIL/BLOCKED都必须返回结构化TASK_RESULT。收到回执后由当前Lightweight PM四选一：`CONTINUE_NEXT_APPROVED_TASK`、`ACCEPT_AND_HOLD`、`BOUNDED_REWORK`、`STOP_AND_ESCALATE`。

## 3. 受保护范围

```yaml
must_not_change:
  - 经济公式、价格、倍率与时间曲线
  - 服务器/设施/节点/工程真实条件
  - 离线结算与广告9+9合同
  - 云存档和排行榜平台协议
  - SaveData字段、版本与迁移
  - Stage1到Stage5范围与终局
  - 四Tab导航数量与语义
  - Lua参考项目
  - store-materials未跟踪工作

allowed_scope:
  - 只读ViewModel的展示派生字段
  - 稳定DOM组件和现有区块顺序
  - CSS主题变量、transform、opacity、局部shadow与gradient
  - 现有成功命令的表现回执
  - 现有离线事实的重新排版
  - 表现专项测试和Review检查点断言
```

## 4. 实现架构合同

### 4.1 展示派生，不进入存档

建议在ViewModel增加只读 `feel` 对象；字段名可由实施者调整，但语义不得变：

```ts
interface FeelViewModel {
  computeTier: "idle" | "micro" | "studio" | "cluster" | "room" | "regional" | "lunar" | "stellar";
  computeLabel: "总算力" | "地球基底算力";
  computeValue: string;
  activity01: number;              // 由真实incomePerSecond做对数归一，仅控制视觉强度
  cosmicNodeOwned: number | null;  // 只读真实Stage4/5节点数
  cosmicNodeTotal: number | null;
  cosmicMultiplier: string | null;
  activeProjectProgress01: number | null;
  affordableActions: Array<{
    id: string;
    label: string;
    anchorAction: string;
    priority: number;
    projectedIncomeGain?: string;
  }>;
}
```

约束：

- `activity01`只控制旋转/呼吸周期，不显示为新数值；
- 不序列化，不新增SaveData；
- 地球阈值使用原始真实算力比较，不解析格式化字符串；
- Stage4/5使用真实stage和节点字段覆盖视觉Tier；
- `affordableActions`只汇总当前已有动作，不创建新经济命令。

### 4.2 稳定DOM

新增一个 `compute-engine` 稳定节点和一个 `next-investment-summary` 稳定节点。普通Tick只允许：

- 更新文本；
- 设置CSS变量；
- 切换有限class/data attribute；
- 更新已有进度宽度；
- 复用固定粒子节点。

禁止普通Tick：

- `replaceChildren`核心组件；
- 动态append粒子；
- 重建root/section；
- 读取布局并立即写布局造成强制reflow。

### 4.3 事件回执

命令执行器在成功命令前后读取ViewModel快照，向壳层传递展示事件：

```ts
interface GrowthFeedbackEvent {
  command: string;
  incomeBefore: string;
  incomeAfter: string;
  computeBefore: string;
  computeAfter: string;
  tierBefore: string;
  tierAfter: string;
  bottleneckBefore?: string;
  bottleneckAfter?: string;
  efficiencyBefore?: number;
  efficiencyAfter?: number;
}
```

实施可使用内部BigValue/Decimal比较，UI不得从格式化中文单位反解析。

## 5. FFI-A0｜真实展示选择器

```yaml
task_id: FFI-A0_REAL_PRESENTATION_SELECTORS
objective: 用现有真实公式生成算力Tier、视觉强度、宇宙外环状态与可负担动作摘要
depends_on: []
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: PASS且无gate时可进入FFI-A1
```

### 实施内容

1. 新增纯函数 `resolveComputeTier`：
   - 0→idle；
   - [1,10)→micro；
   - [10,100)→studio；
   - [100,1000)→cluster；
   - [1000,10000)→room；
   - [10000,100000)及以上地球当前范围→regional；
   - Stage4→lunar；
   - Stage5→stellar。
2. Stage4/5标签固定为“地球基底算力”。
3. `activity01`由真实收入/秒对数归一，clamp到0–1；不改变经济。
4. 汇总当前已有可执行动作，优先级：待领奖励 > 阶段入口 > 当前瓶颈 > 下一服务器/节点 > 研发 > 普通训练/设施。
5. 不把手动重置、赞助、云存档、排行榜加入投资摘要。

### 验收

- 十个确定性检查点输出与审计表一致；
- Stage4/5算力标签无误；
- 8个边界值有单测：0、1、9.999、10、99.999、100、999.999、1000、9999.999、10000；
- 256×只影响session dt，不改变 `activity01` 或视觉周期来源；
- `SaveData` diff为0。

### STOP

- 需要增加新经济数值或从格式化字符串反解析；
- 无法区分地球基底算力与宇宙节点增长；
- 可投入摘要需要复制经济命令。

## 6. FFI-A1｜算力引擎与收入数量级

```yaml
task_id: FFI-A1_COMPUTE_ENGINE_AND_INCOME_SCALE
objective: 实现同一稳定算力引擎、八档形态、收入数量级与真实before_after反馈
depends_on: [FFI-A0]
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: PASS且无gate时可进入FFI-A2
```

### 实施内容

1. 经营页头部后新增72–88px紧凑组件；不放入sticky header。
2. 使用CSS/SVG完成1–3层环、中心核、固定粒子、Stage4轨道与Stage5汇聚形态。
3. 粒子节点总量预建，按Tier通过class显示；不动态增加DOM。
4. 视觉周期3.5–6秒墙钟时间；无收入时静态。
5. 顶部资金视觉刷新可降到约100ms节奏，经济仍按原循环运行。
6. 成功命令真实收入变化后显示0.35–1.6秒跃迁；普通Tick不触发。
7. `prefers-reduced-motion`下只保留静态环、颜色和文本。

### 玩家可见验收

- 新档待机无假运动；获取模型/自动经营后核心开始低频运行；
- 3服、8服、Stage3后期的环数/强度按真实Tier变化；
- Stage4显示地球基底算力+轨道节点2/4+×2.60+工程8%；
- Stage5显示地球基底算力+节点3/4+×5.80+工程25%；
- 永续资金与收入可见持续变化，核心不制造假算力；
- 普通挂机60秒不闪屏、不重复弹倍率、不播放音效。

### 自动验证

- 连续600帧核心DOM节点数不变；
- ordinary tick的`rootReplacementCount=0`且核心无结构重建；
- 收入无变化不产生feedback event；
- 真实倍率阈值四档映射正确；
- reduced-motion无animation/transition持续运行。

### STOP

- 需要位图、GIF、视频或Canvas常驻渲染；
- 组件必须进入sticky header才能成立；
- 产生假算力或假倍率。

## 7. FFI-A2｜可操作发现性与紧凑布局

```yaml
task_id: FFI-A2_ACTIONABILITY_AND_COMPACT_LAYOUT
objective: 让玩家在首屏知道当前有哪些既有动作可做，减少Stage2/3下滚
depends_on: [FFI-A1]
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: PASS且无gate时可进入FFI-A3
```

### 实施内容

1. 算力引擎下增加“现在可投入N项”摘要；点击只scroll/focus现有按钮。
2. 记录每个action的enabled边沿：`false→true`添加600ms一次性class；true保持稳定亮态。
3. Stage2自动化后调整现有区块顺序：模型紧凑摘要→服务器→聚合订单。
4. Stage3保留现有2×2，把基础设施卡压缩到约112–132px：首层只显示名称、等级、成本、状态、按钮；长说明置于轻量详情。
5. Stage4/5保留现有2×2，给真实canBuy节点使用同一边沿合同。
6. 永不折叠：可执行按钮、成本、缺失门槛、活跃进度、待领取。
7. 不新增Tab、页面、执行按钮或存档字段。

### 玩家可见验收

- 3服检查点首屏能看到“下一服务器可购买”；点击摘要定位到原按钮；
- 8服能看到“进入算力中心”；
- Stage3确定性种子显示可投入4项，推荐算力卡及真实+¥4.19万/秒；
- 四设施一屏可快速扫到，按钮命令仍唯一；
- Stage4第3节点可买时首屏摘要可发现；
- 达到可负担后只亮扫一次，保持资金充足不循环闪。

### 自动验证

- 同一action持续true的100次render只产生1次edge event；
- true→false→true可产生第二次；
- summary action只能scroll/focus，不直接调用经济命令；
- native disabled、`.disabled`、`aria-disabled`继续一致；
- 320/350/390/430宽度无横向溢出。

### STOP

- 需要新增底部Tab或第二套购买按钮；
- 需要隐藏成本/门槛才能放下；
- 出现按钮状态与真实canBuy不一致。

## 8. FFI-A3｜节点爆发与真实瓶颈释放

```yaml
task_id: FFI-A3_MILESTONE_AND_BOTTLENECK_FEEDBACK
objective: 为现有低频节点提供分级反馈，并严格区分产能提升、瓶颈转移和真正解除
depends_on: [FFI-A2]
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: PASS且无gate时可进入FFI-A4
```

### 实施内容

1. 按审计事件表映射小升级0.35–0.8秒、大节点1–3秒。
2. 同帧事件合并：终局/阶段 > 核心/机房 > 服务器 > 小升级。
3. 仅成功命令产生反馈，保存加载/页面重绘不补播。
4. 瓶颈文案严格使用before/after真实效率、id和收入：
   - 仅收入增加：产能提升；
   - id真实变化：瓶颈转移；
   - before<1且after=1：瓶颈解除。
5. 使用现有音效开关；最多三种合成cue，不引入新音频资产。
6. 投产红利仍为60真实秒×4，不改时长和倍率。

### 玩家可见验收

- 模型研发显示真实算力/收入增量；
- 第一服、3/5/8服只各播放一次；
- 普通算力卡提升但效率未解锁时绝不显示“瓶颈解除”；
- 真正从63%到100%时显示一次解除冲击；
- 机房投产保留60秒×4，并只在投产瞬间超频1.5秒；
- 迭代、Stage4节点、Stage5节点、终局不会叠成多层遮挡。

### 自动验证

- 构造三种瓶颈before/after测试；
- 命令失败不播放；
- reload不重播；
- 批量购服只产生合并反馈；
- 32×/256×视觉时长与1×差≤5%。

### STOP

- 无法从真实before/after判定；
- 需要修改基础设施公式；
- 高频订单开始产生弹字或音效。

## 9. FFI-A4｜离线回归反馈

```yaml
task_id: FFI-A4_OFFLINE_RETURN_FEEDBACK
objective: 重排现有离线事实，强化领取前后增长和下一步可操作性
depends_on: [FFI-A3]
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: PASS且无gate时可进入FFI-A5
```

### 实施内容

1. 保留原始离线时长、有效时长、上限、超出、资金、研发、工程字段。
2. 增加只读展示计算：当前资金→领取后资金、领取后可负担动作数、最近里程碑。
3. 算力无离线自动升级时显示“保持X”；禁止伪造before/after算力。
4. 真实赞助×2已计入时显示事实，不新增观看入口。
5. 卡片入场1.2秒、领取资金上冲1.0秒；不全屏。
6. 离线结算/领取exactly-once逻辑和9+9广告合同不动。

### 玩家可见验收

- 7小时42分示例能区分原始/有效/超出；
- 领取前看到真实当前资金和领取后资金；
- 无自动购买时总算力显示“保持”；
- Stage4/5工程真实推进可见；
- 领取后可投入数量与实际enabled按钮一致；
- 重载不会重复播放或重复领奖。

### 自动验证

- 20次离线settle/claim exactly-once回归继续通过；
- 系统时钟回拨继续安全；
- 领取后可投入数量用假设资金计算但不提前修改state；
- 广告次数、时长、倍率相关测试零变化。

### STOP

- 需要新增离线奖励、任务或广告位；
- 需要修改离线上限/效率；
- 表现层提前领取或写入资金。

## 10. FFI-A5｜生命周期、性能与集中Review

```yaml
task_id: FFI-A5_LIFECYCLE_PERFORMANCE_AND_REVIEW
objective: 关闭移动端性能风险并形成最终玩家可见候选
depends_on: [FFI-A4]
return_to: 当前唯一 Lightweight PM
bounded_rework_limit: 1
continuation: ACCEPT_AND_HOLD；不得自行Build、上传或进入Level B
```

### 实施内容

1. `document.hidden`时暂停核心、粒子、冲击和视觉计时器；保存/离线逻辑保持原合同。
2. 恢复时不补播，不按隐藏时长创建粒子。
3. 固定预算：动画DOM≤20、并发粒子≤16、常驻≤10、sprite同时≤1（Level A为0）。
4. 所有持续动画使用transform/opacity；filter仅可用于≤96px局部核心且须真机验证。
5. reduced-motion静态降级。
6. 增加最终Review状态矩阵和性能探针；Review倍率与视觉墙钟解耦。

### 自动门

- unit/typecheck/现有完整e2e全部通过；
- 新表现合同测试通过；
- 600帧无DOM增长、无root replacement、普通Tick无section rebuild；
- 1×/32×/256×视觉时长差≤5%；
- 320/350/390/430无横向溢出；
- 页面隐藏60秒无粒子或动画计数增长；
- console/page errors=0。

### 玩家可见Review矩阵

| Checkpoint | 必看 |
|---|---|
| Stage1订单 | 核心不过度抢订单反馈、无每单闪烁 |
| 首服前/后 | 首服可发现、一次性启动反馈 |
| 3服 | 可买服务器首屏可见、T2/T3形态正确 |
| 8服 | 高吞吐、T4形态、Stage3入口可见 |
| Stage3 | 推荐算力卡、四设施紧凑、真实瓶颈文案 |
| R2/R3 | 同轮持续反馈、主题不串色 |
| Stage4 | 地球基底算力、2/4节点、×2.60、8%工程 |
| Stage5 | 地球基底算力、3/4节点、×5.80、25%工程 |
| 永续 | 资金/收入继续变化，不产生假算力 |
| 离线 | 前后资金、保持算力、可投入项、工程推进 |

### 真机门

需要后续单独授权后验证：

- TapTap iOS真容器；
- 一台中端Android WebView/Chrome；
- 前台连续10分钟、后台60秒、恢复5分钟；
- 1×与256×；
- BGM/SFX开关；
- reduced-motion模拟；
- p95主线程帧≤20ms为目标，低电量/低功耗下不低于可用30fps。

### STOP

- Level A仍需要新资产才能成立；
- iOS/Android任一出现持续掉帧、发热或恢复爆发；
- 需要修改经济/存档/广告；
- Build、上传、部署或发布未经单独授权。

## 11. Level B媒体卡（HOLD）

```yaml
task_id: FFI-B1_OPTIONAL_MICRO_SPRITES
status: HOLD_OWNER_APPROVAL_REQUIRED
approved_sequence_member: false
scope:
  - 第一服务器启动
  - 奇点核心入库
budget:
  format: transparent_webp_sprite_sheet
  frame_size_max: 256x256
  frames: 16_to_20
  fps: 12_to_15
  duration: 1.2_to_1.5s
  compressed_each_max: 400KB
  decoded_each_max: 8MB
  max_simultaneous: 1
fallback: CSS_SVG
```

Level A通过且真机性能有余量后，负责人仍需明确批准才可生产。不得自动续派。

## 12. 文件级建议（不构成授权）

预计可能涉及：

- `src/economy/viewmodel.ts`：只读feel派生；
- `src/ui/render.ts`：稳定核心、投资摘要、边沿跟踪、反馈回执与离线排版；
- `src/styles/main.css`：Tier、主题、紧凑布局、动画与降级；
- `src/app/main.ts`：成功命令before/after展示事件与生命周期；
- `src/audio/game-audio.ts`：最多三类现有合成cue；
- `tests/unit/render_contract.test.ts`及新增表现纯函数测试；
- Review检查点/证据脚本：只补断言，不改检查点经济种子。

禁止顺手修改云存档、排行榜、广告、经济、存档迁移、素材商店或Lua工程。

## 13. 完成定义

```yaml
definition_of_done:
  product:
    - 不增加玩法但挂机5分钟仍有持续运行感
    - 真实算力和宇宙节点语义不误导
    - 钱够后首屏可发现既有动作
    - 小升级与大节点刺激分级且不疲劳
    - 离线回归显示真实前后与下一步
  engineering:
    - 经济/存档/广告diff为0
    - 固定DOM和粒子预算通过
    - 1x到256x视觉墙钟解耦
    - reduced_motion和hidden暂停通过
    - 现有回归与新增表现测试通过
  evidence:
    - STATIC
    - TEST
    - WEB_PREVIEW（需另行授权）
    - DEVICE（需另行授权）
  nonclaims:
    - NOT_HUMAN_PASS
    - NOT_RELEASE_CANDIDATE
    - NOT_FORMAL_RELEASE
```

## 14. 当前动作计数

```yaml
actions:
  code_changes: 0
  gameplay_changes: 0
  economy_changes: 0
  save_changes: 0
  ad_contract_changes: 0
  asset_changes: 0
  tests_run: 0
  builds: 0
  deployments: 0
  platform_actions: 0
```
