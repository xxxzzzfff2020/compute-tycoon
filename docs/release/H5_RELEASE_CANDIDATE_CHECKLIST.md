# 《算力大亨》H5 Release Candidate Checklist

版本候选：`1.0.0-rc.1`
公开发布：`NOT_AUTHORIZED`

## 产品与流程

- [x] 新档主线状态机覆盖 R1→R2→R3→Stage4→Stage5→戴森
- [x] 旧 iteration 1/2/3 核心事实迁移已覆盖
- [x] Stage4 四节点 4/4 门禁
- [x] 地外计划成功后 overlay 立即关闭且幂等
- [x] 终局档案只显示真实完成项
- [x] 奇点核心文案与庆典流程
- [x] 15 项轻量里程碑
- [x] 戴森终局庆典与传奇档案

## UX

- [x] 连续进度统一横条与接近完成脉冲
- [x] 动态按钮 native/class/ARIA 同步
- [x] 地球按迭代轮次统一主题
- [x] 模型蓝图与玩家化文案
- [x] 经营/荣誉馆/赞助/菜单四栏；荣誉馆含档案/里程碑/名人堂
- [x] 原创分段 BGM、音效、音量及前后台恢复
- [x] 原创戴森终局主视觉与来源/回退记录
- [x] Level A 持续运转反馈、投资发现、节点爆发、离线回归与增长回顾
- [x] 玩家可见文案移除 Production / Platform Review / 证据裁决等内部措辞
- [x] Production 伪造 debug/speed 参数仍不显示或启用倍率工具
- [ ] iOS 真机最终舒适度（负责人门）
- [ ] Android 真机最终舒适度（负责人门）

## 平台

- [x] H5 应用身份重新核验
- [x] 竖屏激励广告位 `1054324` 核验
- [x] 两类赞助奖励 exactly-once、每日额度、24小时上限、pending恢复与异常自动测试
- [x] Production 云档/榜单默认关闭；Platform Review 独立构建、namespace与云槽
- [x] 云档 v2 身份指纹、损坏校验、显式强制覆盖与双设备 Mock 冲突保护
- [x] 最短通关/财富双榜适配、正式档门与大数安全保序评分
- [ ] TapTap 真容器广告真机回调（负责人门）
- [ ] TapTap 真容器云档双设备上传/恢复/冲突矩阵（负责人门）
- [ ] TapTap 真容器双榜排序、UID与正式档提交验证（负责人门）

## 自动证据

- [x] typecheck 最终 PASS
- [x] unit 最终 PASS（31 files / 370）
- [x] e2e 最终 PASS（1/1）
- [x] production build PASS
- [x] review build PASS
- [x] Sites Production/Review build PASS
- [x] 8策略×1000确定性样本 PASS
- [x] 1×/256×一致性 PASS
- [x] 100 save/load PASS
- [x] 100关键动作高速点击 PASS
- [x] 30分钟逻辑 soak PASS
- [x] 浏览器高倍率 soak PASS（256×真实墙钟10分钟）
- [x] 新档自然流程到戴森 PASS（27里程碑，271秒@256×）
- [x] 本轮320/350/390/430宽度无横向溢出；终局图加载、四栏存在、页头/底栏在视口内
- [x] Production / Platform Review / Review 三构建PASS；390×844浏览器隔离Smoke与Console Error 0

## 发布资料

- [x] 最终产品合同
- [x] 平台能力审计
- [x] 隐私、广告、云档与存档说明
- [ ] 本轮最终 commit / build hash / RC tag
- [ ] 本轮私密 owner-only Review 部署
- [ ] 公开发布人工批准

最终真机流程见：`docs/release/H5_FINAL_DEVICE_PRELAUNCH_TEST_FLOW_20260809.md`。
