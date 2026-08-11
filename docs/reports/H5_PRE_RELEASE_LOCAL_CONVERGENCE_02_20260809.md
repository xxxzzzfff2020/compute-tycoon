# 《算力大亨》H5 真人体验前本地收口 02

```yaml
task_id: COMPUTE_TYCOON_H5_PRE_RELEASE_LOCAL_CONVERGENCE_02
result: LOCAL_REVIEW_CANDIDATE
baseline_before: 0308c17d87394bb2e3ce6f705715347b42ae165f
branch: codex/pre-release-local-convergence-02
candidate_commit: 当前文档所在Git HEAD（最终回执给出精确SHA）
product_status: OWNER_PRIVATE_REVIEW_READY
engineering_status: LOCAL_ENGINEERING_COMPLETE
release_status: NOT_RELEASE_CANDIDATE
```

## 已完成

1. Production 安全门：广告接线保留；云档与双榜默认关闭。新增独立 Platform Review 构建、本地 namespace 与云槽，不触碰正式档。
2. 赞助闭环：离线基础 6 小时、每广告 +2 小时、每日 9 次、最高 24 小时；只有真实使用扩展区间才消耗。收入 ×2 每次 2 小时、每日 3 次免费与 9 次广告、最高 24 小时。pending 事件可恢复/取消，15 分钟过期，奖励 exactly-once。
3. 云档安全：v2 身份指纹；上传前读取远端；损坏、异档、另一设备新版本均停止自动覆盖；强制覆盖需要玩家再次确认。双设备 Mock 已覆盖 A→B→A 冲突链。
4. 名人堂：最短通关升序、财富降序；超大资金编码为安全整数保序指数；Review/Dev 档禁止提交。荣誉馆显示本档记录与榜单口径。
5. 玩家表现：经营/荣誉馆/赞助/菜单四栏；云与榜单状态可见；研发回执去除 raw compute/income/s；首服、服务器规模和现有百分比使用连续进度条。
6. 原创资产：终局戴森计算球主视觉；Stage 1–5 五首独立原创无歌词 BGM，移除旧单曲分段与连续振荡器 BGM。来源与回退见 `H5_ORIGINAL_ASSET_PROVENANCE_20260809.md` 与 `docs/oss/BGM_GENERATION_RECORD.md`。
7. 发布资料：最终产品合同、隐私/广告/云说明、RC 清单与版本说明已同步当前实现。

## 验证

```yaml
typecheck: PASS
unit: 30_files_356_tests_PASS
e2e: 1_of_1_PASS
builds:
  production: PASS
  private_review: PASS
  platform_review: PASS
  sites_review: PASS
browser:
  direct_app_console_errors: 0
  terminal_visual_loaded: PASS
  continue_business_closes_overlay: PASS_REAL_CLICK
  four_primary_tabs: PASS_REAL_CLICK
  honor_hall_sponsor_menu_content: PASS
  widths_320_350_390_430_horizontal_overflow: NONE
cloud_dual_device_mock: PASS
large_wealth_score_ordering: PASS
production_platform_features_default_off: PASS
```

说明：响应式探针是私密 Review 构建生成的同源 iframe，不进入 Production。Browser 控制层注入 iframe 时自身会记录一条 MutationObserver instrumentation error；不使用探针的直接游戏页日志为 0，应用代码不含该观察器。

## 仍需负责人/平台完成

- TapTap 真容器：广告完整/取消/失败回调；云档双设备上传、恢复与冲突；两个榜单排序、UID、正式档提交。
- iOS 与 Android 真机安全区、字体、触控、前后台恢复、BGM 舒适度与性能。
- 原创音画最终采用、隐私法律文本、榜单防篡改边界、TapTap 上传/提审/公开发布均需负责人明确批准。
- 客户端榜单只能做最低限度格式与正式档门控，不能冒充服务端反作弊；Production 因此保持关闭。

## 行动计数

```yaml
tap_uploads: 0
store_submissions: 0
public_releases: 0
production_cloud_writes: 0
production_save_writes: 0
maker_calls: 0
workers_created: 0
generated_original_images: 1
generated_original_music_tracks: 1
```

本报告只支持 `OWNER_PRIVATE_REVIEW_READY`，不支持 HUMAN、DEVICE、PLATFORM 或 RELEASE PASS。
