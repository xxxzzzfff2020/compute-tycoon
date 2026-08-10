# MAT_03｜品牌素材清单

状态：负责人审阅候选；尚未上传 TapTap  
游戏身份：`算力大亨` / TapTap app `902727` / miniapp `tapmcix1sdc8m7ybwj`  
视觉主张：金色戴森算力球、深海军蓝宇宙、紫色轨道信号；统一表达“从 AI 创业工作室到银河算力大亨”。

## 推荐候选

| # | 项目 | 文件 | 规格 | 大小 | SHA-256 |
|---:|---|---|---|---:|---|
| 1 | 宣传图 | `01-promo-1920x1080.jpg` | 1920×1080，JPG | 372,400 B | `841d46364e29181d2c6d715eb32440119a823e911212205c45592170d96d1e76` |
| 4 | 游戏 Logo | `04-logo-1600x720.png` | 1600×720，透明 PNG | 137,831 B | `b8a6bb665111a6d2eb757aaabf89df0baa375b98dc656b4a2e3332e52cd66562` |
| 5 | 库页面背景图 | `05-library-background-3840x1240.jpg` | 3840×1240，JPG | 508,658 B | `9da38aedd0c97012c6fd01240e48a026214fefbdf6c1ca7fa03bac3366d3c952` |
| 6 | 横版封面 | `06-cover-horizontal-460x215.jpg` | 460×215，JPG | 33,351 B | `4cc17079455123b33efa85f670230c1c258e83472f89fc975d54a0561a9f0c70` |
| 7 | 竖版封面 | `07-cover-vertical-600x900.jpg` | 600×900，JPG | 143,125 B | `80e04a86cd761bf705bbc5ded01a42311e5f31746d29654e6fc6b0aeebca292c` |

## 来源、生成方式与许可

- 背景核心图：项目现有 `public/assets/visuals/dyson-compute-sphere-keyart-v1.jpg`。该图是本项目在当前候选开发中使用 ImageGen 从零生成的原创候选，无外部参考图；原始来源记录见 `docs/reports/H5_ORIGINAL_ASSET_PROVENANCE_20260809.md`。
- 宣传图、库背景、横封、竖封：由 `brand-assets/source/` 中的 HTML/CSS 进行确定性裁切、色彩叠层和排版；未叠加第三方品牌、外链、按钮或未实现玩法图示。
- Logo：由 `brand-assets/source/logo.svg` 以基础矢量几何、系统中文字体回退和金色渐变排版后渲染；名称严格保持“算力大亨”，透明区域保留 alpha。
- 权利口径：上述版式源、字标和项目原创 key art 均作为项目自有候选使用；未引入新的外部素材许可依赖。

## 内容与安全区 QA

- 宣传图：仅出现游戏名称；不含游戏图标、副标题、卖点、按钮、设备或真实人物。`evidence/brand-qa/promo-centered-4x3-safe-crop.jpg` 证明居中 4:3 裁切后名称与戴森球主体仍完整。
- Logo：1600px 宽，满足“宽≥1280或高≥720”；透明背景；字面尽量贴边且保留必要呼吸空间。
- 库背景：无文字或 Logo；左下最大 400px UI 区为深色留空，重要主体位于中上；右上自动 Logo 区没有额外文字。
- 横版封面、竖版封面：只出现“算力大亨”字标；缩至最终尺寸后仍清晰、高对比。
- 全部最终文件的像素尺寸、格式、透明通道和体积已用本地元数据工具复核，均低于冻结上限。

## 可复现文件

- `brand-assets/source/`：全部品牌版式源。
- `evidence/brand-source-renders/`：最终压缩前母版 PNG。
- `evidence/brand-qa/`：裁切安全区证据。

## 负责人追加范围｜方形游戏图标

| 项目 | 文件 | 规格 | 大小 | SHA-256 |
|---|---|---|---:|---|
| 方形游戏图标 | `00-game-icon-1024x1024.png` | 1024×1024，PNG，不透明、满版直角方图 | 1,313,018 B | `9f66561a21cd884ce4541912bf1c2fe9a290213ae0c4e9b9af2bb2170aaa0bc5` |

- 来源：沿用项目原创 `dyson-compute-sphere-keyart-v1.jpg`，以 `source/game-icon-square.html` 进行确定性正方形构图、调色与轨道叠层；未引入第三方素材。
- 视觉：以居中的金色戴森算力球为核心识别，不放缩小后不可读的长标题；深空紫蓝背景与既有品牌素材一致。
- QA：原图与 `evidence/brand-qa/game-icon-128px-preview.png` 均已逐张查看；128px 下球核、轨道和深空轮廓仍清楚。元数据确认为 PNG、1024×1024、无 alpha；没有透明缺口或预制圆角。
- 状态：这是负责人在原8项以外明确追加的本地候选。当前线上270×270图标未改动，未上传、未保存线上资料。
