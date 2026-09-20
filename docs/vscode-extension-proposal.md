# VS Code 原生 Git 练习扩展方案

日期：2026-09-20。用户已确认优先 Windows 本地文件夹。三个单元的首版扩展已实现，运行与验收说明见 [扩展文档](../vscode-extension/README.md)；以下保留路线与范围决策。

## 目标与使用流程

让学习者在日常使用的 VS Code 编辑器、Source Control、差异视图、合并编辑器和终端中练习真实 Git。扩展负责创建练习、解释任务、检查仓库结果和保存进度。

一次练习的流程：

1. 运行「Git Onboarding：开始练习」，选择课程与引导/挑战模式。
2. 扩展创建专用练习目录，在独立 VS Code 窗口打开。
3. Source Control 中出现原生 Git 仓库，并增加「Git 练习」视图，显示目标、条件、逐级提示和检查入口。
4. 使用编辑器修改文件，通过 Source Control 暂存、提交、处理分支和冲突；必要时使用集成终端。
5. 仓库变化后自动更新条件；手动「检查结果」显示本次检查时间、仓库/分支/提交、逐项依据、未完成原因，以及下一步入口。

练习按仓库状态判定，不要求固定命令，也不能仅凭最终状态证明使用过某个按钮。引导文案提供「Source Control 操作」与「对应 Git 概念/命令」，帮助迁移到实际工作。

## 路线比较

| 路线 | 适合场景 | 主要取舍 |
| --- | --- | --- |
| Windows 本地 Git，推荐作为首版 | 日常直接打开 Windows 项目的用户 | 最贴近日常使用，免去专用 WSL 初始化；引擎需要 Windows 适配，本地练习目录不提供系统级隔离 |
| Remote WSL 工作区 | 日常在 WSL 开发，或需要 Linux 课程工具 | 可复用较多 Linux 实现；需要适配远程扩展环境，当前专用隔离发行版不能直接视作已兼容的 VS Code Server 环境 |
| 本地基础课程 + 隔离环境进阶课程 | 后续需要同时覆盖便捷练习和高风险场景 | 覆盖面更广，但环境切换、安装和测试成本最高，不适合作为首版闭环 |

推荐在现有仓库中新增扩展目录，共享课程与判题实现。桌面版保留可用版本，首批插件验证完成后再决定是否作为主入口。

## 已确认可复用的部分

- `runtime/lessons.json`：现有 62 个单元的课程资料，可逐批补充 Source Control 引导。
- `runtime/engine.py`：通过标准输入/输出接收和返回 JSON，已有 `init`、`state`、`probe` 等动作；判题不依赖 Electron 或终端输入记录。
- `runtime/advanced.py` 等课程模块：真实仓库布置与判题规则，以及现有真实 Git 测试用例。
- 引导/挑战两种模式、练习保留与重置、本地进度等产品行为。

不需要复制桌面版的文件编辑器、xterm 终端和提交图；对应能力使用 VS Code 的现有界面。

## 必须改造和验证的部分

现有引擎不能原封不动地在 Windows 运行：练习根目录固定为 `/home/student/labs`，环境变量使用 `/dev/null`、`cat`、`true`，部分接口依赖 `os.getuid`、`O_NOFOLLOW` 等 Unix 行为。高级课程还依赖 Bash、钩子、HTTP 服务、LFS 和签名工具。

建议在课程引擎内部集中处理路径、Git 可执行文件、工具能力和运行环境差异，保留小而明确的创建/读取状态接口。扩展负责 VS Code 交互，不重复实现一套判题逻辑。文件编辑由 VS Code 完成，扩展不需要调用桌面版的 `read/write` 编辑接口。

原生 Git 与判题必须使用同一个实际仓库，并核对 Git 可执行文件、换行符、身份、签名、过滤器和钩子等会影响结果的设置。仅给 Python 子进程设置环境变量不会自动影响 Source Control 启动的 Git。课程需要的配置应限制在专用练习仓库或练习窗口内，并验证真实 Source Control 行为。

首版依赖 Git for Windows 与 Python 3.11+；首次运行先检测并明确提示缺失依赖。若后续要做到只安装扩展即可练习，再评估随平台分发 Python 运行时；不因界面迁移立即重写整个引擎。

原生模式只对扩展创建且验证所有权的练习目录执行初始化/重置，不自动将当前工作项目当作练习。终端仍具有当前用户权限，不能沿用桌面版「无法接触宿主机文件」的隔离承诺。练习远端优先使用本地 bare 仓库。

## 首版范围与验收

先完成三个端到端单元，每个都支持引导和独立挑战：

- 基本提交：编辑文件、查看差异、暂存、提交和查看历史。
- 分支协作：创建分支、模拟队友更新、fetch、解决真实冲突、合并和推送到练习远端。
- 误操作恢复：丢弃指定修改、取消暂存并保留草稿、恢复错误提交。原生界面未覆盖的动作明确引导到集成终端。

验收关注实际学习流程：

1. 使用 VS Code 原生 Source Control 完成提交，判题正确通过。
2. 文件已保存但未暂存、已暂存但未提交、仍有冲突等情况，显示可核对的未完成原因；未保存缓冲区单独提醒。
3. Source Control、集成终端及外部 Git 修改均能使状态最终更新；支持手动复查，避免并发检查覆盖新结果。
4. 协作练习可以通过原生冲突视图解决，远端引用与提交关系符合目标。
5. 关闭并重新打开窗口后，练习与进度保留；引导/挑战分别保存。
6. 重置只作用于当前被验证的练习；普通项目不会被接管。
7. 遵循 VS Code 原生主题、缩放和编辑器/终端字体设置，验证浅色、深色、高对比度和大字号。

交付可安装的 `.vsix`、使用说明和真实 VS Code 集成测试记录。先在 GitHub Release 分发；上架 Marketplace 属于单独的后续发布步骤。其余课程按环境能力分批迁移，通过验证后才标为支持。

## 官方依据

- [Source Control 功能](https://code.visualstudio.com/docs/sourcecontrol/overview)：原生暂存、提交、分支、同步、冲突处理与历史视图。
- [Tree View](https://code.visualstudio.com/api/extension-guides/tree-view)：扩展可向 `scm` 容器贡献练习视图。
- [内置 Git 扩展公开接口](https://github.com/microsoft/vscode/blob/main/extensions/git/README.md)：可获取 Git 扩展接口；首版使用它识别仓库、接收状态变化，不新增重复的 Git provider。
- [远程扩展](https://code.visualstudio.com/api/advanced-topics/remote-extensions)：工作区扩展随仓库运行于本地或远程环境；第三方运行时仍需分别验证。
- [Webview 主题适配](https://code.visualstudio.com/api/extension-guides/webview#theming-webview-content)：少量必要的课程详情页可使用 VS Code 主题和字体变量。
