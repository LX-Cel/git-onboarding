# 现代风格参考与新一轮视觉稿

调研日期：2026-09-07。用户明确否定复古方向，本轮限定现代生产力工具，避免复古、宋体标题、海报式字号和粗重边框。使用内置 image_gen 分别生成概念图，完整提示词见 prompts.json。未替换应用代码或安装版本。

## 一手参考

- Linear，2026-03-12：[A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh)。参考侧栏降低视觉权重、减少图标装饰、柔化分隔和统一控制区域。浅色方案是本项目的适配推导，并非 Linear 原图或逐像素复刻。
- [Raycast 官方 Themes](https://manual.raycast.com/themes) 与 [Windows 产品页面](https://www.raycast.com/windows)。参考深色表面、列表选中层次和紧凑操作提示。[Warp 终端文档](https://docs.warp.dev/)仅辅助理解现代终端的信息组织，不引入其 AI 或命令块功能。
- [Microsoft Fluent 2 Material](https://fluent2.microsoft.design/material)。参考 solid / Mica 层次；Mica 是带轻微桌面底色的非透明材质，Acrylic 适合临时弹出区域，正文与代码区域使用不透明表面保障阅读。

以上来源是设计借鉴，风格的适用性判断为本项目设计判断，不是产品排名。浏览器可视加载超时，页面正文与图片搜索可读取；没有将截图逐像素采样或当作图像生成附件。

## 三版取舍

原图：h-modern-light.png、i-modern-dark.png、j-modern-fluent.png。生成结果已检查：H 个别编辑器中文出现字形偏差；三版出现额外标签页按钮；J 将提示词的左右编辑区改成上下结构，并把学习路径标为选中。后续原型应校正这些功能与文案细节。这些图用于选视觉方向，不作为实际功能和精确文案验收依据。

| 方向 | 视觉重点 | 取舍 |
| --- | --- | --- |
| H 浅色精密工作台 | 中性浅灰、弱边界、浅色终端、一体化工作面 | 更适合白天和教学，变化克制 |
| I 深色现代工具 | 烟灰色层次、细边缘、珊瑚色小面积强调 | 终端氛围较强，偏好暗色的用户更适合 |
| J 轻盈 Fluent | 冰蓝色底层、白色工作面、柔和材质层次 | 更贴近现代 Windows，需控制装饰与实现成本 |

标题目标 26–28px，正文约16px，控件14–15px，终端16px，仅作为后续原型起点。[Fluent 官方排版规范](https://fluent2.microsoft.design/typography)提供了分平台字号和字重层级；其中 Windows Body 为14px/20px、Title 为28px/36px。本项目考虑用户此前反馈，练习正文采用更大的16px起点，而非机械照搬。生成图的字形和尺度是示意，正式实现需用可用且授权合适的中文字体验证100%缩放、不同分辨率和长文本。图中任何额外按钮或图标不等于已经提供功能。
