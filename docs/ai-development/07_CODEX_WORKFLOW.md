# Codex 工作流（Codex Workflow）

> 本文只记录有证据的 Codex 实际工作，不虚构。证据来源：`docs/reports/H5_CODEX_ACCEPTANCE_20260801.md`、`docs/reports/H5_REVIEW_HARDENING_05_20260801.md`，以及 `docs/` 下的接收审计、收敛报告与发布文档。

## 1. 角色定位

Codex 在本项目中承担**审计、修复、测试、验证与发布硬化**角色（角色边界见 `docs/ai-development/03_AGENT_ROLES.md`）；不做产品裁决，结论必须基于证据。

## 2. 有证据的实际工作

### 2.1 Intake audit（接收审计）

- 对 DeepSeek 交付的 H5 候选做接收审计（`docs/audit/H5_DEEPSEEK_INTAKE_AUDIT_20260801.md`）：核对冻结合同（首发模型数 6–8、旧算力中心网关、存储作用、一周目曲线），发现"仅 4 个模型、曲线超出目标、网关未冻结"等未通过项。
- 在隔离 worktree/分支完成唯一有界修复后，自动化门禁与 production 浏览器闭环通过；结论仍保持"非接收基线"，把开放产品问题交回产品权威（`docs/CODEX_HANDOFF.md` 记录此历史交接）。

### 2.2 Bug diagnosis（缺陷诊断）

- 诊断并修复 R2 主线进度死锁（`docs/reports/COMPUTE_TYCOON_H5_R2_PROGRESSION_DEADLOCK_P0_01.md`）与旧档导入死锁（`docs/reports/COMPUTE_TYCOON_H5_IMPORTED_SAVE_DEADLOCK_P0_02.md`）等 P0 阻断。
- 修复旧档 R2/R3 核心事实迁移死锁、地外计划弹窗残留、Stage 4 未取得四节点即可越级等发布候选期问题（`docs/release/H5_RELEASE_NOTES_1.0.0_RC1.md`）。

### 2.3 渲染架构修复（render 架构）

- `H5_REVIEW_HARDENING_05_20260801.md` 记录渲染层硬化：评审构建入口图隔离与构建标记强制、DOM 结构事件化（full render 仅结构性事件、ticks 走局部 patch）、根节点零替换、监听器稳定、内存趋势非爆炸式。
- 修复触控目标 44px 与安全区、金额/累计收入/模型训练文案对齐、Sites 静态资产打包绑定等确定性修复（4 项）。

### 2.4 测试扩展

- 单元测试从 13 文件 / 168 项（intake 审计期）扩展到 16 文件 / 207 项（硬化期），再到 31 文件 / 370 项（发布候选清单）；覆盖经济、存档、契约、渲染、平台、终局、稳定性。
- e2e 完整循环 1/1 通过；契约类测试（`contract_reconciliation`、`model_research_contract`、`render_contract`）用于防止合同漂移。

### 2.5 经济模拟

- 8 策略 × 1000 局（共 8000 局）经济模拟：标准策略落入目标窗（首服 8:02、八服 28:50、机房 2 49:28、机房 3 约 1:11、第一次迭代约 1:21、二轮首服 1:13），失败率 0%，6 模型获取率 100% 且均有正贡献（`docs/ECONOMY_SIMULATION.md`）。
- 修正模拟时钟口径（投产红利按生产时钟仅持续 25 秒，避免 `now=0` 被误当永久 ×4）。

### 2.6 Save migration（存档迁移）

- 存档 schema 从早期版本迭代至 v6（兼容旧 v1–v5），迁移语义 exactly-once；旧 iteration 1/2/3 核心事实迁移覆盖；损坏/未来 schema 写锁、回滚与 100 轮 save/load 验证（`docs/SAVE_CONTRACT.md`、`docs/release/H5_RELEASE_CANDIDATE_CHECKLIST.md`）。

### 2.7 Release hardening（发布硬化）

- 浏览器矩阵（多视口、多引擎场景；发布候选期 320/350/390/430 宽度无横向溢出等）、高倍率 soak（256× 真实墙钟 10 分钟）、逻辑 soak、新档自然流程到戴森（27 里程碑 @256×）、三构建（Production/Platform Review/Review）隔离 Smoke 与控制台错误 0（`docs/release/H5_RELEASE_CANDIDATE_CHECKLIST.md`、`evidence/release/`）。
- 发布候选清单逐项勾选并标注负责人门（真机、TapTap 真容器广告/云档/榜单）未闭合状态。

### 2.8 Code review 与文档

- 产出接收审计、接收报告、硬化报告、终局收敛报告、迁移总结与发布收敛报告（`docs/reports/`、`docs/audit/`、`docs/release/`）。
- 维护验收基线 tag 与证据边界标注（自动化通过 ≠ 真人/真机/发布通过）。

## 3. 工作方式要点

- 独立分支/隔离 worktree，不直接改动他人主工作区；验收后合并并打基线 tag。
- 先写失败/契约测试再修复（对 P0 与合同类问题）；每个修复附验证矩阵。
- 产品问题（如模型数量、曲线目标、平台开关）上交产品权威，不自行扩大范围。
- 不虚构：本文件每条工作都能在 `docs/` 既有报告中找到对应记录。

## 4. 在公开镜像中的体现

- 公开镜像保留"方法"（测试、模拟、脚本、治理文档），不保留含内部路径/站点/账号的原始报告（见 `docs/oss/OSS_SCOPE_AND_SANITIZATION.md`）。
- 本文件描述的 Codex 工作以公开镜像内可验证的方式呈现：跑测试、跑模拟、看提交，即可复核。
