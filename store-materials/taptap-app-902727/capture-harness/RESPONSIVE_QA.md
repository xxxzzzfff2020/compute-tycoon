# Capture harness 手机视口有界返修

状态：PASS；仅影响商店素材取景页，不影响正式 H5 根入口或玩家语义。  
返修次数：1（符合 `bounded_rework_limit: 1`）。

## 问题与修复

- 问题：`mode=video` 原先固定 `#app width:430px; zoom:3.1`。在430×932与390×844视口中，放大后的画布超过可用内容宽度，右侧正文与第4个“菜单”Tab被裁。
- 大视口：1615×908继续使用原430px设计宽与3.1×构图。
- 小视口：保留完整430px设计画布，按 `document.documentElement.clientWidth / 430` 计算安全缩放（上限3.1）；缩放施加于整个body，使fixed底栏与正文一起缩放。resize与ResizeObserver会重新同步。
- default/screenshot：不设置安全缩放变量，继续使用正式UI原生430px/1×布局。

## 最终浏览器验收

所有截图均在应用内浏览器设置精确视口、等待1800ms稳定后，以原生viewport screenshot生成；四张均已逐张查看。

截图文件只包含浏览器内容区，因此像素分别为1600×900、415×899、375×812、720×1280；对应请求视口仍是表中的1615×908、430×932、390×844、735×1307，差值来自浏览器滚动轨道/外壳，不是页面裁切。

| 场景 | 最终指标 | 视觉结论 | 证据 |
|---|---|---|---|
| 1615×908 `mode=video` | app zoom 3.1；绘制宽1333；x=133.5..1466.5；scrollWidth/clientWidth=1600/1600 | 与既有录屏构图一致；顶部、正文、四Tab完整 | `../evidence/capture-harness-iab-1615x908-video.png` |
| 430×932 `mode=video` | body zoom 0.965116；完整430px画布绘制为415px；scrollWidth/clientWidth=415/415 | 资金、右侧正文、双列卡片、四Tab完整 | `../evidence/capture-harness-iab-430x932-video.png` |
| 390×844 `mode=video` | body zoom 0.872093；完整430px画布绘制为375px；scrollWidth/clientWidth=375/375 | 右侧正文与第4个“菜单”Tab完整，无横向溢出 | `../evidence/capture-harness-iab-390x844-video.png` |
| 735×1307 default | mode=screenshot；body/app zoom 1；app 430px居中；scrollWidth/clientWidth=720/720 | default/screenshot无回归，四Tab完整 | `../evidence/capture-harness-iab-735x1307-default.png` |

浏览器warning/error日志：0条。

## 证据口径

- 负责人原始反馈：`../evidence/capture-harness-iphone14pm-overflow-before.png`。
- `evidence/rejected-captures/harness-responsive-renderer-mismatch/` 内为本地HTML渲染器输出；它把指定输出宽度与实际内容视口/滚动轨道处理不一致，连default参考也发生右裁，因此不得作为最终PASS证据。
- 最终上传候选截图和已编码实机视频没有被本次返修改写；只修复后续打开取景页时的小视口显示。
