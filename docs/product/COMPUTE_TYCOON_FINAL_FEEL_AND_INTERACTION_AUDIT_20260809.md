# 《算力大亨》上线前最终表现与中期交互审计

```yaml
task_id: COMPUTE_TYCOON_H5_FINAL_FEEL_AND_INTERACTION_AUDIT_01
task_type: READ_ONLY_PRODUCT_UI_FEEL_AUDIT
baseline: 27084613fb6697a0db800ec1dd4e6817ce054e89
date: 2026-08-09
result: READY_FOR_FINAL_FEEL_IMPLEMENTATION
product_contract_revision: FINAL_FEEL_R1
implementation_authorized: false
```

## 1. 结论

当前版本已经具备可玩的完整增长循环，阶段切换、地月和戴森终局也有清晰主题。上线前最值得做的不是增加系统，而是把现有真实数值和已有投资动作组织成三层反馈：

1. 常驻但克制的“算力引擎”，让挂机时始终能看见系统运行；
2. 只绑定真实 enabled 状态的“现在可投入”提示，让钱够以后立即知道哪里能点；
3. 只在真实收入、算力或阶段发生跃迁时播放的低频爆发，强化购买回报而不制造疲劳。

这三层可以在不改经济、不改存档、不改广告合同、不新增玩法的前提下完成。上线前推荐实施 Level A；Level B 轻资源不是上线门；Level C 明确不做。

```yaml
current_truth:
  compute_feedback: 真实但离散；地球阶段范围约0到6.38万，Stage4/5顶部仍沿用地球算力口径
  income_feedback: 真实且持续，但主要是文本数字更新；购买后的跃迁缺少统一回执
  idle_feedback: Stage1订单阶段较强，自动化后显著下降，终局仅已有一条结算光束
  actionable_density: 动作不少，但Stage2关键购服、Stage3明细和宇宙节点可能落在首屏以下
  stage2_layout: 服务器已经2x2；主要缺口是顺序与首屏可发现性
  stage3_layout: 四基础设施已经2x2；主要缺口是卡片过高、长说明和纵向堆叠
  offline_return_feedback: 数据完整，高潮与领取后可行动提示不足
```

## 2. 冻结边界

```yaml
commercialization:
  rewarded_ads_verified_on_device: true
  daily_total: 18
  offline_duration_ads: 9
  offline_double_reward_ads: 9
  full_usage_result:
    offline_duration: 24h
    doubled_reward_coverage: 24h
  contract_changes: 0

product:
  new_systems: FROZEN
  new_gameplay: FROZEN
  new_currency: FROZEN
  new_tasks_or_random_events: FROZEN
  universe_expansion: FROZEN
  economy_changes: 0
  save_schema_changes: 0
  current_phase: FINAL_PRELAUNCH_POLISH
```

## 3. 审计依据与证据边界

本审计核对了当前 tracked 候选的 ViewModel、收入/算力/瓶颈/Stage4/Stage5 真实公式、DOM 局部更新方式、CSS 主题和动效，并查看了下列确定性截图状态：Stage1订单、首服前、3服、8服、Stage3、R2/R3、Stage4、Stage5与戴森终局。

代表性确定性数值如下：

| 状态 | 总算力 | 收入/秒 | 额外真实进度 |
|---|---:|---:|---|
| 新档 | 0 | ¥0 | 无 |
| 第一台服务器前 | 2.23 | ¥85 | 首服里程碑接近 |
| 3服 | 57 | ¥3,361 | 架构1/3、研发82/100 |
| 8服 | 1,362 | ¥16.61万 | 架构3/3 |
| Stage3刚进入 | 1,362 | ¥27.91万 | 机房1、四设施可升级 |
| R2代表状态 | 6.38万 | ¥1,315万 | 永久倍率与时代工程 |
| R3代表状态 | 6.38万 | ¥1,753万 | 永久倍率与时代工程 |
| Stage4中期 | 6.38万 | ¥7,800万 | 节点2/4、×2.60、工程8% |
| Stage5冲刺 | 6.38万 | ¥69.6亿 | 节点3/4、×5.80、工程25% |
| 永续终局 | 6.38万 | ¥130亿 | 节点4/4、×10.80、工程完成 |

截图矩阵的底部导航属于较早壳层；四 Tab、安全区和平台真机壳以当前 tracked DOM/CSS 与负责人最新真机反馈为准。截图仍可用于经营页内部信息层级与首屏可发现性审计。所有结论属于 DOCUMENTED/STATIC/DETERMINISTIC_VIEWMODEL/SCREENSHOT 层，不冒充实施、真机性能或发布通过。

