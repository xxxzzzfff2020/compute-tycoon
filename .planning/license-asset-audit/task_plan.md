# 任务计划：许可证与资产来源审计（OSS 公开准备）

task_id: COMPUTE-TYCOON-OSS-LICENSE-ASSET-AUDIT

## 目标
为公开到 GitHub 的《算力大亨 Compute Tycoon》H5 仓库完成只读许可证与资产来源审计，输出 `docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md`（中文）。不修改任何源码。

## 阶段
- [ ] P1 收集 npm 依赖 license 字段（decimal.js/lucide/vite/vitest/typescript/tsx/jsdom/puppeteer-core 等，node_modules 实测 + package-lock 交叉核对）
- [ ] P2 盘点 public/assets 媒体（dyson 主视觉 jpg、stellar-tide mp3、lucide-LICENSE.txt）并核对来源报告
- [ ] P3 盘点字体/图标/SDK/外部样例/商店物料排除情况（src 代码、store-materials、无 @font-face 等）
- [ ] P4 撰写 docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md（矩阵 + 建议 + NOTICE 方案）
- [ ] P5 复核报告（git 状态确认零源码改动）并汇报

## 约束
- 只读命令：rg/find/cat/ls/du/git status 等，禁止写源码
- 唯一允许的写入：docs/oss/THIRD_PARTY_AND_ASSET_LICENSE_AUDIT.md 与 .planning/ 计划文件
