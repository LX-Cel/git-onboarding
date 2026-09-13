# 系统 Git 练习覆盖计划

目标：从三关入门演示扩展为可以练习实际开发、协作、维护和故障恢复的软件。保留 Windows、一次初始化、完整终端、私有仓库和 Fluent 2 界面。不能把“Git 命令可以在终端运行”当作已覆盖：每个场景都需要构造真实初始状态、明确任务、分层提示、状态判题和通过/失败验证。

## 验收规则

- 新手有引导，有经验者可以搜索命令或问题后直接挑战。
- 判题读取提交内容、父子关系、引用、索引、远端和流程状态，不通过命令字符串或提交说明猜测成功。
- 覆盖正常路径、冲突/失败、中断后恢复、重试、重置与进度保留。
- fork/PR 使用两个真实 bare 仓库和离线托管流程；显示来源分支、目标分支、差异、评审与合并状态，不冒充真实 GitHub。
- 升级保留旧课程仓库、提交、草稿和进度；最终提供验证过的 Windows 安装包与 GitHub Release。

## 覆盖矩阵

下表是完整工作范围；状态随证据更新，未验证的代码不算完成。

| 领域         | 必须覆盖的场景                                                                                                                                                 | 当前证据                              |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 基本工作流   | init/clone、status/diff/log/show、add/commit、文件删除与重命名、部分暂存、amend                                                                                | 旧版仅基础提交已验证；其余待补        |
| 分支与整合   | switch/checkout、tracking、fast-forward/no-ff/squash、merge 冲突/abort、rebase 冲突/continue/abort、交互整理/fixup/autosquash、cherry-pick 冲突/continue/abort | 旧版仅普通分支合并冲突已验证          |
| 远程协作     | fetch/pull/push、拒绝推送、分叉历史、origin/upstream、fork、PR 创建/评审/修改/合并/同步清理、force-with-lease、远端重命名/删除/prune                           | 旧版仅单远端 fetch/merge/push 已验证  |
| 保存与恢复   | restore、revert、reset soft/mixed/hard 对比、stash 未跟踪文件/冲突、reflog/分离 HEAD/误删分支、合并撤销、进行中操作恢复                                        | 旧版仅 restore/取消暂存/revert 已验证 |
| 定位与发布   | log 搜索、blame、bisect/run、注释标签/推送标签、hotfix/backport、patch/format-patch/am、bundle                                                                 | 待实现                                |
| 仓库维护     | .gitignore/已跟踪文件、attributes/换行符、worktree、submodule、sparse checkout/shallow clone、对象与引用/fsck/gc                                               | 待实现                                |
| 托管与大文件 | 分支保护/检查失败/合并策略、认证/权限失败诊断、Git LFS、签名及验证、历史敏感内容清理                                                                           | 待实现，凭据仅使用练习材料            |
| 综合任务     | 新人入职、fork 贡献、发布与回滚、多人并发、遗留仓库故障、自由实验区                                                                                            | 待实现                                |

“所有场景”作为持续完善的覆盖目标，不能声称有限课程穷尽所有 Git 扩展与平台差异。平台差异要在课程中说明，核心 Git 与 GitHub 工作流分别验收。

## 2026-09-13 第一批实现与验证

已实现并验证：rebase 正常重放、rebase 冲突/continue/abort、交互 rebase 合并提交、cherry-pick 单提交回移及冲突/continue/abort、stash 包含未跟踪草稿与恢复、reflog 找回原提交、origin/upstream 双远端 Fork/PR 贡献。两种模式均可重置和续练，和原来三关合计 11 个课程、22 个场景。

- `npm run test:advanced`：16 个新增场景、114 项真实 Git 断言。包括错误 merge 不能通过 rebase 判题、空提交不能通过修复判题、本地提交不能代替 push、请求修改不能合并、评审后 push 必须重新评审、PR 合并后必须同步两个 main。
- `npm run test:runtime`：旧 6 个场景、63 项断言与隔离检查、真实 PTY/Bash/resize/Ctrl+C 通过。
- `npm run test:ui`：2 个真实 Electron 测试通过。新增测试从课程搜索开始，实际操作 Fork、终端配置远端/提交/推送、PR 创建、请求修改、补充测试、评审、合并和同步，最后手动检查完成。
- `npm run test:upgrade`：从旧 0.1.0 镜像更新至 0.2.0，提交历史、暂存内容、工作区与进度保留。
- `npm test`：6 项通过；生产构建通过，仍有原有的大 JS 包提示。

这批验证不等于完整矩阵通过。上表未覆盖的路径（例如 rebase --onto、autosquash、stash 冲突、force-with-lease、PR 合并冲突、不同平台认证等）仍需继续实现和验收。尚未构建或发布 0.2.0 安装包。

## 2026-09-13 第二批实现与验证

新增 10 个课程、20 个场景：部分暂存、amend、reset soft/mixed/hard、共享 worktree、bisect 自动回归定位、注释标签发布、已跟踪文件退出索引并保留本地内容、文件重命名与删除。总计 21 个课程、42 个场景。

- `npm run test:maintenance`：148 项断言通过。验证错误提交范围、三种 reset 状态不能混淆、独立 clone 不能替代 worktree、未提交修复不能通过、二分定位错误提交不能通过、轻量标签/错误标签目标/未推送标签不能通过、仅新增忽略规则或删除本地日志不能通过。两种模式都验证完成、续练和重置。
- 原有 `test:advanced` 114 项、`test:runtime` 63 项及真实 PTY、6 项 Node 测试保持通过。
- `test:ui` 3 个 Electron 测试通过，新增部分暂存后提交但保留工作区另一处改动，以及直接在编辑器保存 `.gitignore` 后完成解除跟踪。
- `test:upgrade` 再次验证旧镜像升级后提交、暂存区、工作区及学习进度保留。
- 课程更新增加内容校验，版本相同但文件不同也会提示更新，避免执行旧代码。编辑器允许 `.gitignore`、`.gitattributes`、`.gitmodules`，继续禁止 `.git`、隐藏目录和路径穿越。
- 终端改为在交互 Bash 启动前进入课程目录，首个提示符就绪后开放输入；启动期间输入排队，真实 PTY 测试验证早期输入、resize、Ctrl+C。修复了内部 `cd` 与用户快速输入混杂的竞态。
- bisect 课程通过 `refs/bisect/bad` 保存结果，不假定结束时 HEAD 一定是错误提交；检查脚本直接读取当前源文件，避免快速切换时的字节码缓存影响。

上表“当前证据”的第一批前状态以这两段记录为补充。仍需完成的范围包括 init/clone 专题、rebase --onto/autosquash、stash 冲突、force-with-lease、PR 冲突及合并策略、patch/bundle、submodule/sparse/shallow、换行符、签名/LFS、认证诊断、历史清理与综合任务。完整目标未完成，尚未发布 0.2.0 安装包。

## 一手参考

- [Git 命令参考](https://git-scm.com/docs)
- [Git 用户手册](https://git-scm.com/docs/user-manual)
- [GitHub fork 工作流](https://docs.github.com/en/pull-requests/how-tos/work-with-forks)
- [reset 的状态语义](https://git-scm.com/docs/git-reset)
- [worktree](https://git-scm.com/docs/git-worktree)
- [bisect](https://git-scm.com/docs/git-bisect)

2026-09-13 核查上述官方资料，用于建立覆盖范围；具体场景以隔离环境中的实际 Git 行为验收。