## 4. 当前页面逐状态审计

### 4.1 Stage1订单阶段

```yaml
visible_dynamic_elements: [当前资金, 收入每秒, 总算力, 工作室经验, 订单倒计时, 订单进度条]
continuously_changing_numbers: [资金, 累计营业收入, 订单剩余时间, 订单进度, 经验]
progress_feedback: 订单逐条进度最强，模型训练与自动化门槛也可见
clickable_actions: [获取或训练模型, 接取订单, 手动领取, 开启自动经营]
affordable_actions: 直接反映在按钮enabled，但没有跨区汇总
hidden_below_fold_actions: [租赁算力, 首服里程碑及后续服务器区]
animation_frequency: 订单条持续；点击与结算频繁
current_theme: 地球冷蓝
current_compute_feedback: 顶部单行真实总算力，购买/训练后离散变化
current_income_feedback: 顶部收入加每单净收益，反馈完整
idle_visual_activity: 高；只要有订单，玩家不点也能看见多个进度条运行
```

判断：这是当前“机器在工作”感最强的阶段，应保留其反馈密度，而不是把手动订单带入后期。

### 4.2 第一台服务器阶段

```yaml
visible_dynamic_elements: [资金, 收入, 算力, 经验, 模型研发, 订单进度]
continuously_changing_numbers: [资金, 累计营业收入, 订单和经验]
progress_feedback: 首服有等级与累计收入双门槛，但所在服务器区常落在首屏以下
clickable_actions: [训练, 订单, 达标后的首服领取]
affordable_actions: 首服是里程碑授予，不是付费购买；达标后需要明确可领取态
hidden_below_fold_actions: [首服里程碑条, 首服领取按钮]
animation_frequency: 仍主要来自订单
current_theme: 地球冷蓝
current_compute_feedback: 获得首服前约2.23，首服后真实跳升，但缺统一爆发
current_income_feedback: 有训练预览，首服获得后的全局跃迁没有固定格式
idle_visual_activity: 中高；依赖订单条
```

判断：首服是核心身份跃迁，当前可达但视觉高潮和首屏发现性不足。

### 4.3 3服阶段

```yaml
visible_dynamic_elements: [资金, 收入, 算力57, 研发82/100, 自动经营摘要, 服务器阵列上半部]
continuously_changing_numbers: [资金, 累计营业收入, 自动经营摘要]
progress_feedback: 研发条与服务器3/8进度存在
clickable_actions: [训练, 研发达标后研发蓝图, 购买第4台服务器]
affordable_actions: 确定性种子中下一台服务器可买，但购买按钮在服务器区下方
hidden_below_fold_actions: [下一台服务器按钮, 批量购买, 完整服务器阵列]
animation_frequency: 自动订单折叠后明显降低
current_theme: 地球冷蓝
current_compute_feedback: 顶部57，服务器变化后离散更新
current_income_feedback: 顶部与自动经营摘要；没有购买后统一倍率回执
idle_visual_activity: 中低；主要是资金文字变化和研发条静态状态
```

判断：玩家不是没东西买，而是不容易在首屏知道“现在服务器已经买得起”。

### 4.4 8服阶段

```yaml
visible_dynamic_elements: [资金, 收入16.61万每秒, 算力1362, 研发进度, 高吞吐摘要]
continuously_changing_numbers: [资金, 累计营业收入, 经营摘要]
progress_feedback: 服务器8/8完成，Stage3入口存在但位置靠后
clickable_actions: [训练或研发, 进入Stage3]
affordable_actions: 服务器已满；主要行动转为进入算力中心
hidden_below_fold_actions: [完整服务器里程碑, Stage3进入按钮]
animation_frequency: 低；订单已聚合为只读算力结算
current_theme: 地球冷蓝
current_compute_feedback: 1362，达到机房级门槛但画面形态没有同量级强化
current_income_feedback: 高吞吐摘要清楚，数字仍与3服使用相近视觉权重
idle_visual_activity: 低；像一张数据面板
```

判断：8服的数量级突破和Stage3入口应成为低频高潮，不能只靠文案变化。

### 4.5 Stage3四基础设施

