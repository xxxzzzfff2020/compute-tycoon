# 调研发现

- 镜像仓库 = /Users/xxxzzzfff2002/code/TaptapMaker/TaptapMaker/_oss_work/compute-tycoon-i18n，含 src/tests/scripts/docs/evidence/public，有 store-materials/ 目录。
- 产品事实源：docs/PRODUCT_CONTRACT.md（历史工程合同）+ docs/product/H5_FINAL_PRODUCT_CONTRACT.md（RC 权威）。
- 测试：tests/unit 31 个文件 370 项；tests/e2e 1 个完整循环；scripts/simulate-economy.ts 8 策略×1000 局；evidence/review + evidence/release 浏览器矩阵/soak JSON。
- src/review/checkpoints.ts 定义 A–J 共 10 个评审检查点；src/review/endgame-checkpoints.ts 终局检查点。
- package.json version=1.0.0-rc.1；release notes 为 1.0.0-rc.1 私密发布候选。
- Codex 报告证据：H5_CODEX_ACCEPTANCE_20260801.md（intake audit、economy reconciliation、verification 矩阵、human review 邀请）；H5_REVIEW_HARDENING_05_20260801.md（render 架构修复、浏览器矩阵 234/234、soak、checkpoint 10 个、确定性修复 4 项）。
- 重要：镜像仓库 git 历史仅 1 个基线提交（c6d8ad3 baseline snapshot），无生产历史——支持"不重写生产历史"决策的落地。
- 敏感：两份 Codex 报告内嵌绝对路径（如 /Users/xxxzzzfff2002/...）与私有 review 站点域名，OSS 文档不得转发这些内容。
