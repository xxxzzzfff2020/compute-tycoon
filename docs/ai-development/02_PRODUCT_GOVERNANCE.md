# 产品治理（Product Governance）

> 规则：**产品合同为准**。产品方向、范围与验收结论由人类 Product Owner 裁决，AI 不得擅自改变产品方向。

## 1. 产品事实源

产品相关的一切决策以两份合同为事实源：

| 文档 | 地位 |
|---|---|
| `docs/PRODUCT_CONTRACT.md` | 历史工程合同（Stage 1–3 + 迭代的原始权威）；保留供追溯 |
| `docs/product/H5_FINAL_PRODUCT_CONTRACT.md` | **Release Candidate 权威产品合同**：玩家规则、节奏、广告、成就与平台开关统一以此为准；与旧合同冲突处不恢复旧口径 |

相关工程契约（存档、经济）独立成文：

- `docs/SAVE_CONTRACT.md`：存档 schema、命名空间、校验与迁移语义。
- `docs/ECONOMY_SIMULATION.md`：经济模拟方法与节奏目标门。

## 2. Human Owner 产品裁决

- **裁决范围**：玩法范围（含/不含某系统）、节奏目标、广告/云档/排行榜的开放开关、迭代次数与终局边界、是否进入公开发布。
- **裁决形式**：
  - 产品合同更新（需显式修改 `docs/product/H5_FINAL_PRODUCT_CONTRACT.md`）；
  - 范围裁决记录（如"云存档、轻量成就、轻量排行榜属于后续计划"、"排行榜必须等待云端权威校验/防篡改前置成立后再开放"等既有裁决）；
  - 集中评审结论（见第 4 节）。
- **AI 的角色**：只做"把产品意图翻译成合同条目、实现、验证"，不做产品意图的创造者；遇到歧义先问，不猜。

## 3. AI 不得擅自改产品方向

- 已冻结方向（如：6 个首发模型、禁止随机事件/签到/新货币/第四次迭代/戴森后无限解锁、广告仅两类自愿激励视频）不可由 AI 单方面变更。
- 改变产品合同的代码/设计必须先获得 Human Product Owner 书面同意，再以合同更新为先导实施。
- "体验优化"若实际改变规则（数值、节奏、奖励语义），同样落入产品裁决范围。
- 历史上此类边界被强制执行（如 H5 重建时"只提取产品合同与体验参考，不复制 Lua 代码；Lua 工程修改不在范围"），公开仓库继续沿用。

## 4. 验收门（真人验收）

- **创始人集中评审**：`docs/product/H5_FOUNDER_CONCENTRATED_REVIEW_GUIDE_20260801.md` 定义评审方式（A–J 检查点、独立存档命名空间、1× 真实节奏评价）与五个评审问题（核心循环趣味、阶段尺度变化、奖励感、长期动力、是否批准后续规划）。
- **终局集中复验**：`docs/product/endgame/COMPUTE_TYCOON_ENDGAME_CONCENTRATED_REVIEW_GUIDE_V9.md` 等终局文档定义 Stage 4/5 与永续模式的验收口径。
- **真机/平台门**：真机舒适度、TapTap 真容器广告回调、云档双设备恢复、双榜验证等（见 `docs/release/H5_RELEASE_CANDIDATE_CHECKLIST.md`）。
- **语义**：自动化证据通过 ≠ 真人通过；`evidence_boundary` 一贯明确标注 "NOT_HUMAN_PASS / NOT_DEVICE_PASS / NOT_RELEASE_PASS"。未通过真人验收门的内容不构成发布候选。

## 5. 冲突处理

- 旧文档与权威合同冲突 → 以 `docs/product/H5_FINAL_PRODUCT_CONTRACT.md` 为准，并在旧文档保留"已被取代"的历史标注（本项目已如此处理 `docs/PRODUCT_CONTRACT.md` 与 `docs/CODEX_HANDOFF.md`）。
- 代码与合同冲突 → 修代码，不改合同；确需改合同 → 走 Human Product Owner 裁决。
- 多个 AI 角色结论冲突 → 以证据与合同为准（见 `docs/ai-development/05_EVIDENCE_DRIVEN_QA.md`），无法裁决时提请 Human Product Owner。