```yaml
visible_dynamic_elements: [资金, 收入27.91万每秒, 算力1362, 投产红利倒计时, 当前瓶颈, 有效效率]
continuously_changing_numbers: [资金, 红利倒计时, 活跃旗舰工程进度]
progress_feedback: 瓶颈效率条、四设施等级、机房、旗舰工程均真实存在
clickable_actions: [升级当前瓶颈, 升级四设施, 投产机房, 启动或领取旗舰工程]
affordable_actions: 确定性Stage3入口种子四设施全部可升级
hidden_below_fold_actions: [2x2基础设施矩阵, 机房, 旗舰工程列表]
animation_frequency: 红利存在时1.2秒呼吸；工程运行时进度持续；其余较静态
current_theme: 地球主题；迭代轮次通过青蓝或紫橙副色区分
current_compute_feedback: 真实离散更新；无统一引擎形态
current_income_feedback: 瓶颈卡给出真实预计增量，是目前最好的投资回报预览
idle_visual_activity: 中；有工程或红利时成立，没有时仍偏表格
```

判断：现有“当前瓶颈”是中期最有价值的爽点基础。四设施已经2×2，不需要重新发明布局，只需要紧凑化和可升级态。

### 4.6 R2/R3挂机阶段

```yaml
visible_dynamic_elements: [轮次徽标, 永久倍率, 资金, 收入, 算力, 时代工程进度]
continuously_changing_numbers: [资金, 累计收入, 活跃工程进度]
progress_feedback: 重跑流程与时代工程存在，但已学内容被压缩后交互密度下降
clickable_actions: [既有训练研发购服设施机房工程, 核心领取与迭代]
affordable_actions: 分散在各阶段原位置
hidden_below_fold_actions: [当前轮时代工程和核心入口]
animation_frequency: 阶段切换明显，轮内持续反馈不足
current_theme: R2青绿蓝；R3紫橙，但仍属于地球色系
current_compute_feedback: 代表状态均约6.38万，难以表现两轮收入加速
current_income_feedback: R2约1315万每秒、R3约1753万每秒，真实增长但视觉近似
idle_visual_activity: 低到中；主要依赖数字和工程条
```

判断：迭代色阶足以说明“这是下一轮”，但不能说明“这一轮正在越来越恐怖”。

### 4.7 Stage4地月

```yaml
visible_dynamic_elements: [资金, 地月收入7800万每秒, 地球基底算力6.38万, 节点倍率2.60, 工程8%]
continuously_changing_numbers: [资金, 累计收入, 活跃工程进度]
progress_feedback: 节点2/4与地月工程真实推进
clickable_actions: [可买的下一地月节点, 批量部署, 工程领取或进入Stage5]
affordable_actions: 确定性种子中第3节点可买，按钮位于节点区
hidden_below_fold_actions: [节点2x2与工程按钮]
animation_frequency: 主题星点静态；工程条持续；无统一轨道运行反馈
current_theme: 冷紫蓝与青色
current_compute_feedback: 顶部仍是地球6.38万，不随地月节点增长
current_income_feedback: 地月收入和节点倍率真实且有效，但与顶部总算力语义分离
idle_visual_activity: 中低；工程运行时成立，等待买节点时偏静态
```

判断：必须把顶部算力明确为“地球基底算力”，并让同一算力引擎的轨道环读取真实节点数、倍率和工程进度。

### 4.8 Stage5戴森与永续

```yaml
visible_dynamic_elements: [资金, 恒星收入69.6亿至130亿每秒, 地球基底算力6.38万, 节点倍率5.80至10.80, 戴森工程]
continuously_changing_numbers: [资金, 累计收入, 活跃工程进度, 永续实时结算]
progress_feedback: 节点3/4、戴森25%直至完成；终局有完整庆典和实时结算光束
clickable_actions: [最后恒星节点, 戴森工程领取, 终局继续经营]
affordable_actions: 下一节点在节点区真实亮起
hidden_below_fold_actions: [节点与工程主按钮]
animation_frequency: 终局前较低；终局后已有1.8秒循环结算光束
current_theme: 暗金、恒星金与粉色副光
current_compute_feedback: 仍为6.38万地球口径，不能表达宇宙规模
current_income_feedback: 69.6亿到130亿是真实主增长；终局卡比顶部更有生命力
idle_visual_activity: 终局前中低，终局后中；仍缺贯穿全程的统一组件
```

判断：保留终局庆典与实时结算，不再增加常驻全屏动画。统一算力引擎在Stage5改为恒星形态即可。

## 5. “算力”第二主数字裁决

### 5.1 真实语义

1. 当前算力是真实值，但不是每秒累计资源；它是当前模型、服务器、设施和技术构成的能力快照。
2. “总算力”比“算力/秒”更准确，后者会误导玩家以为它在持续产出或累积。
3. 钱以外的第二核心反馈继续使用“总算力”。Stage4/5必须标注“地球基底算力”，同时显示真实宇宙节点倍率和工程进度。
4. 可以不改经济模型而强化：数字保持真实，常驻旋转只表达“系统正在运行”，形态变化只绑定真实算力阈值、节点拥有数和阶段。

