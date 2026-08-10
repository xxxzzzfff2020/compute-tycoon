# 算力大亨（Compute Tycoon）

> 一款开源的增量经营（Incremental / Idle）H5 游戏——同时是一份可复现的「AI Agent 驱动游戏开发 + 人类产品治理」工程案例。

**《算力大亨》** 是完整可玩的 H5 挂机经营游戏：从个人 AI 工作室起步，把一家小工作室经营成行星尺度的算力帝国。它也是一个参考实现：产品合同、AI 分工、代码、自动测试、经济模拟、真机 QA、广告/云能力适配、发布流程全部公开、有文档、可从干净克隆复现。

**在线试玩：** https://xxxzzzfff2020.github.io/compute-tycoon/

---

## 游戏内容

从一家 AI 工作室开始，研发模型、接算力订单。从第一台服务器到服务器集群，再到带机房与旗舰工程的算力中心；通过技术迭代（Prestige）保留永久进度、收集奇点核心，最终解锁终局：

`AI 工作室 → 模型研发 → 自动接单 → 第一台服务器 → 服务器集群 → 算力中心 → 技术迭代 → 地外算力计划 → 地月算力网 → 戴森算力球`

- **语言：** 简体中文（默认）与英文，游戏内可切换，偏好独立于存档保存
- **离线收益：** exactly-once 离线回执，分阶段离线上限
- **存档安全：** 版本化 localStorage 存档、校验、导出/导入、幂等领取
- **技术栈克制：** TypeScript + Vite + Vitest + decimal.js，DOM 优先渲染

## 功能特性

- 6 个职责模型：研发、训练、永久图鉴被动
- 手动接单 → 自动经营解锁 → 高吞吐服务器集群
- 8 台服务器 → Stage 2 结算 → 算力中心（电力 / 算力卡 / 光模块 / 存储）
- 3 座机房 + 3 个旗舰工程，科技档案与集群蓝图
- 技术迭代（永久倍率 ×1.5 / ×2.0 / ×2.0）
- 奇点核心（3 枚）→ 地外算力计划揭示 → Stage 4 地月算力网 → Stage 5 戴森算力球
- 荣誉馆 / 档案馆：模型、蓝图、科技、纪元、核心、成长史、排行榜
- 平台适配层：激励视频、云存档、排行榜——运行时注入、安全降级
- 完整 i18n 层（`src/i18n/`），每个语言 760+ 键

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript |
| 构建 | Vite |
| 测试 | Vitest（单元）+ jsdom/Puppeteer（E2E） |
| 数值 | decimal.js |
| 图标 | lucide |
| 存档 | localStorage，版本化 Schema + 校验 |
| 平台 | TapTap 运行时 `tap` 对象适配（广告 / 云存档 / 排行榜） |

## 快速开始

```bash
npm install
npm run dev          # 本地开发
npm test             # 单元测试（Vitest）
npm run e2e          # 浏览器 E2E（新档 → 迭代全流程）
npm run typecheck    # TypeScript 检查
npm run build        # 生产构建 → dist/
npm run simulate     # 经济模拟（8 策略 × 1000 局）
```

需要 Node.js 20+ 与 npm。核心游戏构建/运行不需要任何平台账号；TapTap 能力在运行时可选。

## 架构

- `src/app/` — 启动、会话、命令路由、评审/开发入口
- `src/core/` — 时间、大数工具
- `src/data/` — 产品合同内容（模型、订单、服务器、Stage 3+）
- `src/economy/` — 规则引擎、ViewModel、离线结算、奇点/Stage 4/5
- `src/save/` — 存储、Schema 校验、迁移、仓储
- `src/ui/` — DOM 渲染（无 Canvas 主 UI）、final-feel 层
- `src/i18n/` — 语言字典与运行时（zh-CN / en-US）
- `src/platform/` — TapTap 适配（广告、云存档、排行榜）
- `src/audio/` — BGM 控制器
- `src/review/` — 隔离的创始人集中评审运行时（独立构建）
- `scripts/` — 模拟、浏览器验证、发布工具
- `tests/` — 单元 + E2E（379+ 单元测试）

## AI 开发工作流

本项目是 **AI Agent 驱动游戏开发的案例研究**，完整文档在 `docs/ai-development/`：

- `01_OVERVIEW.md` — AI 与人类如何协作
- `02_PRODUCT_GOVERNANCE.md` — 产品合同作为事实源
- `03_AGENT_ROLES.md` — PM / 编码 / 测试 / 评审角色
- `04_DEVELOPMENT_WORKFLOW.md` — 一事一主一验收标准
- `05_EVIDENCE_DRIVEN_QA.md` — 为什么「测试通过 ≠ 体验通过」
- `07_CODEX_WORKFLOW.md` — Codex 在项目中的真实作用
- `AI_GAME_STUDIO_PRINCIPLES.md` — 可复用的 AI 工作室原则

**分工原则：** AI 负责代码实现、测试编写、经济模拟、确定性 QA 与发布准备；人类负责产品方向、玩法判断与最终体验门。项目不宣称「全自动 AI」——这是真实、证据驱动的协作。

## 测试

- **单元（379 个）：** 经济规则、存档/迁移、离线 exactly-once、Stage 3–5、平台适配、i18n 验收
- **E2E：** 新档 → 第一次技术迭代全流程（jsdom/Puppeteer）
- **经济模拟：** `npm run simulate`——8 策略 × 1000 局
- **评审检查点：** 隔离状态机检查点，供人工体验评审
- **证据驱动 QA：** 浏览器矩阵、运行时 soak、存档往返——见 `docs/reports/`

## 国际化

- 字典：`src/i18n/zh-CN.ts`、`src/i18n/en-US.ts`（键集一致，测试强制）
- 运行时：`src/i18n/index.ts`——语言检测、持久化、插值、Intl 数字/百分比
- 术语冻结于 `docs/i18n/TERMINOLOGY.md`（如 算力 = Compute Power、技术迭代 = Technology Iteration）
- 玩家可见字符串禁止硬编码在 `src/i18n/` 之外（见 `AGENTS.md`）
- 英文为自然游戏英语，非逐字翻译

## 文档

- `docs/PRODUCT_CONTRACT.md` — 产品合同与数值来源
- `docs/ECONOMY_SIMULATION.md` — 经济模拟方法与结果
- `docs/SAVE_CONTRACT.md` — 存档 / 离线 / 幂等契约
- `docs/ai-development/` — AI Agent 开发案例研究
- `docs/oss/` — 开源范围、安全审计、许可审计、发布计划
- `docs/platform/` — 平台能力审计
- `docs/release/` — 发布说明与检查清单

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。欢迎提 issue 与 PR。请把玩家可见文案放入 i18n 字典，并尊重产品合同（`docs/PRODUCT_CONTRACT.md`）——玩法/经济改动需先经过设计讨论。

## 安全

见 [SECURITY.md](SECURITY.md)。仓库经脱敏 OSS 镜像发布：`store-materials/`（商店物料）与内部评审 URL 已排除；仓库不含任何凭据。

## 许可

代码：MIT（见 [LICENSE](LICENSE)）。`public/assets/` 中的媒体资产（主视觉、BGM）为项目自有，但**不**随代码许可授权——详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md`。

## 路线图

- [ ] 日语 / 韩语 / 繁体中文
- [ ] 社区内容挂钩
- [ ] Webhook 驱动的 issue/PR 分流自动化
- [ ] GitHub Actions 发布自动化

*路线图只反映当前意图，不构成承诺。*
