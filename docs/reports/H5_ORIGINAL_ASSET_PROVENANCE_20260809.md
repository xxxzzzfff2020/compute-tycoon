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

- 项目路径：`public/assets/audio/compute-tycoon-stellar-tide-v1.mp3`
- 曲名：`算力星潮`
- 用途：经营、地月与戴森阶段共用的分段原创 BGM；地球 0–76 秒、地月 76–152 秒、戴森 152–227.5 秒，阶段切换时跳至对应段落并在段内循环。
- 生成方式：TapTap Maker `text_to_music`，V4.5、自定义模式、纯音乐，无外部参考音频。
- 生成任务：`temp_f90aa34d-d77c-461e-9ef4-a3ba200e94f6`；音乐记录 `1b86f853-0a8d-4374-9c14-c1337682b4c1`。
- 提示词摘要：暖色模拟合成器、柔和钢琴、克制木琴脉冲与低频打击，88 BPM；从创业专注逐渐进入服务器网络和银河尺度；排除人声、持续电流嗡鸣、刺耳高频、失真和强烈 EDM drop。
- 项目版本：约 227.96 秒；转码为 44.1kHz 双声道 80kbps MP3，约 2.2MB。
- 接线方式：BGM 使用 HTML Audio；WebAudio 只保留低频率的里程碑短音效，不再以连续振荡器合成背景音乐。
- 回退方式：恢复 `src/audio/game-audio.ts` 的旧程序化环境音实现或关闭 BGM；不影响玩法、存档或数值。

以上音画均为本轮负责人体验候选。生成成功和本地接线不等同于最终素材采用、真机音频通过或发布许可。
