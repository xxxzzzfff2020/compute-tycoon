# 《算力大亨 Compute Tycoon》H5 · 第三方与资产来源许可证审计报告

- 审计日期：2026-08-10
- 审计对象：`compute-tycoon-i18n`（H5 游戏，准备公开到 GitHub）
- 审计方式：只读检查（package.json / package-lock.json / node_modules / public / src / store-materials / docs 来源报告），未修改任何源码
- 结论性质：本报告为法律信息整理与合规建议，不构成法律意见；正式开源前建议由权利方/法务复核媒体授权与平台条款

---

## 0. 结论摘要（TL;DR）

- 自有代码与 AI 辅助生成的代码：可公开，建议仓库根添加 `LICENSE`（MIT 或 Apache-2.0），并在 `NOTICE`/README 中说明 AI 辅助生成。
- 运行时第三方依赖仅两项：`decimal.js`（MIT）与 `lucide`（ISC，含 Feather 派生图标的 MIT 部分）。均为宽松许可，可随游戏二进制/产物发布，无需保留源码义务；需在发行物中保留版权与许可声明（`public/third-party/lucide-LICENSE.txt` 已覆盖 lucide）。
- 两张媒体资产（戴森主视觉 JPG、BGM MP3）为 AI 全新生成、无外部参考：可作为项目自有资产随公开仓库发布。它们与"纯代码 MIT 许可"是不同授权对象，建议在 `LICENSE` 与 README 中单独说明，避免第三方误以为可自由再分发/商用。
- `store-materials/`（47MB，249 个文件，含平台商店物料、截图、评审证据）建议从公开仓库排除（git rm --cached + .gitignore），仅保留在内部/发布工作区；README 注明正式发行版物料另行许可。
- 无字体文件（CSS 为系统字体栈，无 `@font-face`），无外部 CDN 引用；TapTap 平台能力（云存档/排行榜/激励视频）通过运行时宿主注入的 `globalThis.tap` 调用，仓库内无平台 SDK 二进制。
- 根目录目前没有 `LICENSE`、`NOTICE`、`THIRD_PARTY_NOTICES.md`：需要补建。

---

## 1. 审计范围与方法

- 检查项：`package.json`、`package-lock.json`、`node_modules` 关键包的 `license` 字段；`public/` 下媒体与第三方许可文件；`src/` 对依赖与平台 API 的引用；`store-materials/` 内容与 git 跟踪状态；根目录许可文件。
- 核对依据：
  - 资产来源报告 `docs/reports/H5_ORIGINAL_ASSET_PROVENANCE_20260809.md`
  - 包仓库声明的许可证（以 `node_modules/<pkg>/package.json` 与 lockfile 为准）
- 范围外：未逐行审阅全部传递依赖（约 156 个顶层 node_modules 目录）；正式发布时建议用 `license-checker`/`license-report` 等工具全量导出依赖许可清单。

---

## 2. 许可证矩阵

