# 进度日志

## 2026-08-01 任务03完成（Stage 1 收口 + 服务器扩张 + 迭代闭环）
- 订单区闪烁根因二连修：
  1. sigForOrders 含 status → 每单完成全量重建 active 区（已修：签名去 status）
  2. canAcceptAnyOrder 依赖 activeOrders.length → 满槽/空槽触发整区重建（已修：静态签名只含 模型已获得/自动化解锁/自动化开关；active 子区独立签名只重建子区）
- serverPower 乘法→加法累积（2×4×8×… 1.65亿倍爆炸 → 各服务器 power 相加），5→8 台节奏恢复
- 服务器扩到 8 台（成本 2万/7.5万/22万/10万/18万/32万/56万/100万；power 2/4/8/32/64/128/256/512）
- 算力中心：8 台解锁、收入倍率 ×1.7/级（原 ×4 导致中心后秒迭代）
- 技术迭代：prestige 重置 firstServerAwarded（二轮重新走里程碑）、门槛 6000 万、中心限频升级模拟
- 经济模拟达标（standard）：首服 8:51 / 三服 21:20 / 五服 25:40 / 八服 34:02 / 中心 34:54 / 迭代 44:41 / 二轮首服 4:20 / 二轮恢复 8:59
- 测试：84 单测全过、E2E 全流程（8台+中心+迭代+二轮）、typecheck/build 干净
- 浏览器验证（120s 自动经营）：rootReplacement=0、.order-list 整区重建=0、DOM 稳定 98→120、滚动保持
- 遗留：docs 未更新（ECONOMY_SIMULATION/PRODUCT_CONTRACT/CODEX_HANDOFF）、代码未提交

## 2026-08-01 任务03开始
- 任务02代码未提交：workshop/首服里程碑/局部渲染已实现（render v2 + metrics）
- 用户反馈订单区仍闪烁：sigForOrders 含 status → 每单完成全量重建 active 区
- 5173 有僵尸 vite（pid 26421）+ puppeteer chrome helpers