### 5.2 明确禁止

- 不增加一个每Tick上涨的假算力；
- 不把收入/秒换皮成算力/秒；
- 不让Stage4/5的6.38万看起来像仍在增长；
- 不把赞助收入×2包装为工程或算力加速。

## 6. 统一“算力引擎”产品合同

### 6.1 组件定位

同一个稳定DOM组件，放在经营页头部之后、当前阶段内容之前；随页面滚动，不加入粘性顶栏，避免压缩小屏首屏。建议高度72–88px，视觉核心56–64px。

```yaml
source_real_metric:
  earth_center_value: 当前真实总算力
  cosmic_center_value: 当前真实地球基底算力
  activity_intensity: 当前真实收入每秒的对数归一值
  stage4_outer_ring: [真实节点数, 真实节点倍率, 真实工程进度]
  stage5_outer_ring: [真实节点数, 真实节点倍率, 真实工程进度]
save_or_economy_field_added: false
interactive: false
aria:
  persistent_animation: aria-hidden
  readable_text: 总算力或地球基底算力加当前阶段状态
```

常驻动效只表达运行，不表达虚构增长：

- 收入为0且未自动化：静态待机；
- 收入大于0：缓慢呼吸和旋转；
- 收入越高：在当前档内将周期从约6秒收紧到约3.5秒，不低于3.5秒；
- 视觉周期使用墙钟时间，不乘1×–256× Review倍率；
- 真实总算力、节点数或阶段变化时才改变档位/环数。

### 6.2 八档真实视觉阶梯

| Tier | 名称 | 真实条件 | 形态 | 粒子常驻数 | 脉冲周期 | 颜色规则 |
|---|---|---|---|---:|---:|---|
| T0 | 待机核心 | 总算力=0 | 暗色单环，停止旋转 | 0 | 无 | 当前主题低亮度 |
| T1 | 微型算力 | 1–<10 | 单环、弱呼吸 | 2 | 6.0s | 暗蓝→冷蓝 |
| T2 | 工作室级 | 10–<100 | 单环加刻度光点 | 3 | 5.6s | 冷蓝，亮度+8% |
| T3 | 集群级 | 100–<1,000 | 双环反向慢转 | 4 | 5.1s | 电光蓝，轻边缘辉光 |
| T4 | 机房级 | 1,000–<10,000 | 双环加数据弧 | 6 | 4.6s | 蓝紫霓虹，但不进入宇宙金 |
| T5 | 区域级 | 10,000–<100,000 | 三环、中心能量核 | 8 | 4.1s | 使用当前迭代主题的高能量档 |
| T6 | 地月级 | 真实进入Stage4 | 轨道环、2–4节点灯、工程弧 | 8 | 3.8s | 冷青→紫蓝→深空霓虹 |
| T7 | 恒星级 | 真实进入Stage5 | 金色汇聚环、2–4节点灯、工程弧 | 10 | 3.5s | 暗金→橙金→白金核心 |

当前地球真实上限代表值约6.38万，落在T5。Stage4/5使用真实阶段覆盖T6/T7，是因为当前地球算力公式没有吸收宇宙节点，而不是为了制造更大的假数字。

### 6.3 同主题内部色阶

- 地球R0：暗蓝 → 冷蓝 → 电光蓝 → 蓝紫霓虹；
- 地球R1：暗青 → 青绿 → 青蓝高光；
- 地球R2/R3：紫蓝 → 紫橙副光，但禁止提前使用恒星金作为主色；
- Stage4：冷青 → 紫蓝 → 深空霓虹；
- Stage5：暗金 → 恒星橙金 → 白金核心。

实现只调整主题变量的亮度、饱和度、辉光透明度、环数量和粒子密度，不在每1%增长时变色。

## 7. 收入数字跃迁合同

普通运行：

- 顶部资金/累计收入以100ms左右视觉频率刷新即可，经济仍按原帧计算；
- 使用等宽数字或tabular-nums；
- 不做每位数字持续滚轮，不闪屏，不播放音效；
- 当前已有但未接线的`.money.bump`不能作为完成证据。

真实动作成功后，比较动作前后真实收入/秒：

| 真实倍率 | 表现 | 时长 |
|---:|---|---:|
| <1.05 | 数字轻提亮，不显示倍率卡 | 0.35s |
| 1.05–<1.50 | 显示“收入 +X /秒” | 0.65s |
| 1.50–<3.00 | 显示“收入效率 ×N”并短促上冲 | 1.10s |
| ≥3.00 | 显示旧值→新值、真实×N，核心冲击波一次 | 1.60s |

