# 发布与维护计划（Release and Maintenance Plan）

> 面向公开镜像仓库 `compute-tycoon-i18n`。首版版本号待最终状态确定：`v0.9.0`（如首个公开版本定位为接近发布候选的预览）或 `v1.0.0-rc.1`（沿用生产仓库当前候选版本号）；二者选一，由首个公开基线的内容与治理裁决决定。

## 1. 版本策略

### 1.1 首版决策

- 生产仓库当前候选为 `1.0.0-rc.1`（私密发布候选，非公开发行版），见 `docs/release/H5_RELEASE_NOTES_1.0.0_RC1.md`。
- 公开首版有两种可选命名，二选一并在发布时锁定：
  - `v0.9.0`：强调"公开预览、尚未正式发行"，适合公开内容仍带部分未闭合门禁（如云存档/排行榜在 Production 默认关闭）的阶段；
  - `v1.0.0-rc.1`：沿用生产候选版本号，强调"与生产候选同源"。
- 决策依据：首个公开基线的完整度、真机/平台门禁的闭合状态、以及 Human Product Owner 对"公开预览"或"候选同源"定位的裁决。
- 无论选择哪个号，`docs/release/H5_RELEASE_CANDIDATE_CHECKLIST.md` 中的门禁（真机舒适度、TapTap 真容器广告/云档/榜单验证）在公开发行前均需明确标注状态。

### 1.2 语义化版本（SemVer）

- `MAJOR.MINOR.PATCH`（`v1.0.0`、`v1.1.0`、`v1.0.1`）。
- 公开仓库建立后：
  - `MAJOR`：玩法/产品合同级不兼容变更（如新增阶段、改变核心循环）；
  - `MINOR`：兼容的新功能（如新的里程碑、表现层升级）；
  - `PATCH`：缺陷修复、文档修正、构建/测试修复。
- 产品合同的变更属于 `MAJOR` 或需 Human Product Owner 明确裁决的变更，见 `docs/ai-development/02_PRODUCT_GOVERNANCE.md`。

## 2. 维护节奏

- **代码提交**：公开仓库内小步提交；每个提交对应单一任务/单一验收（见 `docs/ai-development/04_DEVELOPMENT_WORKFLOW.md`）。
- **版本发布**：建议按里程碑节奏，不设固定天数；每次 `MINOR`/`MAJOR` 前完成一轮完整验证（typecheck + unit + build + 必要模拟）。
- **证据快照**：每次发布把验证结果（测试数、构建产物、模拟结论）记入版本发布说明，作为该版本的证据基线。
- **依赖更新**：跟随 `package.json`/`package-lock.json` 更新；升级后必须重跑完整验证。
- **文档维护**：治理文档（`docs/oss/`、`docs/ai-development/`）随流程变化持续更新；产品合同以 Human Product Owner 裁决为准。

## 3. Issue / PR 处理

### 3.1 原则

- 公开仓库对社区开放 issue/PR；但**产品方向裁决权属于 Human Product Owner**（见 `docs/ai-development/02_PRODUCT_GOVERNANCE.md`），社区建议不自动改变产品合同。
- 单任务、单负责人、单一验收标准适用于所有社区贡献（见 `docs/ai-development/04_DEVELOPMENT_WORKFLOW.md`）。

### 3.2 Issue 流程

- 分类：`bug`、`enhancement`、`question`、`docs`、`security`。
- `bug`：需附复现步骤与运行环境；修复前先写失败用例（若代码库既有模式支持）。
- `enhancement`：先讨论产品影响；可能改变产品合同的一律升级到 Human Product Owner 裁决。
- 响应时限（尽力而为）：`security` 优先处理；其余按维护者可用时间轮转。

### 3.3 PR 流程

1. PR 必须描述：改了什么、为什么、验证了什么（tests/模拟/构建）。
2. CI 门禁（见第 5 节）全部通过才可合并。
3. 涉及产品合同的 PR 需 Human Product Owner 书面同意。
4. 合并采用 squash 或常规合并均可，但需保持提交说明清晰；不重写公开基线之前的历史。

## 4. 安全披露流程

- **报告入口**：公开仓库 issue 中使用安全标签；敏感内容请通过私密渠道（占位：`security@<domain>` 或 GitHub 私密报告功能，按实际配置）。
- **处理时限**：确认后优先修复并发布 `PATCH`；在修复版本可用前不公开细节。
- **范围**：`src/` 运行时逻辑、存档校验（`src/save/`）、平台适配（`src/platform/`）、依赖漏洞。
- **存档安全**：存档采用高精度字符串与 schema 校验；收到"损坏存档/越权档"类报告时按 `docs/SAVE_CONTRACT.md` 的校验语义复核。
- **披露原则**：先修复、后公告；公告中说明影响范围、修复版本与缓解措施，不含利用细节。

## 5. CI 计划

公开仓库 CI 只运行**无 secrets** 的作业，与脱敏策略一致（见 `docs/oss/OSS_SCOPE_AND_SANITIZATION.md`）：

| 作业 | 命令 | 说明 |
|---|---|---|
| typecheck | `npm run typecheck` | TypeScript 全量类型检查 |
| unit | `npm test` | `tests/unit/` 单元测试（当前基线 31 个文件、370 项） |
| build | `npm run build` | 生产构建（含 `tsc` + `vite build`） |
| e2e（可选作业） | `npm run e2e` | `tests/e2e/` 完整循环（jsdom 驱动） |
| 经济模拟（可选作业） | `npm run simulate` | `scripts/simulate-economy.ts` 节奏模拟（8 策略 × 1000 局，耗时较长，可按需触发） |

- **不含 secrets**：CI 不读取任何密钥、平台凭证、应用/开发者/广告位 ID；需要平台能力的构建（`build:platform-review`、云档/榜单/广告验证）不属于公开 CI。
- 浏览器矩阵与 soak（如 `evidence/review/`、`evidence/release/`）不在 CI 默认运行，由维护者按发布需要本地执行。
- 环境：Node/npm 版本以 `package.json` 声明为准；CI 结果记录到 PR 作为合并依据。
