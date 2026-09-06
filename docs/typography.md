# 字体与字号

2026-09-06 根据实际 Windows 练习截图调整。旧版存在 8–11px 的辅助文字，任务说明和终端偏小，多处灰色文字对比度不足。

## 采用的尺度

| 用途                     | 默认字号  | 行高 / 字体                                             |
| ------------------------ | --------- | ------------------------------------------------------- |
| 任务正文、目标、差异内容 | 16px      | 1.65；Segoe UI、Microsoft YaHei UI                      |
| 编辑器、终端             | 16px      | 24px；Cascadia Code、Consolas，中文回退 Microsoft YaHei |
| 按钮、导航、命令提示     | 14px      | 按用途留出点击区域和行距                                |
| 时间、状态附注、快捷键   | 至少 12px | 不用于大段说明                                          |
| 页面标题                 | 28px      | 用字重和间距建立层级                                    |

这些数字是 CSS 逻辑像素，会叠加 Windows 显示缩放。右上角支持 100%、125%、150%、200%，退出后保留；Ctrl + 加号/减号调整，Ctrl + 0 恢复默认。窗口较窄或大字号下，编辑器和仓库状态改为纵向排列，避免通过缩小字体塞入内容。

## 依据与取舍

[Microsoft Fluent 2 Typography](https://fluent2.microsoft.design/typography) 的 Web 类型尺度包括 caption 12/16、body 14/20、subtitle 16/22；Windows 同样以 14/20 为常规正文。练习任务需要连续阅读中文，因此本项目将主要正文提高到 16px，而非照搬所有默认值。

[WCAG 2.2 对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) 要求普通文字与背景至少 4.5:1；本次加深浅色背景上的灰色和绿色文字，并提高深色终端中错误文字的亮度。

[WCAG 2.2 文字缩放说明](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) 关注放大至 200% 时仍可使用。WCAG 并没有规定所有正文必须为 16px。本次验证字体与布局改善，不宣称整个应用已经通过完整的 WCAG 合规审计。
