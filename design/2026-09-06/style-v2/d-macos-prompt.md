# D · macOS 风格概念

使用内置 image_gen 生成。仅为视觉方向预览，不表示已支持 macOS。系统字体字形是模型示意；Windows 实现需要选择可用且授权合适的字体。图中的分屏和新增终端按钮为模型补充，实际实现应按已支持的功能收敛。

## 完整提示词

Use case: ui-mockup. Create a single polished high fidelity macOS native desktop application UI concept for a Chinese Git training app called Git Onboarding. Landscape 1536x1024. Show one complete application window filling almost the entire image, straight-on, no device mockup or perspective, no desktop wallpaper. This is an additional visual direction for an existing Windows app, not a claim of macOS support.
Visual direction: authentic restrained contemporary macOS productivity app, reminiscent of the structural clarity of Finder and Xcode. Warm-neutral light gray unified toolbar, subtle frosted sidebar material, near white content surfaces, fine neutral gray separators, macOS red/yellow/green traffic-light window controls in upper left, understated small 8px corner radii, subtle window shadow only. Native system SF Pro-like sans typography with PingFang SC-like clean Chinese sans, balanced normal and semibold weights; SF Mono-like code. Crisp readable text, no serif, no handwriting, no decorative lettering. Native macOS blue #007AFF used sparingly for selected row and primary action. Neutral charcoal body type, clear gray secondary text. No teal, purple, lime, orange themed cards, no gradients, no excessive pills or large rounded card dashboard look. Plenty of disciplined whitespace but workspace remains practical.
Composition and content: Unified compact top toolbar with app title Git Onboarding, workspace title 练习工作台, simple unobtrusive font control 字号 100% and sidebar toggle. Left sidebar around 220px wide, frosted pale gray, small muted section heading 我的练习. Three readable lesson rows with restrained SF Symbols-like outline icons: 你的第一次提交 (selected with native blue highlight and white text), 和队友一起开发, 从容地修正错误. Bottom sidebar subtle 本地环境已就绪 with green status dot.
Main area above panels: title 你的第一次提交 in semibold modern Chinese sans around28px, below concise mission 在 README.md 中写下学习记录，然后创建一次提交。 To right native segmented control 引导练习 | 独立挑战 with 独立挑战 selected, and understated restart circular arrow button.
Middle main area two roughly equal width large panes about60% height separated by a thin divider. Left is light native code editor: tab README.md, visible 保存 button with small icon, subtle line-number gutter. Content exact:
# Git 学习手册

学习从这里开始。

今天完成了第一次提交。
Right is full dark neutral charcoal terminal with compact native pane header 终端 · Bash, simple clear icon. No line numbers in terminal, real command text in readable SF Mono-like typography:
$ git add README.md
$ git commit -m "记录学习成果"
[main 11a701f] 记录学习成果
 1 file changed, 1 insertion(+)
$ git status
On branch main
nothing to commit, working tree clean
$
White/gray terminal text, subtle green prompt, dark neutral #202124 interior. Preserve the readable full terminal, not a decorative sample code tile.
Below both panes, one native macOS inset completion section with quiet success green circular check next to 本关已完成, two compact readable criteria rows README 修改已提交 and 工作区与暂存区干净. Show supporting evidence main · 11a701f and small 刚刚检查. To right a secondary native bordered button 再次检查 and primary macOS blue rounded rectangle 下一关：协作与冲突. Overall success section restrained, not a huge celebratory banner.
Design should look like a professionally designed Mac learning utility with native hierarchy, toolbar rhythm, typography, restrained controls and integrated panes. All Chinese text must be legible. Avoid marketing, illustrations, fake metrics, decorative charts, oversized headings, emoji, heavy outlines, drop shadows on every component or generic web dashboard styling. Opaque full finished screenshot.