所有文本必须来自before/after真实值；1–2秒后恢复正常。普通Tick、自动订单结算、赞助剩余秒数变化不触发跃迁动画。

## 8. 低频爆发节点合同

| 现有事件 | duration | number_jump | glow / pulse | sound | optional_sprite |
|---|---:|---|---|---|---|
| 模型蓝图升级 | 0.55s | 真实算力与收入增量 | 核心提亮+单圈波 | 小升级cue | 否 |
| 第一台服务器 | 1.80s | 旧算力/收入→新值 | 核心从T1/T2启动双环 | 规模突破cue | Level B候选 |
| 第3台服务器 | 1.10s | 真实新收入 | 架构环点亮1段 | 规模突破cue | 否 |
| 第5台服务器 | 1.10s | 真实新收入 | 架构环点亮2段 | 规模突破cue | 否 |
| 第8台服务器 | 1.80s | 真实新收入/算力 | 服务器阵列扫光一次 | 规模突破cue | 否 |
| 普通设施升级 | 0.45s | 真实预计/实际增量 | 对应卡片短亮 | 小升级cue | 否 |
| 关键设施/瓶颈转移 | 0.90s | 效率before→after | 暗环转亮+冲击一次 | 产能释放cue | 否 |
| 机房投产 | 2.00s | 真实收入跳升 | 核心超频1.5秒；保留60秒×4红利 | 规模突破cue | Level B候选 |
| 奇点核心 | 2.20s | 永久倍率真实变化 | 环收缩→释放一次 | 核心cue | Level B候选 |
| 技术迭代 | 2.50s | 倍率与轮次 | 全页主题过渡，不闪白 | 阶段cue | 否 |
| Stage4节点 | 1.20s | 节点倍率与收入 | 新轨道节点锁定 | 规模突破cue | 否 |
| 地月网络完成 | 2.40s | 工程完成与真实收入 | 轨道闭环一次 | 阶段cue | 否 |
| Stage5节点 | 1.30s | 节点倍率与收入 | 能量向中心汇聚一次 | 规模突破cue | 否 |
| 戴森巨构 | 3.00s | 真实终局记录 | 沿用完整终局庆典/现有主视觉 | 终局cue | 已有终局主视觉，不新增序列帧 |

小升级不超过0.8秒；大型节点1–3秒；同一事件只播放一次。若多个事件同帧发生，按“阶段/终局 > 核心/机房 > 服务器 > 小升级”合并成一次反馈，不叠播。

## 9. “瓶颈解除”严格触发合同

Stage3已有真实瓶颈分析，会模拟电力、算力卡、光模块和存储升级后的收入变化。反馈必须使用升级命令前后的真实状态：

```yaml
show_capacity_boost_when:
  - command_success: true
  - income_after_gt_income_before: true
  - upgraded_item_was_current_bottleneck: true

show_bottleneck_shift_when:
  - bottleneck_id_after_ne_bottleneck_id_before: true
  - income_after_gt_income_before: true

show_bottleneck_resolved_when:
  - effective_efficiency_before_lt_1: true
  - effective_efficiency_after_eq_1: true

never_show_resolved_when:
  - 只是算力卡增加总算力但有效效率未提高
  - 存储只增加工程奖励而没有即时收入增量
  - projected_income_gain_eq_0
```

文案分级：

- 有真实收入增量但效率没解锁：`产能提升 · 收入 +X/秒`；
- 瓶颈发生真实转移：`当前瓶颈已转移：电力 → 光互联`；
- 真实达到100%：`瓶颈解除 · 有效效率 63% → 100%`。

## 10. 中期投资可发现性

### 10.1 审计答案

1. 手机首屏目前不能稳定扫到所有主要投资项；Stage2购服和宇宙节点尤其容易落在下方。
2. Stage3四设施已经2×2，无需“改成2×2”；应把每卡最小高度从当前约174px压缩到约112–132px，并折叠长说明。
3. 所有真实可升级项应有稳定亮态，并在首次进入可购买态时短促高亮一次。
4. 钱够后需要首屏“现在可投入”摘要，但不复制第二个执行按钮。
5. 确实存在需要滚动较远才能找到可买项目：下一服务器、Stage3明细、Stage4/5节点。
6. 常驻与折叠规则见下。

### 10.2 首屏“现在可投入”摘要

在算力引擎下增加一条不执行经济命令的摘要：

```text
现在可投入 3 项 · 推荐：算力卡 Lv.0 → Lv.1 · 预计 +¥4.19万/秒
```