| 类别 | 对象 | 版本/规模 | 许可证/来源 | 结论 |
|---|---|---|---|---|
| 自有代码 | `src/`、`scripts/`、`tests/`、`index.html`、构建配置等 | 全部 TypeScript/HTML/CSS | 项目自有（AI 辅助开发） | ✅ 可公开；需补仓库根 LICENSE |
| AI 生成代码 | 同自有代码（agent 辅助编写） | — | 项目自有 | ✅ 可公开；建议在 README/NOTICE 说明 |
| 第三方 npm 依赖（运行时） | `decimal.js` | 10.6.0 | MIT | ✅ 可随发行物分发；保留版权声明 |
| 第三方 npm 依赖（运行时） | `lucide`（图标库，含 Feather 派生图标） | 1.30.0 | ISC（部分派生图标 MIT） | ✅ 可随发行物分发；许可文本已随包置于 `public/third-party/lucide-LICENSE.txt` |
| 第三方 npm 依赖（开发时） | `vite` | 8.2.0 | MIT | ✅ 仅开发/构建期，无需随发行物分发 |
| 第三方 npm 依赖（开发时） | `vitest` | 4.1.10 | MIT | ✅ 同上 |
| 第三方 npm 依赖（开发时） | `typescript` | 7.0.2 | Apache-2.0 | ✅ 同上 |
| 第三方 npm 依赖（开发时） | `tsx` | 4.23.1 | MIT | ✅ 同上 |
| 第三方 npm 依赖（开发时） | `jsdom` | 29.1.1 | MIT | ✅ 同上 |
| 第三方 npm 依赖（开发时） | `puppeteer-core` | 24.43.1 | Apache-2.0 | ✅ 同上 |
| 第三方 npm 依赖（开发时） | `@types/decimal.js` / `@types/jsdom` / `@types/node` | 0.0.32 / 28.0.3 / 26.1.2 | MIT / MIT / MIT | ✅ 同上 |
| 字体 | 无字体文件；CSS 系统字体栈（`src/styles/main.css` 第 25 行） | — | 不适用（无第三方字体） | ✅ 无字体许可负担 |
| 图标 | lucide（经 `src/ui/icons.ts` 按名导入） | 1.30.0 | ISC + Feather MIT | ✅ 随依赖分发，许可文本已保存 |
| BGM | `public/assets/audio/compute-tycoon-stellar-tide-v1.mp3`（《算力星潮》） | ≈227.96s，约 2.2MB | TapTap Maker `text_to_music` 生成，纯音乐、无外部参考音频 | ⚠️ 项目自有（生成物）；建议与代码许可分离声明，并保留生成记录 |
| SFX | WebAudio 低密度里程碑短音效（程序化合成，`src/audio/game-audio.ts`） | — | 项目自有代码 | ✅ 随自有代码许可 |
| 图片 | `public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg` | 1152×768 JPEG ≈263KB | Codex `image_gen` 全新生成，无外部参考图 | ⚠️ 项目自有（生成物）；建议与代码许可分离声明 |
| 平台 SDK（TapTap） | 云存档 / 排行榜 / 激励视频（`src/platform/`） | — | 运行时宿主注入 `globalThis.tap`，仓库无 SDK 二进制/许可文本 | ✅ 可公开适配代码；需自行确认 TapTap 开发者协议允许公开此类适配层 |
| 广告 SDK | TapTap 激励视频（`src/platform/taptap-ads.ts`，仅 `?adtest=1` 联调） | — | 同上，无二进制 | ✅ 同上 |
| 外部样例/素材 | 无外部引用素材、无 CDN 字体/图片 | — | — | ✅ 无 |
| 商店物料 | `store-materials/`（taptap-app-<APP_ID>：品牌物料、截图、评审证据、视频帧等） | 47MB / 249 文件 | 平台商店物料/内部证据 | ❌ 建议从公开仓库排除；正式发行版另行许可 |

---

## 3. 依赖许可明细（实测）

> 版本与 license 取自 `node_modules/<pkg>/package.json`，并与 `package-lock.json` 交叉核对一致。

### 3.1 运行时依赖（dependencies）

| 包名 | 版本 | license | 说明 |
|---|---|---|---|
| `decimal.js` | 10.6.0 | MIT | 高精度十进制运算 |
| `lucide` | 1.30.0 | ISC | 图标库；`public/third-party/lucide-LICENSE.txt` 已保存完整许可文本（含 Feather 派生图标的 MIT 部分） |

### 3.2 开发依赖（devDependencies）

| 包名 | 版本 | license |
|---|---|---|
| `@types/decimal.js` | 0.0.32 | MIT |
| `@types/jsdom` | 28.0.3 | MIT |
| `@types/node` | 26.1.2 | MIT |
| `jsdom` | 29.1.1 | MIT |
| `puppeteer-core` | 24.43.1 | Apache-2.0 |
| `tsx` | 4.23.1 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `vite` | 8.2.0 | MIT |
| `vitest` | 4.1.10 | MIT |

- 说明：devDependencies 仅参与开发/测试/构建，不进入运行时产物；公开仓库包含 `package.json` 与 lockfile 即可满足引用义务。
- 建议：公开前用 `npx license-checker --summary` 或 `npm-license-crawler` 全量核对传递依赖（含 lucide 构建期依赖等），并把汇总结果并入 `THIRD_PARTY_NOTICES.md`。

---

## 4. 媒体资产来源（与来源报告交叉核对）

依据 `docs/reports/H5_ORIGINAL_ASSET_PROVENANCE_20260809.md`（2026-08-09，状态 `OWNER_REVIEW_CANDIDATE`）：

| 资产 | 路径 | 生成方式 | 外部参考 | 项目内接线 |
|---|---|---|---|---|
| 戴森算力球主视觉 | `public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg` | Codex `image_gen` 全新生成（原始 PNG → 缩放/压缩为 1152×768 JPEG） | 无 | `src/ui/render.ts` 中 `story-complete-visual` 弹窗图片（`data-src` + `loading="lazy"`） |
| BGM《算力星潮》 | `public/assets/audio/compute-tycoon-stellar-tide-v1.mp3` | TapTap Maker `text_to_music`（V4.5 自定义模式，纯音乐，生成任务 `temp_f90aa34d-...`） | 无 | `src/audio/game-audio.ts` 分段 BGM（地球/地月/戴森三段） |

- 二者均为"无外部参考的全新生成物"，可作为项目自有资产处理。
- 来源报告注明状态为 `OWNER_REVIEW_CANDIDATE`，即"生成成功/接线成功 ≠ 最终采用与发布许可"：公开前应确权（Codex/TapTap 生成物归创作方所有、可商用/再发布，见 §7 建议），并把生成记录随仓库保留（本报告已引用）。
- `public/` 下无其他媒体文件；项目无 `@font-face`、无外部字体/CDN 引用。

