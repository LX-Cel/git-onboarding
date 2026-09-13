# 系统扩展验收 · 0.2.0-preview.3

本次目标是将三关入门程序扩展为覆盖核心 Git 开发、协作、维护与故障恢复的练习软件，并保留完整终端、Windows 本地隔离、既有数据和 Fluent 2 界面。不是以“终端能输入命令”代替课程覆盖。

## 要求与直接证据

| 要求                         | 实现与验收入口                                                                 | 已验证行为                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rebase 与历史整理            | `runtime/advanced.py`、`runtime/teamwork.py`；`test:advanced`、`test:teamwork` | 正常重放、真实冲突、continue/abort、交互 fixup、onto/autosquash；实际 nano 编辑清单通过桌面测试                                                                 |
| cherry-pick 与回移           | `runtime/advanced.py`；`test:advanced`                                         | 指定功能回移、真实冲突和恢复，排除不应交付的改动                                                                                                                |
| origin/upstream 与 Fork/PR   | `runtime/hosting.py`、`src/HostingPanel.jsx`；`test:hosting` 与桌面测试        | 双远端、功能分支、PR 创建、请求修改、补充提交、评审、过期检查、冲突、三种合并、主线同步和保护拒绝                                                               |
| 基础、远端、发布、维护与恢复 | 覆盖矩阵及 `foundations/maintenance/teamwork/extensions.py`                    | init/clone、跟踪、pull、推送拒绝/租约、stash/reset/reflog、标签、补丁/bundle、worktree/bisect、子模块、sparse/shallow、attributes、fsck/gc、签名/LFS/假凭据清理 |
| 认证和权限诊断               | `runtime/access.py`；`test:access`、`test:access-lifecycle`                    | 实际 HTTP challenge、错误凭据与权限拒绝、多账号匹配、Fork 推送；服务在终端关闭时回收                                                                            |
| 综合任务                     | `runtime/capstone.py`；`test:capstone`                                         | 入职交接、发布补丁与共享历史恢复、多人并发整合、遗留仓库找回原提交；分别保护个人笔记、队友内容和两层草稿                                                        |
| 自由实验                     | `runtime/capstone.py`、`src/CheckResult.jsx`                                   | 双远端与队友仓库，保留冲突和未完成工作；可重新初始化自己的仓库，无固定判题、无虚假通关记录，不占通关进度分母                                                    |
| 引导、挑战、续练和重置       | `runtime/lessons.json`、各场景测试、桌面测试                                   | 61 门判题课程各有两种模式，另有两个自由工作区；复用现有仓库，只有确认后重置当前场景                                                                             |
| Windows 真实终端与旧数据更新 | `desktop/runtime.cjs`、`runtime/relay.py`；`test:runtime`、`test:upgrade`      | Bash、PTY、nano、resize/Ctrl+C；0.1.0 提交、暂存区、工作区及进度保留；系统和练习工具离线更新                                                                    |
| 字体、检查反馈与桌面分发     | `tests/electron.spec.cjs`、发布记录                                            | Fluent 2 工作台、16px 默认字体与缩放、重复手动检查都有反馈；构建出的程序及安装器解包内容经过验证                                                                |

## 运行结果

实际 Git 断言：63 + 114 + 148 + 150 + 227 + 207 + 94 + 146 + 108 = **1257** 项。另有 **26** 项打包程序桌面测试、**6** 项 Node 测试、**6** 类工具归档拒绝、**6** 次服务生命周期，以及隔离/PTY 和旧镜像保留数据升级测试通过。

安装器解出的可执行文件、app.asar、课程和离线工具与实测包哈希一致；在独立空数据目录完成初始化、提交判题、重置及重新打开续练。依赖审计为 0 个已知漏洞；生产构建通过，仍有非阻断的大 JS 包提示。安装包及校验值见 [preview.3 发布记录](release-0.2.0-preview.3.md)。

## 明确边界

有限课程不可能穷尽所有 Git 扩展、托管平台和企业配置。本地 PR/检查与 HTTP 认证是教学环境，不登录个人 GitHub，不模拟企业 SSO/TLS；Windows ARM64、其他操作系统与无 WSL 的全新设备没有在本机实测。安装器未代码签名；本次没有覆盖用户现有安装实际执行 NSIS 升级。这些边界不以通过核心工作流测试来替代验证。
