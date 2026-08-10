# 算力大亨 · H5 MVP

《算力大亨》首个 H5 文字挂机经营游戏 MVP。基于 Lua 黄金产品合同（`4a661c8`，2026-07-19）重新实现，非 Lua 代码迁移。

- 技术栈：TypeScript + Vite + Vitest + decimal.js（DOM 优先，无 Canvas 主 UI，无大型框架）
- 玩法：AI 创业工作室 → 免费研发 6 个职责模型 → 1–8 台服务器 → 三座机房与旗舰工程 → 第一次技术迭代 → 第二轮加速
- 标准首轮完整时长：约 81 分钟（8 策略 ×1000 局校准，见 `docs/ECONOMY_SIMULATION.md`）；地球主线三次迭代上限（核心 1/2/3，永久倍率 ×1.5/×2.0/×2.0）

## 快速开始

```bash
npm install        # 安装依赖
npm run dev        # 本地开发（默认 http://localhost:5173）
npm run build      # 生产构建（tsc + vite build，输出 dist/）
npm run build:sites # 生产构建 + Sites Worker 适配
npm run build:review # 集中评审构建（输出 dist-review/）
npm run build:sites:review # 集中评审构建 + Sites Worker 适配
npm run preview    # 预览生产构建
npm run preview:review # 本地预览集中评审构建
npm run test       # 单元测试（Vitest）
npm run e2e        # 浏览器 E2E（jsdom，全流程：新档→迭代）
npm run typecheck  # TypeScript 检查
npm run simulate   # 经济模拟（8 种策略 × 1000 局）
```

> 目录名为中文（`H5算力大亨H5`），npm 脚本内部无依赖路径拼接，可正常工作。

## 核心命令/入口

| 命令 | 说明 |
|------|------|
| `获取第一款模型` | Stage1 起点 |
| `接取`（订单） | 手动接单（完成 6 单解锁自动经营；迭代后 3 单） |
| `训练/研发模型` | 提升模型等级与处理能力 |
| `开启自动经营` | 自动接推荐订单 + 自动领取 |
| `购买服务器` | 第一台由里程碑授予，第 2–8 台资金购买 |
| `进入算力中心` | 仅在 8 服和 Stage 2 结算后进入 Stage 3 |
| `升级基础设施 / 投产机房` | 电力、算力卡、光模块、存储四项全局成长；无旧中心升级 |
| `进行技术迭代` | 地球主线最多三次（R1/R2/R3）；永久倍率 ×1.5/×2.0/×2.0；第三次迭代转为「地外算力计划」揭示不清档 |

## 存档

- localStorage 命名空间：`compute_tycoon_h5_mvp_v1`
- 自动保存（15 秒/隐藏页面时）、手动保存、导出/导入 JSON、重置二次确认
- Stage 2 离线最多 60 分钟；Stage 3 随存储从 60 分钟升至 180 分钟，资金与研发共用上限；待领取报价 exactly-once
- 详见 `docs/SAVE_CONTRACT.md`

## 开发加速（正式 UI 不可见）

URL 参数 `?dev=1&state=<合法检查点>&speed=N`。只有合法隔离检查点才能启用倍速；正式 UI 不显示入口，正式档不受影响。

## 创始人集中评审（独立构建）

- 私密入口：`https://compute-tycoon-h5-review.xxxzzzfff2026.chatgpt.site`
- Review Build 提供“从新档完整开始”和 A–J 十个真实状态机检查点。
- 每个检查点使用独立命名空间 `compute_tycoon_h5_review_v2:<checkpoint_id>`，不读取或覆盖正式档。
- Review 运行时只由专用构建显式安装；给正式入口追加 Review 查询参数不会启用评审模式。
- Review 会话栏提供 1/2/4/8/16/32× 调试倍率，切换后继续当前隔离存档；默认体验始终为 1×，正式 Production 不显示该控件。
- 自动化 QA 仍可在 Review Build 使用隐藏的 `qa=1&speed=N` 路径，不进入面向体验的倍率选择器。
- 详见 `docs/product/H5_FOUNDER_CONCENTRATED_REVIEW_GUIDE_20260801.md`。

## 文档

- `docs/PRODUCT_CONTRACT.md` — 产品合同与数值来源
- `docs/ECONOMY_SIMULATION.md` — 经济模拟方法与结果
- `docs/SAVE_CONTRACT.md` — 存档/离线/幂等契约
- `docs/CODEX_HANDOFF.md` — 交接说明（范围/技术债/下一步）
- `docs/product/H5_CONTRACT_RECONCILIATION_01.md` — 6 模型、旧中心、存储和曲线正式协调结论
- `docs/product/H5_FOUNDER_CONCENTRATED_REVIEW_GUIDE_20260801.md` — Review Candidate V2 集中体验顺序与判断问题
- `docs/product/H5_ITERATION2_ITERATION3_ENDLESS_DESIGN_PREP_01.md` — 迭代与无尽纪元历史设计准备（已被正式整合卡取代）
- `docs/reports/H5_ENDGAME_CONVERGENCE_P2_REPORT_20260807.md` — 终局收敛实施报告（倍率 ×1.5/×2.0/×2.0）
- `docs/reports/H5_REVIEW_HARDENING_05_20260801.md` — 本轮确定性硬化与证据收口
