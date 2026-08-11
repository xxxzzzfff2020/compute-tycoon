# 存档契约（真机试玩前 schema v4）

## 命名空间

- 正式档：`localStorage["compute_tycoon_h5_mvp_v1"]`
- 开发验收档：`localStorage["compute_tycoon_h5_dev_v1"]`
- QA 仅在 `?dev=1&state=<合法检查点>` 时启用；`speed` 单独出现不会启用加速，也不会改写正式档。
- QA 存档 ID 为 `dev-<state>`。第一次进入或切换检查点时播种，同一检查点刷新/重新打开时恢复玩家操作后的真实状态。

## Schema v4

v4 保留 v3 全部主线/迁移语义，并将可无限增长的经济量升级为混合大数存储：安全整数范围内继续使用 JSON number，超过 `Number.MAX_SAFE_INTEGER` 后使用 Decimal 规范字符串：

```jsonc
{
  "schemaVersion": 4,
  "saveId": "uuid",
  "revision": 0,
  "updatedAtMs": 1700000000000,
  "stage": 1,
  "money": 0,
  "lifetimeIncome": 0,
  "modelProgress": { "modelId": "codex", "level": 1, "trainingCount": 0 },
  "ownedModelIds": ["codex"],
  "modelArchive": {
    "codex": {
      "modelId": "codex",
      "level": 1,
      "firstAcquiredAtMs": 1700000000000,
      "researchCount": 1,
      "lifetimeTrainingCount": 0,
      "lifetimeContribution": 0
    }
  },
  "automation": false,
  "completedOrders": 0,
  "activeOrders": [],
  "rentalCompute": { "active": false, "units": 0, "unitCostPerSec": 0 },
  "serverCount": 0,
  "serverPower": 1,
  "computeCenterLevel": 0,
  "technologyIterationCount": 0,
  "permanentMultiplier": 1,
  "lifetimeCompute": 0,
  "highestIncomePerSecond": 0,
  "pendingOfflineReward": null,
  "incomeAtLastPrestige": 0,
  "lastTickAtMs": 1700000000000,
  "workshop": {
    "level": 1,
    "experience": 0,
    "experienceToNextLevel": 100,
    "lifetimeRevenue": 0,
    "firstServerAwarded": false
  },
  "modelResearch": { "progress": 0, "stage2Draws": 0 },
  "stage2": { "settlementShown": false, "completedAtMs": 0, "stageIncome": 0 },
  "stage3": {
    "entered": false,
    "enteredAtMs": 0,
    "infrastructure": { "power": 0, "computeCards": 0, "optical": 0, "storage": 0 },
    "machineRooms": [],
    "flagship": {
      "activeId": null,
      "progress": 0,
      "startedAtMs": 0,
      "completedIds": [],
      "pendingReward": null // 完成时可为 { "projectId": "project_1", "rewardMultiplier": 1.15 }
    },
    "commissionBonusUntilMs": 0,
    "bottleneck": null,
    "blueprint": {
      "owned": [],
      "active": null,
      "levels": {},
      "chosenMilestones": []
    },
    "technologyArchive": [],
    "eraArchive": [],
    "projectProgress": 0,
    "peakStats": { "peakCompute": 0, "peakIncomePerSec": 0, "totalRequests": 0 }
  },
  "settings": { "soundEnabled": true, "notificationsEnabled": true },
  "createdAtMs": 1700000000000
}
```

`modelArchive` 是 6 个首发模型永久收藏的真值；当前主模型的本轮训练仍在 `modelProgress`。`pendingReward.rewardMultiplier` 在工程完成时快照，防止延迟领取改变存储奖励。规模型大数包括资金、累计/阶段收入、服务器算力、模型贡献、峰值统计、离线奖励与终局传奇快照；等级、时间、进度和有界倍率仍是 number。

## 校验与迁移