点击只滚动/聚焦现有真实按钮，不复制购买命令。优先级：待领取奖励 > 阶段入口 > 当前瓶颈 > 下一服务器/节点 > 模型研发 > 普通训练/设施。

### 10.3 页面顺序与折叠

- Stage1：保留模型→订单→服务器；
- Stage2自动化后：模型摘要→服务器投资→聚合订单摘要；不改变功能，只改变现有区块顺序；
- Stage3：模型紧凑摘要→当前瓶颈→2×2设施→机房→当前工程→已完成历史；
- Stage4/5：身份/算力引擎→节点2×2→当前工程；
- 永不折叠：可执行按钮、成本、缺失门槛、当前工程进度、待领取奖励；
- 默认折叠：自动化后的模型长说明、训练详细预览、已拥有服务器完整说明、设施长描述、已完成机房/工程历史；
- 折叠状态仅是会话UI状态，不进入存档Schema。

### 10.4 可购买态边沿

```yaml
source: 现有按钮enabled或对应canBuy/canUpgrade
edge: false_to_true
entry_animation:
  duration: 600ms
  effects: [边缘提亮, 按钮单次亮扫, 可升级小圆点]
steady_state:
  animation: none
  effects: [稳定高对比边框, 可升级标签]
replay_condition: 先重新变为false，之后再次false_to_true
aria: 保持原生disabled与aria-disabled，不发送每帧live-region消息
```

## 11. 挂机5分钟的“生命感”

玩家不点击时应持续看到：

- 算力引擎以3.5–6秒墙钟周期运行；
- 资金和累计营业收入以可读频率持续增加；
- 真实活跃订单/旗舰/地月/戴森工程进度继续推进；
- 服务器/节点已部署状态灯以6–8秒低频呼吸；
- 偶发数据点沿核心环移动，但常驻粒子不超过10；
- 可购买态首次出现时播放一次600ms提示，之后安静；
- 不自动播放音效，不逐订单弹字，不让背景全屏移动。

这能传达“系统正在运行”，又不会把挂机游戏变成持续高刺激界面。

## 12. 离线回归反馈

现有回执已经拥有离线时长、有效结算、阶段上限、超出时长、资金、研发、工程等事实。推荐重新组织为：

```text
离线经营 7小时42分
有效结算 6小时 · 超出1小时42分未计入

资金：¥12亿 → ¥184亿
总算力：保持 6.38万（离线不自动购买）
研发进度：+18%
地月一体化算力网：42% → 57%

领取后可投入：3项
最近目标：地月激光链路，还差 ¥X
经营赞助 ×2：已计入（如真实生效）
```

产品规则：

- 领取前展示“当前资金→领取后资金”，由真实当前资金与待领取奖励计算；
- 离线不会自动买服务器/设施/节点，算力不变时必须写“保持”，不能伪造增长；
- 可投入项数使用“领取后资金”对现有真实成本做只读判断；
- 工程、研发只显示真实离线推进；
- 回执入场1.2秒，领取后资金上冲1.0秒；不全屏，不新增广告按钮；
- 9+9次广告与24小时覆盖合同保持不变。

## 13. CSS、轻资源与拒绝项

### 13.1 完全可以用CSS/DOM/SVG完成

- 算力引擎1–3层环、轨道线、节点灯、中心核；
- conic/radial gradient、transform旋转、opacity呼吸、局部box-shadow；
- 固定对象池粒子；
- 数量级色阶与收入字重/辉光；
- 可购买态边沿、卡片稳定亮态、低频状态灯；
- 收入跃迁卡、瓶颈释放冲击波；
- Stage2区块重排、Stage3紧凑2×2；
- 离线回执重排；
- 地月轨道闭环、戴森能量汇聚。

### 13.2 Level B序列帧候选

只保留两个非必需候选：

1. 第一服务器启动；
2. 奇点核心入库（可与机房投产共用能量启动语言，不再单独做第三套）。

推荐格式：透明WebP sprite sheet，单帧256×256，12–15fps，16–20帧，时长1.2–1.5秒，单资源≤400KB，解码后单次峰值≤8MB，任何时刻最多播放1个。若CSS/SVG验收已足够，则不生产。

### 13.3 明确拒绝

- 常驻GIF、视频背景或每阶段一套视频；
- 每Tick闪钱、数字滚轮永不停止、全屏频闪；
- 每个订单弹字/音效；
- 超过16个并发粒子或无上限DOM粒子；
- 大面积blur/filter持续动画；
- 256×调试倍率同步加速视觉或音效；
- 大量新美术作为本轮成立前提；
- 为表现引入新资源、任务、随机事件、小游戏或广告位。

## 14. 移动端性能预算

