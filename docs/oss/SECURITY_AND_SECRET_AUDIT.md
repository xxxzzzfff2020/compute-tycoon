# 安全与秘密审计报告

- 审计对象：`compute-tycoon-i18n`（《算力大亨 Compute Tycoon》H5 游戏开源镜像工作树）
- 审计日期：2026-08-10
- 审计方式：只读检查（`rg` / `find` / `cat` / `git`），未修改任何源码
- 结论：**源码与脚本可安全公开；工作树内存在必须脱敏或排除的敏感信息，处理后方可公开**

---

## 1. 扫描范围

| 范围 | 说明 |
|---|---|
| 扫描目录 | 全工作树，重点：`docs/`、`scripts/`、`src/`、`public/`、`evidence/`、`store-materials/`、根目录文件 |
| 排除项 | `node_modules/`、`.git/`、`dist*`（`dist/`、`dist-review/`、`dist-platform-review/`） |
| 统计 | 未排除文件 434 个（`git ls-files` 跟踪 432 个，含未跟踪 2 个）；`store-materials/` 249 个文件、约 47 MB |
| 检索项 | API keys、OpenAI keys、TapTap 凭据、access token、OAuth secret、cookie、私密 URL、本机绝对路径、平台账号标识、git 远程、邮箱、内部路径 |

## 2. 扫描方法

1. `rg --files`（排除 node_modules/.git/dist*）枚举工作树。
2. 正则批量检索密钥类：`sk-`/`pk-` 前缀、`api_key`、`openai`、`bearer`、`client_secret`、`access_token`、`oauth_secret`、`secret_key`、`Authorization`、Slack/GitHub token 特征。
3. 检索敏感标识：本机路径 `/Users/xxxzzzfff2002/`、`chatgpt.site`、`compute-tycoon-h5-review`、`taptap.cn`、`maker.taptap.cn`、`app_id 902727`、`developer_id 415945`、`miniapp tapmcix1sdc8m7ybwj`、邮箱。
4. 复核 `src/platform/` 平台适配源码、`package.json`、`.gitignore`、`.openai/hosting.json`、vite 配置与 git 提交历史。

## 3. 发现项清单

### 3.1 必须排除：store-materials/（TapTap 发布物料与平台账号标识）

| 文件 | 类型 | 处理建议 |
|---|---|---|
| `store-materials/` 整体（249 个文件、约 47 MB） | TapTap 商店发布物料：`manifest.json`、宣传图、截图、录屏、Logo、库背景、封面、Review Pack、capture-harness | **整体排除出公开镜像** |
| `store-materials/taptap-app-<APP_ID>/manifest.json` | 平台账号标识：`app_id 902727`、`miniapp_id tapmcix1sdc8m7ybwj`、基线 commit `d5084130…` | 排除（随目录） |
| `store-materials/taptap-app-<APP_ID>/requirements/MAT_00_REQUIREMENTS.md` | 平台账号标识：`developer_id 415945` / `app_id 902727` / `miniapp_id tapmcix1sdc8m7ybwj` | 排除（随目录） |
| `store-materials/taptap-app-<APP_ID>/brand-assets/MAT_03_BRAND_ASSETS.md` | 平台账号标识：`app 902727` / `miniapp tapmcix1sdc8m7ybwj` | 排除（随目录） |
| `store-materials/taptap-app-<APP_ID>/TASK_RESULT.md` | 发布任务结果、平台状态与提交基线 | 排除（随目录） |
| `store-materials/taptap-app-<APP_ID>/copy/MAT_01_COPY.md`、`real-game-media/MAT_02_REAL_GAME_MEDIA.md`、`review-pack/REVIEW_PACK.md`、`capture-harness/RESPONSIVE_QA.md` | 发布物料说明与 QA 记录 | 排除（随目录） |

说明：该目录是 TapTap 商店上架的内部交付物，包含平台账号标识与未上线发布状态（如「H5 测试包 26462 保留」），不应进入公开仓库。

### 3.2 必须脱敏：docs/ 中的本机绝对路径（`<LOCAL_REPO_PATH>`）

| 文件 | 位置 | 类型 | 处理建议 |
|---|---|---|---|
| `docs/reports/H5_CODEX_ACCEPTANCE_20260801.md` | L10、L16-17、L105 | 本机绝对路径（repository / canonical_repository / audit_worktree） | 移除或替换为相对路径/占位符 |
| `docs/audit/H5_DEEPSEEK_INTAKE_AUDIT_20260801.md` | L21、L25 | 本机绝对路径（source_repository / audit_worktree） | 同上 |
| `docs/reports/H5_REVIEW_HARDENING_05_20260801.md` | L18 | 本机绝对路径（git_bundle 备份路径） | 同上 |
| `docs/release/H5_RELEASE_BASELINE_SNAPSHOT_20260808.md` | L6 | 本机绝对路径（canonical_repository） | 同上 |

### 3.3 必须脱敏：私密评审 URL（`<PRIVATE_REVIEW_URL>`）

| 文件 | 位置 | 处理建议 |
|---|---|---|
| `README.md` | L54 | 移除或替换为占位符 |
| `docs/product/H5_FOUNDER_CONCENTRATED_REVIEW_GUIDE_20260801.md` | L5 | 同上 |
| `docs/reports/H5_REVIEW_HARDENING_05_20260801.md` | L24 | 同上 |
| `docs/reports/H5_ENDGAME_MIGRATION_TWO_DAY_SUMMARY_20260808.md` | L11、L44、L84 | 同上 |
| `docs/reports/H5_FINAL_RELEASE_CONVERGENCE_REPORT.md` | L11 | 同上 |
| `docs/release/H5_RELEASE_BASELINE_SNAPSHOT_20260808.md` | L50 | 同上 |

