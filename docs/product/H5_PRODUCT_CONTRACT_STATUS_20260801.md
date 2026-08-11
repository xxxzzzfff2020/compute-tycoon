# H5 产品合同状态｜2026-08-01

> **Historical audit:** 本文是 2026-08-01 的点时状态，不是当前发布状态。当前公开版本以 `CHANGELOG.md` 和 GitHub Releases 为准。

## 当前状态

```yaml
task_id: H5_PRODUCT_CONTRACT_AND_CURVE_RECONCILIATION_01
product_status: READY_FOR_CONCENTRATED_HUMAN_REVIEW
engineering_status: REVIEW_CANDIDATE
human_review_status: PENDING
device_status: NOT_TESTED
release_status: NOT_RELEASE_CANDIDATE
scope_expanded: false
```

这表示产品合同、工程主链、生产构建、自动化、迁移和标准经济曲线已经达到集中真人复核门槛；不表示真人、真机或发布通过。

## 已冻结合同

| 合同项 | 正式结论 | 状态 |
|---|---|---|
| 首发模型数 | 恰好 6 个；7–8 个后置，不进入本候选 | ACCEPTED |
| 模型职责 | 基础收益、处理速度、高价值业务占比、自动经营效率、研发速度、旗舰效率各一项 | ACCEPTED |
| 模型获取 | 研发进度满 100 后免费；重复转对应模型图鉴等级；只允许一个当前主力 | ACCEPTED |
| Stage 3 唯一入口 | 8 服 → Stage 2 exactly-once 结算 → 算力中心筹建 → Stage 3 | ACCEPTED |
| 旧中心网关 | 退出 UI、命令、倍率和正式运行路径；仅保留旧档读取兼容 | ACCEPTED |
| 存储 | 只提高旗舰最终资金奖励和资金/研发共享离线上限 | ACCEPTED |
| 光模块 | 继续负责有效吞吐、收入转化和旗舰处理速度 | ACCEPTED |
| 标准曲线 | 首服 8:02；8 服 28:50；机房 2 49:28；机房 3 约 71 分；迭代约 81 分；二轮首服 1:13 | ACCEPTED |
| 第一次迭代 | 永久 ×2、3 单自动化、buy-max、研发 +25%；六模型档案与等级保留 | ACCEPTED |

## 黄金基线

- Stage 1 保留模型、前期订单、租赁算力、自动经营和首服里程碑。
- Stage 2 保留 1–8 服数量成长、3/8 服蓝图选择、三档吞吐表达、免费模型研发和章节结算。
- Stage 3 保留四类全局基础设施、三座机房、三项旗舰工程、四页档案馆和第一次迭代。
- 存档、离线资金、离线研发、旗舰奖励、里程碑和迭代必须 exactly-once。
- 正式页面不展示 QA 入口；QA 使用独立命名空间 `compute_tycoon_h5_dev_v1`。

## 仍冻结范围

第二/第三次技术迭代、无尽纪元、太空/银河/黑洞扩展、新货币、广告、排行、云、成就、新蓝图、7–8 号模型、新科技档案批次、新媒体资产和大型 UI/框架迁移均未获授权。

## 集中真人复核只回答

1. 首分钟是否理解模型、自动经营和服务器增长关系？
2. 3 服/8 服蓝图是否是轻决策而非学习负担？
3. Stage 3、机房投产和旗舰奖励是否形成数量级升级感？
4. 存储奖励/离线上限是否清楚，但不会被误解为工程速度？
5. 第一次迭代是否像奖励，第二轮是否明显更快？

若上述问题不成立，返回一个产品返修包；不得用新系统、广告、成就或更多内容掩盖。