```yaml
performance_budget:
  persistent_animation:
    prefer: [CSS_transform, CSS_opacity, local_box_shadow, conic_gradient]
    avoid: [layout_reflow, full_screen_filter_animation, per_frame_DOM_rebuild]
    animated_dom_nodes_max: 20

  particles:
    max_count_total: 16
    persistent_max: 10
    burst_max: 8
    pool_reuse_required: true
    concurrency_rule: burst 从同一 16 节点共享池借用，任何时刻总并发不得超过 16

  animation_fps_target:
    target: 60
    acceptable_low_power_floor: 30
    p95_main_thread_frame_budget: 20ms

  DOM_growth:
    forbidden: true
    core_node_count_stable: true

  sprite_animation:
    max_simultaneous: 1
    frame_size_max: 256x256
    frames_max: 20
    fps_max: 15
    compressed_size_each_max: 400KB
    decoded_peak_each_max: 8MB

  background_effect:
    pause_when_hidden: true
    no_catch_up_animation_on_resume: true

  prefers_reduced_motion:
    supported: true
    behavior: 静态环与颜色/数字变化；禁旋转、粒子、冲击波和滚动计数

  review_speed:
    simulation_speed: 1x_to_256x
    visual_wall_clock_speed: 1x_fixed

  battery_heat:
    must_be_considered: true
    default_profile: conservative
    no_device_capability_guessing: true
```

真机验收至少覆盖iPhone Safari/TapTap容器与一台中端Android WebView/Chrome；页面隐藏60秒后无持续视觉计时器增长，恢复不补播；1×、32×、256×下视觉周期差≤5%。

## 15. 实施级别

### Level A：必须做

| item | player_value | implementation_cost | runtime_risk | mobile_risk | recommended |
|---|---|---|---|---|---|
| 真实算力引擎与八档形态 | 挂机也能看见帝国运行和规模提升 | 中 | 低 | 低，固定DOM/CSS | 是 |
| 收入数量级与事件跃迁 | 购买后立即感到“更值钱” | 中 | 低 | 低 | 是 |
| “现在可投入”摘要 | 钱够后立刻找到动作 | 中 | 低 | 低 | 是 |
| 可购买false→true一次性提示 | 消除按钮藏得深的错失 | 低 | 低 | 极低 | 是 |
| Stage2顺序与Stage3紧凑矩阵 | 减少下滚和扫描成本 | 中 | 中，需防DOM回归 | 低 | 是 |
| 真实瓶颈释放反馈 | 把Stage3策略变成爽点 | 中 | 中，必须严格判真 | 低 | 是 |
| 离线回执重排与领取上冲 | 回归时感到公司暴涨 | 中 | 低 | 低 | 是 |
| 页面隐藏/低动效/粒子上限 | 控制耗电、发热和恢复异常 | 中 | 低 | 正向 | 是 |

### Level B：建议做但不上线门

| item | player_value | implementation_cost | runtime_risk | mobile_risk | recommended |
|---|---|---|---|---|---|
| 第一服务器启动序列帧 | 首个资产跃迁更有记忆点 | 中 | 中 | 中，需解码预算 | 条件式 |
| 奇点核心入库序列帧 | 三轮长期资产更有仪式感 | 中 | 中 | 中 | 条件式 |
| 更复杂粒子层 | 提升大节点冲击 | 中 | 中 | 中高 | 仅真机余量充足时 |

### Level C：不上线前做

| item | player_value | implementation_cost | runtime_risk | mobile_risk | recommended |
|---|---|---|---|---|---|
| 大量动画视频/GIF | 短期吸睛但不改善可操作性 | 高 | 高 | 高 | 否 |
| 常驻高频粒子/全屏背景流 | 容易疲劳 | 中 | 高 | 高 | 否 |
| 每订单弹字和音效 | 高频噪声 | 中 | 高 | 中高 | 否 |
| 新交互小游戏/随机事件 | 偏离本轮目标 | 高 | 高 | 中 | 否 |
| 新数值或假算力 | 语义风险，无真实产品价值 | 中 | 极高 | 低 | 否 |

## 16. 十个最终问题的直接回答