说明：该域名属个人私有 Sites 部署（`.xxxzzzfff2026.chatgpt.site`），泄露会暴露内部评审入口，应整体移除或替换为 `<PRIVATE_REVIEW_URL>` 占位符。

### 3.4 建议脱敏：平台账号标识（散落于 docs/）

| 文件 | 位置 | 类型 | 处理建议 |
|---|---|---|---|
| `docs/reports/H5_FINAL_RELEASE_CONVERGENCE_REPORT.md` | L38 | Developer `<DEVELOPER_ID>` / App `<APP_ID>` / Miniapp `<MINIAPP_ID>` | 移除或替换为占位符 |
| `docs/platform/H5_PLATFORM_CAPABILITY_AUDIT_20260808.md` | L9 | Miniapp ID `<MINIAPP_ID>` | 同上 |

### 3.5 低风险/需知情：Sites 项目 ID

| 文件 | 类型 | 处理建议 |
|---|---|---|
| `.openai/hosting.json` | Sites 部署标识 `project_id: appgprj_6a6daad5…` | 非凭据，但为内部部署标识；建议与 `dist*` 一样排除或保持私有。若保留 Sites 发布能力则需自行权衡 |
| `docs/release/H5_RELEASE_BASELINE_SNAPSHOT_20260808.md` L70 | 引用 `.openai/hosting.json` 的 SHA-256 哈希 | 哈希本身非敏感；随该文件脱敏时一并处理 |

### 3.6 内部路径引用（需人工确认）

| 文件 | 位置 | 类型 | 处理建议 |
|---|---|---|---|
| `README.md` | L30 | 「目录名为中文（`H5算力大亨H5`）」引用内部仓库名 | 公开后无实际危害，建议改写为通用说明 |

### 3.7 未发现（干净项）

- `src/`：未发现硬编码密钥。平台适配（`src/platform/taptap-ads.ts`、`taptap-cloud-save.ts`、`taptap-leaderboards.ts`）为运行时 TapTap SDK 调用：
  - 广告位 ID `1054324`、云档槽名 `compute_tycoon_auto`、榜单 ID `yd5746paqa6h2d8o50` / `2mbxnvaod8pwt5wawk` 均为运行时资源标识，非凭据。
- `scripts/`：`http://localhost` / `127.0.0.1:4174` 仅为本机测试地址，无敏感信息。
- `evidence/`、`tests/`、`public/`：无密钥或账号标识命中。
- 全树未命中：OpenAI key（`sk-`/`pk-`）、API key、Bearer token、OAuth secret、cookie、邮箱、GitHub/Slack token 等凭据模式。
- 未发现指向 `maker.taptap.cn` 的 git 远程（`git remote -v` 为空）。

## 4. 处理方式（按风险分级）

| 优先级 | 事项 | 操作 |
|---|---|---|
| P0 | `store-materials/`（249 文件，47 MB） | 整体排除出公开镜像（不提交、不上传） |
| P0 | `<LOCAL_REPO_PATH>` 本机路径（4 个 docs） | 移除或替换为 `<LOCAL_REPO_PATH>` 占位符 |
| P0 | `<PRIVATE_REVIEW_URL>`（README + 6 个 docs） | 移除或替换为 `<PRIVATE_REVIEW_URL>` 占位符 |
| P1 | 平台账号标识（`<DEVELOPER_ID>` / `<APP_ID>` / `<MINIAPP_ID>` 散落 docs） | 移除或替换为占位符 |
| P1 | `.openai/hosting.json` project_id | 建议排除；如保留需确认无内部引用 |
| P2 | README 内部仓库名表述 | 改为通用表述 |

配套建议：

- 在 `.gitignore` 增加 `store-materials/`（或重新打包镜像时直接排除）。
- 公开前用以下命令自查（排除 node_modules/.git/dist*）：

```bash
rg -n '/Users/|chatgpt\.site|compute-tycoon-h5-review|902727|415945|tapmcix1sdc8m7ybwj|sk-[A-Za-z0-9]|api[_-]?key|token|secret' .
```

- 若仓库已含历史提交，注意即使当前工作树脱敏，旧 commit 中仍可能残留；必要时重写历史或使用新仓库发布。

## 5. 是否可安全公开

**结论：处理后可安全公开。**

- 游戏源码（`src/`、`public/`、`tests/`、`scripts/` 及构建配置）无硬编码凭据，平台能力均通过运行时 SDK 调用，可随公开仓库正常构建与使用。
- 不可直接公开的是发布侧材料与内部痕迹：`store-materials/`（P0 排除）、本机绝对路径（P0 脱敏）、私密评审 URL（P0 脱敏）、平台账号标识（P1 脱敏）、`.openai/hosting.json`（P1 建议排除）。
- 完成第 4 节全部操作并通过自查命令后再执行公开。

## 6. 建议排除清单（公开镜像）

```
store-materials/            # TapTap 发布物料 + 平台账号标识（P0）
.openai/                    # 建议：Sites 部署标识（P1，若不需要 Sites 发布）
dist/                       # 构建产物（已在 .gitignore）
dist-review/                # 评审构建产物
dist-platform-review/       # 平台评审构建产物（注释明示不得作为公开包上传）
*.local                     # 本地配置
```

> 说明：`.gitignore` 已含 `node_modules/`、`dist*`、`*.local`、`.DS_Store`；需补充 `store-materials/`（及按需 `.openai/`）。
