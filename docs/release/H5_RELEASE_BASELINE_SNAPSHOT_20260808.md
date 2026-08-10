# 《算力大亨》H5 最终发布收口基线快照

```yaml
task_id: COMPUTE_TYCOON_H5_FINAL_RELEASE_CONVERGENCE_01
captured_at: 2026-08-08
canonical_repository: /Users/xxxzzzfff2002/code/TaptapMaker/TaptapMaker/H5算力大亨H5
branch_before: main
branch_working: codex/final-release-convergence-01
head: f765129a96f57bf395041bb507e7571024aa9291
head_tag: null
git_remote: NOT_CONFIGURED
tracked_changes_before: 0
existing_untracked_assets_preserved: true
```

## Git恢复点

- bundle：`.planning/final-release-convergence-01/backups/compute-tycoon-h5-f765129-baseline.bundle`
- SHA-256：`bbd2a39e5fe8bcaa0a71342e1eb947efe8fcdf40e7d2eff24b12919a65a202c6`
- `git bundle verify`：PASS，完整历史。
- 禁止 force push 与历史重写。

## 运行入口

- Production：`index.html` → `/src/app/main.ts` → `boot()`。
- Production存档namespace：`compute_tycoon_h5_mvp_v1`。
- Review检查点：独立Review runtime override与独立namespace，不应进入Production构建。
- 终局隔离namespace：`compute_tycoon_h5_endgame_review_v1`。
- Dev namespace：`compute_tycoon_h5_dev_v1`。

## 存档Schema

```yaml
schema_version: 4
max_supported_schema_version: 4
big_number_storage: number_or_decimal_string
local_storage_first: true
future_schema_write_guard: true
formal_cloud_sync_at_baseline: false
```

当前正式档包含：资金/累计收入/模型与永久模型档案、订单、工作室、服务器、Stage2、Stage3、基础设施、机房、旗舰工程、蓝图、纪元、奇点核心、Stage4、Stage5、永续终局、离线回执与设置。云存档、成就、排行榜字段尚未成为正式Schema。

## 当前私密Review站

```yaml
sites_project_id: appgprj_6a6daad5757c8191912434c015631a1b
version: 14
deployed_commit: f765129a96f57bf395041bb507e7571024aa9291
url: https://compute-tycoon-h5-review.xxxzzzfff2026.chatgpt.site
access: custom_owner_only
external_visitors: 0
groups: 0
```

## 合同快照索引

以下SHA-256固定修改前事实，不代表所有旧文档仍是当前权威：

| 文件 | SHA-256 | 用途 |
|---|---|---|
| `docs/product/COMPUTE_TYCOON_LIVE_SCOPE_RULING_20260808.md` | `8c859699c061baa41b78b13d083311f9b9f0e1e1e4566be66e487c31ac847897` | 最新范围裁决 |
| `docs/product/endgame/COMPUTE_TYCOON_ENDGAME_PRODUCT_DEFINITION.md` | `05d194544f811c9b87c86a50ce004222f02c7ebe8004231e40ca163802d0d16d` | 终局产品定义 |
| `docs/product/endgame/COMPUTE_TYCOON_H5_ENDGAME_CONVERGENCE_PRODUCT_RULING_20260807.md` | `6350dd046e2581be61518f06da9992f003cfb7312f1672a98e3b986a299bda83` | 终局收敛裁决 |
| `docs/PRODUCT_CONTRACT.md` | `148bae52ddb81c3f62039c6fd0bb93ad01af3db51ab99d478f3c621fb169e8bd` | 旧合同快照，已知有漂移，后续须被最终合同取代 |
| `src/save/types.ts` | `0fe5fb4d86811ba82617ccf14b9f59d98742f87fbf8fe84dc6d0aaed019f48d5` | Schema类型 |
| `src/save/validate.ts` | `2347734d47ef073e183f10e34b33cc7f1ae558d12141a6dcb72b1e5b1955437f` | 迁移/校验 |
| `src/app/main.ts` | `284275350ef5fd7523ea4967d05f8c9e13cc4605d84ff7bb5c19fb1dca7ba43d` | 正式入口逻辑 |
| `index.html` | `81e29d5de472bf56c39bb6fb4ade9c33291a6c9e55fcf87361414f5c1f611be0` | HTML入口 |
| `.openai/hosting.json` | `8fa39804ac284712d652a4d830872b255927d61e0b0f3f6d1cc62e63747777ea` | Sites绑定 |

## 本收口新增冻结

- 普通玩家完成日历跨度：100–168小时（4–7天），不是连续在线100小时。
- 主动操作累计目标：3–6小时。
- 首服目标：8–12分钟；前15分钟验证过的爽点必须保护。
- Stage4最终工程必须要求4/4地月节点。
- 广告仅允许离线收益×2与模型蓝图额外+1；平台未验证则关闭。
- 云失败不得阻断本地档；排行榜无可信服务端校验则关闭。
- 不自动公开发布。
