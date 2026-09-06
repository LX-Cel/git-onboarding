# Git Onboarding

一个面向 Git 新手的中文桌面练习应用。从第一次提交，到分支协作、冲突处理和误操作恢复，在真实 Git 仓库里练习。

当前已发布 **Windows x64 私有试用版 0.1.0**；正在验证 0.1.1 修复版本。项目尚未授予开源许可证；成熟后再决定公开与许可证。

![学习路径](docs/screenshots/home.png)

![真实 Git 练习工作台](docs/screenshots/workbench.png)

## 使用

1. 安装 `Git-Onboarding-0.1.0-Setup.exe`，打开 Git Onboarding。
2. 点击「准备练习环境」。应用验证并导入内置的专用 Linux 镜像；不要求预装 Git 或 Docker。
3. 若尚未安装 WSL，应用请求管理员授权安装系统组件，提示重启后继续。需要支持 WSL 2 的 Windows x64 和已启用的硬件虚拟化。
4. 选择引导练习或直接挑战。文件保存、Git 暂存与 Git 提交是三个不同操作。
5. 进度自动保存在本机。练习仓库会保留；只有确认「重新开始」才重建当前场景。

0.1.1 的入门判题允许自由编写 README 内容，不再要求照抄示例句子。正文、编辑器与终端默认 16px，右上角可选择并保存显示比例。旧环境升级时点击「保留练习并更新」，只替换课程程序，保留练习文件、提交历史和进度。

练习环境在初始化完成后不连接外部网络。远端和队友都位于练习环境内，使用真实 Git 仓库；不需要 GitHub 账号。本项目源码的 GitHub 托管与练习远端是两件不同的事。

安装包暂未代码签名，Windows 可能显示未知发布者提示。首次系统组件安装可能需要联网。家庭版、全新未安装 WSL 的机器、企业受限设备和 Windows ARM64 尚未完成实机验收；ARM64 不在此包支持范围内。

## 首版课程

| 单元 | 带练与独立挑战的内容                                                  |
| ---- | --------------------------------------------------------------------- |
| 入门 | 修改文件、查看差异、暂存、提交、查看历史                              |
| 协作 | 功能分支、模拟队友、fetch、真实合并冲突、合并到 main、push 到内置远端 |
| 恢复 | 丢弃指定未暂存修改、取消暂存并保留草稿、revert 修正错误提交           |

每个单元提供任务目标、逐级提示、实际状态判题、工作区/暂存区可视化、真实父子关系提交图。引导步骤可自由阅读；阅读下一步不代表通过，实际仓库状态才决定完成。

## 开发

需要 Windows x64、Node.js 24、npm、Python 3.11+、WSL 2、系统自带的 curl.exe。

```powershell
npm ci
npm run runtime:build
npm test
npm run test:runtime
npm run build
npm run test:ui
npm start
```

`runtime:build` 从 Alpine 官方 HTTPS 地址获取稳定版元数据并验证 rootfs 的 SHA256，在本次创建的 UUID 发行版中安装 Bash、Git、Python、bubblewrap 等包，导出内置镜像，之后注销本次创建的构建发行版。**不修改现有 Ubuntu 或其他发行版**。构建失败时保留 `.local/runtime-build/owner.json`，方便识别本次构建资源；不要对其他发行版执行清理。

`npm run dev` 仅提供网页界面预览，明确提示真实终端需要桌面应用；不模拟命令成功。

```powershell
npm run package
```

生成 `release/Git-Onboarding-0.1.1-Setup.exe`。打包前会验证镜像 SHA256、课程版本及课程更新包与源文件的一致性，镜像不写入 Git。安装包内含镜像，不要求用户安装构建工具。

仅修改课程代码时，可用 `npm run runtime:refresh` 更新已校验的本地镜像及课程更新包，无需重新下载 Linux 软件包。跨版本保留数据测试为 `npm run test:upgrade`，需要先将 v0.1.0 发布附件的 `runtime.tar` 放在 `.local/runtime-v0.1.0.tar`。

测试安装后的真实应用（包含空格的路径也支持）：

```powershell
$env:GIT_ONBOARDING_EXECUTABLE = '完整路径\Git Onboarding.exe'
npm run test:ui
Remove-Item Env:\GIT_ONBOARDING_EXECUTABLE
```

图标已包含在仓库中；如需重新生成，运行 `python scripts/make-icon.py`，该可选脚本需要 Pillow。

## 代码结构

```text
src/                 React 界面、xterm.js、提交图布局
desktop/             Electron 主进程、最小 IPC、WSL 生命周期与 PTY 通道
runtime/             课程规格、真实 Git 场景与判题、sandbox、PTY relay
scripts/             镜像构建、镜像验证、真实环境测试
tests/               逻辑测试、Linux 实测、Electron 端到端测试
docs/                产品边界、技术选型、隔离边界、验收记录
resources/           镜像清单与未纳入 Git 的 runtime.tar
```

详情见 [产品与架构](docs/architecture.md)、[隔离边界](docs/isolation.md)、[字体尺度与依据](docs/typography.md)、[验收记录](docs/validation.md)。

## 数据与卸载

Windows 用户数据默认位于 Electron 的应用用户数据目录（通常 `%APPDATA%/git-onboarding`）。其中 `runtime-owner.json` 记录应用自己的发行版和磁盘位置，`progress.json` 保存完成记录。测试数据位于项目 `.local/`。

卸载桌面应用不会擅自注销发行版或删除练习历史。清理时应先备份并核对 `runtime-owner.json`，确认是本应用创建的发行版，再由用户决定删除。不要使用通配符批量注销 WSL 发行版。

## 后续范围

云端运行、真实 GitHub 认证与 PR、rebase/cherry-pick/reflog、AI 反馈、多平台安装包、自动更新和学习账号均不属于此首版。
