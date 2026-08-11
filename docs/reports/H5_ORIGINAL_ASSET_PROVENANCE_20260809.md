# 《算力大亨》H5 原创表现资产来源记录

日期：2026-08-09
状态：`OWNER_REVIEW_CANDIDATE`，不等同于商店最终采用或 Release 通过。

## 终局主视觉

- 项目路径：`public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg`
- 用途：戴森算力球主线完成弹窗顶部主视觉。
- 生成方式：Codex 内置 `image_gen`，全新生成，无外部参考图。
- 原始生成文件：`$CODEX_HOME/generated_images/019fb3e5-f0bc-7ce1-9531-83b0dec876d4/exec-16efbaee-7aaf-4cd3-b103-8377571e54a1.png`
- 项目版本：由 1536×1024 PNG 缩放并压缩为 1152×768 JPEG（质量 84），约 263KB。
- 提示词摘要：金色戴森计算球点亮恒星，轨道计算环与银河数据网络；深海军蓝、金、紫、少量青色；移动端深色文字经营游戏终局横幅；无人物、无猫、无文字、无 Logo、无水印。
- 回退方式：删除弹窗中的 `.story-complete-visual` 节点与对应 CSS，即恢复原纯 CSS 终局卡；不影响玩法、存档或数值。

## 音频

- 2026-08-11 裁决：原单曲《算力星潮》及分段播放方案已被负责人否决并从公开资产中移除。
- 替代方案：Stage 1–5 使用 `Solo Spark`、`Cluster Pulse`、`Compute Citadel`、`Earth Moon Relay`、`Dyson Ascension` 五首独立纯音乐。
- 生成方式：TapTap Maker `text_to_music`，V4.5、自定义模式、纯音乐，无外部参考音频。
- 项目版本：五首均保留完整生成时长，统一转码为 44.1kHz 双声道 80kbps MP3；不从旧曲取样、不把一首曲目切片复用。
- 接线方式：BGM 使用 HTML Audio；阶段切换时更换文件并从头独立循环。WebAudio 只保留低频率里程碑短音效。
- 完整曲目、生成 ID、时长与文件映射见 `docs/oss/BGM_GENERATION_RECORD.md`。
- 回退方式：在设置中关闭 BGM；不影响玩法、存档或数值。

以上音画均为本轮负责人体验候选。生成成功和本地接线不等同于最终素材采用、真机音频通过或发布许可。