- `schemaVersion > MAX_SUPPORTED_SCHEMA_VERSION(4)`：加载时保留原始存档并进入写锁；当前会话不得以新档、自动保存或命令覆盖未来版本。导入同样拒绝。
- v1/v2/v3 或缺字段旧档：深层规范化现行状态，保留有效资金、模型、服务器和历史数据；安全范围内的旧 number 原值不变。
- 只有旧 `computeCenterLevel` 标记且无真实 Stage 3 进度：清除网关标记并回到 Stage 2，不解锁、不退款、不补奖。
- 存在基础设施、机房 2/3、旗舰工程，或旧网关与技术迭代记录同时存在：保留真实进度，补齐 8 服、Stage 2 结算、Stage 3 和机房 1；`computeCenterLevel` 统一写回 0。schema v4 再加载不重复迁移。
- v1 已拥有模型会迁移为最低 Lv.1 档案；当前模型的现有等级/训练进入对应档案统计，不凭空增加内容。
- 损坏 JSON 或缺少 `saveId` / `revision` / `updatedAtMs`：不能修复时安全新建；可修字段做非负钳制、枚举过滤和默认值补齐。
- Node/浏览器暴露的 `localStorage` 若不具备完整 Storage 形态，视为不可用而不是崩溃。

## 写入与事务

- `SaveStorage.save` 返回布尔成功值；`LocalStorageSaveStorage` 不再吞掉写入异常。
- `SaveRepository.save`：验证 → 递增 revision → 写盘；写失败返回失败，内存 revision 不冒充成功。
- `GameSession.commit`：克隆状态 → 执行命令 → 尝试保存；命令失败或存储失败均整体回滚。
- `MemorySaveStorage` 保存和读取都深拷贝，测试不会通过共享对象引用掩盖错误。

## 离线结算

- 只在 boot 时按 `lastTickAtMs` 结算一次；同一时间段不会同时获得在线和离线收益。
- Stage 2：60% 效率、60 分钟上限。Stage 3：70% 效率、基础 60 分钟；存储 Lv1–8 每级 +15 分钟，最高 180 分钟。资金与模型研发共用同一 capped elapsed time。
- 离线可推进：资金报价、模型研发进度、进行中的旗舰工程普通进度。
- 离线禁止：自动购买、选择/研发模型、投产机房、领取旗舰奖励、Stage 2 结算、技术迭代。
- 待领取资金报价持久化，领取 exactly-once；日期回拨时不产生负时长或重复区间。

## Exactly-once

- 首服授予：`workshop.firstServerAwarded`。
- Stage 2 结算：`stage2.settlementShown`。
- 机房投产：按 `machineRooms` index 去重；60 个真实墙钟秒 ×4 红利重新触发时刷新时长、不叠层。
- 旗舰领奖：完成时快照 `pendingReward.rewardMultiplier`；领取后清空并写入 `completedIds`，资金奖励 exactly-once。
- 集群架构：3/5/8 台按固定顺序自动永久解锁，无三选一、active 或重复领取。
- 第一次迭代：`canIterate` 前置校验 + 单事务重置；连续提交仅第一次成功。

## 导入、导出与重置

- 工具栏“导出存档”调用正式 `export_json`，下载 JSON。
- “导入存档”打开隐藏文件选择器；解析、schema 校验和写盘任一步失败均保留当前档。
- 导出后导入保持状态幂等；未来 schema 拒绝导入。
- 重置需 UI 二次确认，生成新的正式存档；QA 检查点继续遵守隔离命名空间。

## 已冻结的兼容语义

- 存储只提高旗舰最终资金奖励和资金/研发共享离线上限；不影响工程速度、吞吐、总算力或直接收入。
- `computeCenterLevel` 只保留读取兼容，运行时恒为 0，不再参与 UI、命令、入口或倍率。

## 云存档

本轮禁止接入云存档。`SaveStorage` 抽象仅是未来扩展点，不构成云能力或发布承诺。
