# Git Onboarding

一个面向 Git 新手的中文桌面练习应用。从第一次提交，到分支协作、冲突处理和误操作恢复，在真实 Git 仓库里练习。

**开发中：0.2.0 系统课程扩展。** 当前源码包含 11 个课程、22 个引导/挑战场景，新增 rebase（含冲突与交互整理）、cherry-pick（含冲突）、stash、reflog，以及 origin/upstream 双远端的离线 Fork/PR 评审合并流程。课程可以按分类和命令搜索。完整覆盖工作仍在进行，见 [覆盖矩阵与验收记录](docs/scenario-coverage.md)；0.2.0 尚未发布安装包，下面的下载仍是 0.1.2。

当前发布为 **Windows x64 私有试用版 0.1.2**，采用选定的 J 版 Fluent 2 视觉方向。在 [GitHub Release 下载](https://github.com/LX-Cel/git-onboarding/releases/tag/v0.1.2)安装包 `Git-Onboarding-0.1.2-Setup.exe` 和 SHA256 校验文件；本地构建产物位于 `release/`。项目尚未授予开源许可证；成熟后再决定公开与许可证。

![学习路径](docs/screenshots/home.png)

![真实 Git 练习工作台](docs/screenshots/workbench.png)

## 使用

1. 安装 `Git-Onboarding-0.1.2-Setup.exe`，打开 Git Onboarding。
2. 点击「准备练习环境」。应用验证并导入内置的专用 Linux 镜像；不要求预装 Git 或 Docker。
3. 若尚未安装 WSL，应用请求管理员授权安装系统组件，提示重启后继续。需要支持 WSL 2 的 Windows x64 和已启用的硬件虚拟化。
4. 选择引导练习或直接挑战。文件保存、Git 暂存与 Git 提交是三个不同操作。
5. 进度自动保存在本机。练习仓库会保留；只有确认「重新开始」才重建当前场景。

0.1.1 的入门判题允许自由编写 README 内容，不再要求照抄示例句子。正文、编辑器与终端默认 16px，右上角可选择并保存显示比例。旧环境升级时点击「保留练习并更新」，只替换课程程序，保留练习文件、提交历史和进度。

0.1.2 将工作台改为浅色导航、上方编辑器、下方完整终端和右侧详情面板。右侧切换任务、仓库状态与提交图；手动检查显示本次仓库记录、完成条件和未保存提醒，通过后可以进入独立挑战或下一关。安装到原应用目录即可更新桌面程序；0.1.1 的练习镜像无需重新初始化。任务背景与操作引导可折叠，200% 显示比例时布局重排。

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

生成 `release/Git-Onboarding-0.1.2-Setup.exe`。打包前会验证镜像 SHA256、课程版本及课程更新包与源文件的一致性，镜像不写入 Git。安装包内含镜像，不要求用户安装构建工具。

仅修改课程代码时，可用 `npm run runtime:refresh` 更新已校验的本地镜像及课程更新包，无需重新下载 Linux 软件包。跨版本保留数据测试为 `npm run test:upgrade`，需要先将 v0.1.0 发布附件的 `runtime.tar` 放在 `.local/runtime-v0.1.0.tar`。

桌面版本使用 `package.json.version`；课程兼容版本使用 `package.json.courseVersion`，并与 `runtime/engine.py` 的 `COURSE_VERSION` 保持一致。仅界面改版不提升课程版本，不重建用户练习。课程代码有变化时同步提升课程版本并刷新镜像，打包会检查版本、哈希和课程源文件一致性。

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
