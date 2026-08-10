# 审计发现（持续记录）

## 起点
- 上轮未提交改动：session.ts（精确毫秒推进订单、save 刷新离线锚点）、render.ts（pointerup 坐标回退）、2 个测试
- 当前渲染链：render() 每帧全量重写 section-body（replaceChildren），无局部 patch 机制

## 渲染链审计（P1）
- main.ts 帧循环：`session.update(dt); render()` 每帧无条件完整渲染
- render.ts：所有 section body 每帧 `replaceChildren` 全量重建（模型卡/订单/服务器/中心/迭代/离线）
- 每完成一个订单：tick → emitChanged → 渲染 → 整个订单区+模型区重建 → 按钮节点替换 → 焦点丢失/闪烁
- 自动保存（15s）只 save 不渲染，但 update() 内 tick 的 changed 已触发渲染；自动领取（automation 内 claimOrder）改状态后也渲染
- 无 render 指标；无局部 patch 机制

## 成长/经济审计（P1）
- SaveData 无 workshop 字段；lifetimeIncome 已有（累计营业收入，只增不减）
- 首服 = 资金攒到 20000 购买（FIRST_SERVER_COST=20000）；训练消耗同资金池 → 训练拖慢首服
- 训练：TRAIN_COST_BASE=70, GROWTH=1.9, GAIN=0.26（每级 +26% 处理速度）
- 自动经营解锁：完成 6 单；订单 o1: 12s/¥180 毛/0.4 租赁比
- stage: serverCount>0 → Stage2；serverCount>=3 → Stage3
- buyServer 统一资金购买（第二/三台保持）
