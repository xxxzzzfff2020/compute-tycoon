# 证据驱动 QA（Evidence-Driven QA）

> 本项目的质量结论来自可复现的自动化证据与受控的真人验收；任何"完成/通过"主张都必须能指到具体证据。

## 1. 证据体系总览

| 层 | 内容 | 位置 |
|---|---|---|
| 单元测试 | 31 个文件、370 项，覆盖经济、存档、契约、渲染、平台、终局等 | `tests/unit/` |
| 端到端测试 | 新档 → 首模型 → 订单 → 自动经营 → 工作室成长 → 首服 → 集群 → 结算 → 算力中心 → 迭代 → 二轮 | `tests/e2e/full-loop.e2e.ts` |
| 经济模拟 | 8 策略 × 1000 局，秒级引擎驱动，校验节奏目标门 | `scripts/simulate-economy.ts`、`docs/ECONOMY_SIMULATION.md` |
| 浏览器矩阵 | 多引擎/多视口关键场景矩阵（响应式、溢出、小目标、DOM 稳定） | `evidence/review/`、`evidence/release/` |
| soak | 高倍率真实墙钟 soak 与逻辑 soak（DOM 节点、渲染计数、内存趋势） | `evidence/release/` |
| 评审检查点 | A–J 主线检查点 + A–M 终局检查点（独立隔离命名空间） | `src/review/checkpoints.ts`、`src/review/endgame-checkpoints.ts` |

## 2. 单元测试（tests/unit）

- 按职责分文件：引擎经济（`engine`、`stage2–5`、`workshop`）、存档与迁移（`save`、`import_migration`、`offline`）、契约一致性（`contract_reconciliation`、`model_research_contract`、`render_contract`）、平台（`taptap_ads`、`platform_*`）、终局（`singularity`、`endgame_review_*`）、发布稳定性（`release_stability`、`stability_audit`）等。
- 当前基线：31 个文件 / 370 项；运行 `npm test`。

## 3. 端到端测试（tests/e2e）

- `full-loop.e2e.ts` 用 jsdom + 开发加速驱动真实 Session 与 UI，走完 Stage 1→Stage 2→Stage 3→档案馆→第一次迭代→第二轮首服。
- 运行：`npm run e2e`。

## 4. 经济模拟（scripts/simulate-economy.ts）

- 以 1 秒步长直接调用正式引擎（订单、训练、研发、服务器、蓝图、基础设施、机房、旗舰、离线、迭代），8 个冻结策略各 1000 局。
- 节奏目标门（标准策略）：首服 8–12 分钟、八服 28–36 分钟、机房 2 40–50 分钟、机房 3 58–72 分钟、第一次迭代 80–100 分钟、二轮首服 ≤ 首轮 25%。
- 结论记录于 `docs/ECONOMY_SIMULATION.md`（含 6 模型获取率 100% 与正贡献、0% 失败率等）。

## 5. 浏览器矩阵与 soak（evidence/）

- 浏览器矩阵：多引擎（Chromium/WebKit/Firefox 视可用环境）、多视口（320×568 起至桌面），检查横向溢出、根节点替换、小目标、文本裁剪、对话框/工具栏越界与控制台错误。
- soak：高倍率（如 256×）真实墙钟 10 分钟 soak、30 分钟逻辑契约 soak、100 轮 save/load、100 轮关键动作高速点击等。
- 结果 JSON 存于 `evidence/review/`（评审期）与 `evidence/release/`（发布候选期）。
- 注意：`evidence/` 默认不进入公开镜像（见 `docs/oss/OSS_SCOPE_AND_SANITIZATION.md`）；复现方法与脚本公开。

## 6. 评审检查点（src/review/checkpoints.ts A–J）

- 10 个主线检查点：A 新档开始、B 自动经营刚解锁、C 首服即将获得、D 3 台服务器与架构、E 8 台与高吞吐、F Stage 3 刚进入、G 机房 2 即将投产、H 机房 3 与旗舰工程、I 第一次迭代确认、J 第二轮与首服加速。
- 终局另有 A–M 检查点（`src/review/endgame-checkpoints.ts`）：终局新档、R1/R2/R3 时代工程与核心领取、地外计划揭示、Stage 4 地月、Stage 5 戴森、永续增长。
- 每个检查点是合法、可刷新恢复的真实存档，使用独立隔离命名空间，不碰正式档与彼此。
- 评审构建与正式构建隔离（`vite.review.config.ts`、`vite.platform-review.config.ts`），QA 控件不出现在正式入口。

## 7. 验收门语义

- 自动化证据全部通过 ≠ 真人/真机/发布通过；报告一律标注证据边界（如 "NOT_HUMAN_PASS / NOT_DEVICE_PASS / NOT_RELEASE_PASS"）。
- 真人门：创始人集中评审（`docs/product/H5_FOUNDER_CONCENTRATED_REVIEW_GUIDE_20260801.md`）与终局集中复验。
- 平台门：真机舒适度、TapTap 真容器广告回调、云档双设备恢复、双榜验证（见 `docs/release/H5_RELEASE_CANDIDATE_CHECKLIST.md`）。
- 发布门：发布候选清单全部通过且 Human Product Owner 批准，才可公开发行。