1. **5分钟不点击如何仍感觉在运行？** 统一算力引擎低频运行、资金可读更新、真实工程条推进、节点状态灯呼吸；可购买态只在进入时提示一次。
2. **怎样让1算力到高规模明显不同？** 当前真实地球范围不是几十亿，而是约0–6.38万；用T0–T5真实阈值改变环数、辉光和密度，Stage4/5用真实节点/阶段覆盖T6/T7，绝不伪造几十亿算力。
3. **钱够后如何立即知道能点？** 现有enabled边沿驱动一次性亮扫，并在首屏显示“现在可投入N项”，点击滚动到原按钮。
4. **怎样强化购买而不疲劳？** 只有成功动作导致真实before/after变化时播放0.35–1.6秒反馈；普通Tick无闪烁，大事件合并而不叠播。
5. **Stage2/3是否应该更平铺？** 它们已经2×2。Stage2应提前服务器区，Stage3应压缩卡片、折叠长说明并保留瓶颈常驻。
6. **哪些可完全CSS完成？** 算力核心、环/节点/粒子、色阶、进度、可购买态、收入跃迁、瓶颈冲击、区块重排和离线回执均可。
7. **哪些值得序列帧？** 只有第一服务器和奇点核心是可选候选；都不是上线门。
8. **哪些绝对不做？** 常驻视频/GIF、高频粒子、每Tick闪烁、订单逐条弹字/音效、调试倍率加速视觉、假算力。
9. **会不会影响手机性能？** 按固定DOM、最多16粒子、transform/opacity、隐藏暂停和reduced-motion合同实现，风险低；仍需iPhone与Android真机专项验收。
10. **上线前实际做什么？** 只做Level A；Level B在Level A真机性能通过且仍有时间时单独批准，Level C不做。

## 17. 风险与未知

```yaml
known_risks:
  - Stage4/5旧顶部算力口径容易被误读，必须改为地球基底算力
  - 如果核心放进sticky header会进一步压缩小屏，合同已禁止
  - 如果可购买提示不复用现有enabled，会再次产生状态不同步
  - 如果每帧更新DOM或动态创建粒子，会放大手机发热

unknown:
  - Level A在TapTap iOS真容器与中端Android上的实际p95帧耗与温升
  - 72到88px算力引擎在320/350宽度的最佳最终高度
  - 玩家对T4/T5规模突破的主观强度是否足够
  - Level B序列帧是否值得生产；不影响Level A实施

product_decision_required: false
```

## 18. 最终回报

```yaml
task_id: COMPUTE_TYCOON_H5_FINAL_FEEL_AND_INTERACTION_AUDIT_01
result: READY_FOR_FINAL_FEEL_IMPLEMENTATION

recommended:
  level_a:
    - 真实算力引擎与八档视觉阶梯
    - 收入数量级和真实before_after跃迁
    - 现在可投入摘要与enabled边沿提示
    - Stage2顺序及Stage3紧凑2x2
    - 真实瓶颈释放
    - 离线回归强化
    - 生命周期与移动端性能保护
  level_b:
    - 第一服务器启动序列帧（条件式）
    - 奇点核心入库序列帧（条件式）
  level_c:
    - 大量视频或GIF
    - 常驻高频粒子
    - 每Tick或每订单高刺激反馈
    - 新玩法与假算力

compute_visualization:
  source_real_metric: 地球总算力；宇宙阶段附加真实节点倍率与工程进度
  tiers: [待机, 微型, 工作室级, 集群级, 机房级, 区域级, 地月级, 恒星级]
  persistent_effect: 3.5到6秒墙钟周期的低频环与固定粒子
  milestone_effect: 0.35到3秒、只在真实事件成功后触发

actionability:
  four_infrastructure_layout: 保留现有2x2并压缩卡片
  affordable_state: 复用现有enabled和canBuy
  pulse_contract: false_to_true只播一次600ms
  navigation_changes: 0；只调整经营页区块顺序与滚动锚点

media:
  css_only: Level_A全部成立
  sprite_candidates: [第一服务器, 奇点核心]
  rejected_heavy_media: true

performance:
  mobile_budget: 固定DOM；最多16粒子；最多1个序列帧；目标60fps
  reduced_motion: required
  background_pause: required

implementation_plan: docs/product/COMPUTE_TYCOON_FINAL_FEEL_IMPLEMENTATION_PLAN_20260809.md

actions:
  code_changes: 0
  economy_changes: 0
  save_changes: 0
  ad_contract_changes: 0
  builds: 0
  deployments: 0
```

## 19. Source index

- `src/economy/viewmodel.ts`
- `src/economy/engine.ts`
- `src/economy/stage3.ts`
- `src/economy/stage4.ts`
- `src/economy/stage5.ts`
- `src/ui/render.ts`
- `src/styles/main.css`
- `src/app/main.ts`
- `src/audio/game-audio.ts`
- `src/review/checkpoints.ts`
- `src/review/endgame-checkpoints.ts`
- `evidence/review/screenshots/matrix/`
- 负责人2026-08-09 TapTap真机反馈截图与本审计工单