---

## 5. 平台能力与 SDK

- `src/platform/` 含四个适配层：`features.ts`、`taptap-ads.ts`（激励视频，仅 `?adtest=1` 联调，不发放奖励）、`taptap-cloud-save.ts`（云存档）、`taptap-leaderboards.ts`（排行榜）。
- 全部通过运行时宿主注入的 `globalThis.tap` 调用（如 `tap.getFileSystemManager`、`tap.getLeaderboardManager`、`tap.createRewardedVideoAd`），仓库内无 TapTap SDK 文件、无平台二进制、无平台许可文本。
- 公开风险点：排行榜/云存档的 `leaderboardId`/槽位名等平台业务标识会随源码公开；适配层代码本身为项目自有，但公开发布前建议与 TapTap 开发者协议核对（是否允许公开此类适配代码与业务 ID）。

---

## 6. 商店物料与排除项

- `store-materials/`（47MB，249 个文件）含 TapTap 商店物料：品牌图（logo/icon/promo/封面/库背景）、游戏截图、评审证据、视频帧、capture-harness 等，且**当前已被 git 跟踪**（`git ls-files store-materials | wc -l` = 249）。
- 排除建议（发布到 GitHub 前执行）：
  1. `git rm -r --cached store-materials`
  2. 在 `.gitignore` 追加 `store-materials/`
  3. 如目录仍留在本地工作区，确保不再次 `git add`；README 中注明"商店物料与正式发行版美术不在公开仓库中"。

---

## 7. 建议

### 7.1 仓库根 LICENSE

- 建议在根目录添加 `LICENSE`。若希望社区最广采纳：**MIT**；若重视专利条款与贡献者授权：**Apache-2.0**。两者均与本仓库依赖（MIT/ISC/Apache-2.0）兼容。
- 若选 MIT：`Copyright (c) 2026 <权利方/作者>`；若选 Apache-2.0：正文可直接引用 Apache-2.0 全文。
- 代码部分（src/scripts/tests 等）适用上述许可证；**媒体资产（主视觉 JPG、BGM MP3）建议在 LICENSE 内单独声明**（示例：`Assets (public/assets/) are owned by <权利方>; code license does not extend to them. 正式发行版中另行授权。`），避免误用。

### 7.2 媒体资产处理（二选一）

- 方案 A（推荐，仓库最小化）：主视觉与 BGM 保留在公开仓库（已生成、无外部版权），但 README/`ASSET_LICENSE.md` 单独声明授权范围与再分发限制；配合来源报告（`docs/reports/`）留档。
- 方案 B（最保守）：从公开仓库排除 `public/assets/`，README 说明"正式发行版包含的媒体资产另行许可"；代码可先以占位/程序化渲染替代。适用于"不愿把 AI 生成物纳入开源授权"的场景。
- 无论哪种方案，`public/third-party/lucide-LICENSE.txt` 均应保留（图标许可声明）。

### 7.3 NOTICE 与 THIRD_PARTY_NOTICES.md

- 建议新增 `THIRD_PARTY_NOTICES.md`：列出运行依赖（decimal.js MIT、lucide ISC/MIT）与主要开发依赖，附版权与许可摘要；构建产物（dist）内建议保留 lucide 许可文本（已有）并加入本通知。
- 若选 Apache-2.0 作为仓库许可，因依赖许可宽松、无不可再许可项，不强制 `NOTICE`；但建议加一个简短 `NOTICE` 说明"AI 辅助生成代码"与媒体归属，降低合规沟通成本。
- README 增补「许可」小节：仓库代码许可、媒体声明、第三方依赖通知入口。

### 7.4 其他收尾清单

- 发布前用工具全量核对传递依赖许可（`npx license-checker --summary`）。
- 与 TapTap 开发者协议核对公开适配层代码与业务 ID 的合规性。
- 确认 `store-materials/` 从公开仓库移除；`evidence/`、`sites/`、`.openai/` 按发布范围决定是否保留（本报告范围外）。
- 在 LICENSE 确认前，README 可暂标"License: TBD"。

---

## 8. 审计限制与待确认项

- 未对全部传递依赖做逐包许可审计（仅覆盖清单内关键包 + lockfile 交叉核对）。
- 来源报告状态为 `OWNER_REVIEW_CANDIDATE`：媒体资产的最终采用与授权归属需权利方确认。
- TapTap 开发者协议对公开适配层/业务 ID 的允许性未核实（需登录开发者后台查看最新条款）。
- `git status` 显示 `src/` 有未提交改动（如 `src/i18n/` 新增、多个模块修改），不影响本审计结论；公开前需完成代码提交与评审。

---

*报告生成方式：只读命令（cat/rg/find/du/git ls-files 等）+ 来源报告交叉核对；未修改任何源码。*
