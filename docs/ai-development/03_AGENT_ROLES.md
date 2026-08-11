# 角色分工（Agent Roles）

> 本项目由多个 AI 角色与人类角色协作。本文定义各角色的职责与边界；越界行为由 Human Product Owner 纠正。

## 1. 角色一览

| 角色 | 载体 | 职责 |
|---|---|---|
| 总执行 Agent | Cindy | 任务规划、调度、整合与交付 |
| 文本/代码 Worker | DeepSeek | 按规格产出代码与文本 |
| 审计/修复/测试 Agent | Codex | 审计、缺陷诊断、测试扩展、浏览器验证 |
| Human Product Owner | 人 | 产品裁决与最终验收 |

## 2. 总执行 Agent（Cindy）

- **职责**：
  - 拆解任务为单任务/单负责人/单一验收标准（见 `docs/ai-development/04_DEVELOPMENT_WORKFLOW.md`）；
  - 编排 Worker 与审计 Agent，维护进度与文件事实（planning 文件、报告）；
  - 汇总证据，向 Human Product Owner 提交验收结论。
- **边界**：不擅自改变产品方向（见 `docs/ai-development/02_PRODUCT_GOVERNANCE.md`）；产品裁决必须上交给人类。

## 3. 文本/代码 Worker（DeepSeek）

- **职责**：按既定合同与规格完成文本撰写与代码实现（如 H5 的 Stage 1–3 主链实现、文档初稿）。
- **模式约束**：**纯文本工作模式，禁止视觉输入**；工作交付以代码、文档、测试结果等文本形式为准。
- **边界**：不负责产品裁决；实现与合同冲突时以合同为准；发现规格歧义时反馈总执行 Agent，不自行"补全"产品意图。

## 4. Codex（审计 / 修复 / 测试 / 浏览器自动化）

- **职责**（均有项目内证据，详见 `docs/ai-development/07_CODEX_WORKFLOW.md`）：
  - intake audit：对 Worker 交付做接收审计（如 H5 DeepSeek 接收审计）；
  - bug diagnosis：诊断 P0 阻断（如进度死锁、导入死锁、越级进入 Stage 4）；
  - 架构修复：修复渲染架构（render 架构、DOM 稳定性、构建隔离）；
  - 测试扩展：补充单元/端到端/契约测试；
  - 经济模拟：8 策略 × 1000 局节奏校准；
  - 存档迁移：schema 升级与 exactly-once 迁移验证；
  - 发布硬化：构建、浏览器矩阵、soak、发布候选清单；
  - code review 与文档：对交付做评审、产出验收与硬化报告。
- **边界**：产品裁决权不归 Codex；结论必须基于证据，不得虚构。

## 5. Human Product Owner

- **职责**：
  - 定义与冻结产品合同；
  - 裁决范围争议（含/不含某系统、开关云档/榜单/广告、是否发布）；
  - 执行真人验收门（创始人集中评审、真机舒适度、平台门禁）。
- **边界**：不替 AI 写代码；验收结论必须明确（通过/不通过/条件通过），AI 不得代签。

## 6. 协作铁律

1. 一个任务只有一个负责人、一个验收标准。
2. 结论以证据为准（测试、模拟、浏览器验证、文件事实）。
3. 产品方向只有 Human Product Owner 能改。
4. 纯文本 Worker 不接收视觉输入；视觉类验证由 Codex 浏览器自动化承担。
5. Git 与文件是事实源（见 `docs/ai-development/04_DEVELOPMENT_WORKFLOW.md`）。
