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

| 领域         | 必须覆盖的场景                                                                                                                                                 | 当前证据                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 基本工作流   | init/clone、status/diff/log/show、add/commit、文件删除与重命名、部分暂存、amend                                                                                | 普通目录 init/本地身份配置、clone/跟踪分支、提交、差异、部分暂存、amend、重命名/删除已验证                   |
| 分支与整合   | switch/checkout、tracking、fast-forward/no-ff/squash、merge 冲突/abort、rebase 冲突/continue/abort、交互整理/fixup/autosquash、cherry-pick 冲突/continue/abort | 普通 merge/冲突/abort、PR squash/rebase、rebase/冲突/onto/autosquash、cherry-pick/冲突已验证                 |
| 远程协作     | fetch/pull/push、拒绝推送、分叉历史、origin/upstream、fork、PR 创建/评审/修改/合并/同步清理、force-with-lease、远端重命名/删除/prune                           | 双远端 PR/冲突/检查、推送拒绝、pull ff-only/rebase/merge、明确租约、远端修复/重命名/prune 已验证             |
| 保存与恢复   | restore、revert、reset soft/mixed/hard 对比、stash 未跟踪文件/冲突、reflog/分离 HEAD/误删分支、合并撤销、进行中操作恢复                                        | restore/revert、三种 reset、stash/冲突、reflog、分离 HEAD、误删分支、撤销 merge、am 恢复已验证               |
| 定位与发布   | log 搜索、blame、bisect/run、注释标签/推送标签、hotfix/backport、patch/format-patch/am、bundle                                                                 | blame/log -S 定位、bisect/run、注释标签、hotfix/backport、format-patch/am/冲突/abort/continue、bundle 已验证 |
| 仓库维护     | .gitignore/已跟踪文件、attributes/换行符、worktree、submodule、sparse checkout/shallow clone、对象与引用/fsck/gc                                               | ignore、attributes/LF/CRLF/二进制、worktree、submodule、sparse/shallow、fsck 悬空恢复与 gc 已验证            |
| 托管与大文件 | 分支保护/检查失败/合并策略、认证/权限失败诊断、Git LFS、签名及验证、历史敏感内容清理                                                                           | 离线 PR/保护/检查/合并策略、真实 SSH 签名、LFS 提交与迁移、假凭据历史清理已验证；认证诊断待实现              |
| 综合任务     | 新人入职、fork 贡献、发布与回滚、多人并发、遗留仓库故障、自由实验区                                                                                            | fork 贡献完整流程已验证；入职、发布回滚、多人并发、遗留仓库排查、自由实验区待补                              |

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

第二批完成时仍需完成的范围包括 init/clone 专题、rebase --onto/autosquash、stash 冲突、force-with-lease、PR 冲突及合并策略、patch/bundle、submodule/sparse/shallow、换行符、签名/LFS、认证诊断、历史清理与综合任务。完整目标未完成，尚未发布 0.2.0 安装包。

## 2026-09-13 第三批实现与验证

新增 12 个课程、24 个场景：推送拒绝后整合、明确租约的共享历史更新、远端地址/命名/prune 修复、rebase --onto、autosquash、stash 冲突、撤销 merge、子模块初始化和 gitlink 升级、cone 稀疏检出、浅克隆/加深/补全、format-patch/am、完整 bundle 离线交付。合计 33 个课程、66 个场景。

- `npm run test:teamwork`：150 项断言通过。实际验证 stale lease 拒绝并保留队友 tip、普通 push 拒绝改写、普通 rebase 带入错误祖先不能通过、stash 冲突仍保留条目、子模块仅检出/暂存不算父仓库提交、删目录不能冒充稀疏检出、浅仓库必须补全、apply 后以自己作者提交不能冒充保留邮件作者、无效 bundle 不能通过。
- 原有 advanced 114 项、maintenance 148 项、旧场景 63 项和隔离/真实 PTY 检查均通过；Node 6 项保持通过。真实 Git 断言总计 475 项。
- 4 个桌面测试分别覆盖子模块、部分暂存与忽略规则、完整双远端 PR，以及旧入门流程。子模块测试确认检出新版本时只有 3/5 条件通过，父仓库提交指针后全部通过，并可以在编辑器查看子模块文件。
- 旧 0.1.0 镜像升级至当前课程后，提交、工作区、暂存区和进度保留；生产构建与课程镜像/代码校验通过。

这些测试验证场景结果与关键失败行为，不以记录用户输入过某个命令作为判题依据。完整覆盖矩阵仍有待实现条目，0.2.0 安装包尚未发布。

## 2026-09-13 阶段性预览版发布

前三批已完成的 33 门课程、66 个场景已发布为 [v0.2.0-preview.1](https://github.com/LX-Cel/git-onboarding/releases/tag/v0.2.0-preview.1)。发布标签来自已验证的课程提交 `d02b073`，发布提交为 `82d2ec2`。Windows 安装包和 SHA256 文件已上传并核对服务端哈希。打包程序通过全部 4 项桌面测试；475 项真实 Git 断言、6 项 Node 测试及保留旧练习数据的升级测试通过。详见 [发布记录](release-0.2.0-preview.1.md)。

上述“尚未发布”是各批次完成时的历史状态。完整覆盖目标继续进行；正在开发的 PR 增强功能不在此预览包中。

## 2026-09-13 第四批实现与验证

新增 PR 评审期间上游冲突、Squash 合并、Rebase 合并、受保护主线与必需检查，共 4 门课程、8 个引导/挑战场景。当前开发分支合计 37 门课程、74 个场景。已发布的 preview.1 仍为前三批 33 门课程，本批尚未发布安装包。

- `test:hosting`：227 项真实 Git 断言通过，包含旧 Fork/PR 场景记录兼容性。验证直接推送与删除主线被钩子拒绝，移除保护不能通过，评审通过但检查缺失/过期不能合并，来源与上游变化均使验证过期。
- PR 冲突通过实际 merge-tree 判定，在学习者仓库中通过真实 rebase 产生冲突，验证 abort、continue 和租约推送。不能跳过上游事件直接完成冲突课程。
- Merge 创建双亲提交，Squash 只新增一个主线提交，Rebase 逐条保留提交且没有合并节点。三种方式均保留来源分支，合并后需同步个人和本地主线；删除远端来源分支后仍能查看已合并 PR 差异。
- 增加“最终合并树干净，但中间重放产生冲突”的恢复验证：托管端撤销失败 rebase，保持上游不变，允许用户修复同一 PR 后重试。
- 原有 475 项真实 Git 断言与隔离/PTY 检查通过，总计 702 项断言；6 项 Node 测试通过。8 项真实桌面测试通过，新增四个 PR 场景均从界面创建、评审、检查、选合并方式到终端同步与手动判题完成。
- 旧 0.1.0 镜像升级后提交、暂存区、工作区和进度保留。新增 hosting 模块进入镜像/课程更新/内容校验；升级时先发布依赖模块，再发布导入它的课程程序。
- 实际截图暴露手动检查完成时编辑器仍可能等待下次轮询才更新。现在手动检查同步刷新已保存文件，并保留未保存编辑；新增 PR 桌面测试要求完成检查后编辑器内容与真实提交一致。

分支保护是本地教学钩子，必需检查是集成树的确定性课程检查；不声称实现了线上 GitHub 权限或 CI 服务。认证、签名/LFS、历史清理、pull 策略、仓库诊断和综合任务等仍需继续完善。

## 2026-09-13 第五批实现与验证

新增 12 门课程、24 个场景：普通目录初始化与本地身份、clone/远端跟踪分支、merge abort、pull ff-only/rebase/merge、分离 HEAD、误删分支、blame/log 内容定位、am 冲突恢复、跨平台换行、fsck 悬空对象恢复与 gc。开发分支现有 49 门课程、98 个场景；本批尚未进入发布安装包。

- `test:foundations`：207 项真实 Git 断言通过。包括配置邮箱不能修改旧提交作者、clone 不等于完成跟踪和推送、解决合并不能代替撤销、相同文本的新提交不能冒充原提交恢复、错误 blame 归因不能通过、普通自署名提交不能替代保留邮件作者。
- 三种 pull 使用同一类分叉初始状态，验证 ff-only 的真实拒绝和原 tip 保留、merge 双亲关系与原提交保留、rebase 的新提交和线性关系，并要求本地策略配置和远端同步。
- 换行课程同时检查 Git 对象内容、工作区 LF/CRLF 字节、二进制不变与已提交属性；添加规则不能替代 renormalize。重新检出后重新 add 刷新索引信息，断言暂存区没有新增内容差异。
- fsck 课程清除该练习的 reflog 后保留悬空提交，验证通过 fsck 找回对象、建立引用，再 gc，恢复引用和内容均保留。只恢复相同文件而丢失原提交不能通过。
- 桌面支持尚未 init/clone 的普通目录，并与分离 HEAD 分开显示。clone 后的新增文件可自动载入编辑器；保留未保存编辑。am 与 rebase 操作现在分别识别，冲突提示对应的 continue 命令。
- 原有 702 项真实 Git 断言和隔离/PTY 检查继续通过，合计 909 项。6 项 Node 测试、12 项桌面测试、保留 0.1.0 练习数据的升级测试通过。新增桌面测试覆盖从无仓库到提交、clone/跟踪/推送、am 冲突与属性换行，均由真实终端驱动并手动检查结果。

仍需完成认证/权限诊断、真实签名与 LFS、敏感历史清理、入职/发布回滚/并发协作/遗留排错综合任务和自由实验区，随后进行完整安装包与发布验收。

## 2026-09-13 第六批实现与验证

新增 SSH 提交与标签签名、LFS 提交与交付、既有二进制历史迁移、假凭据历史清理，共 4 门课程、8 个场景。开发分支合计 53 门课程、106 个场景。

- `test:extensions` 94 项真实断言通过，与既有测试合计 1003 项。篡改已签名提交、没有有效信任文件、轻量标签、仅提交普通二进制、缺少远端 LFS 对象、遗漏旧二进制版本，以及只删除当前假凭据文件，均不能通过。两种模式均验证续练与重置。
- 使用真实 Git LFS 3.7.1、OpenSSH keygen 10.3_p1 和 git-filter-repo 2.47.0。LFS 通过原生 file 传输适配器交付对象，检查指针、完整工作文件、本地对象和远端对象。签名密钥由当前练习生成，不接触个人密钥；历史清理仅使用明确标记的假凭据。
- 工具包包含官方 Alpine 签名 APK 及依赖，归档 30,791,680 字节，SHA256 `2bf1923e85840bcc658672093697a7a48b4fe54d7f3c7eb85497a3286af2b09c`。在已有练习环境中离线安装，不重建学生 home。`test:tools` 验证路径穿越、符号链接、重复包、包哈希、缺失包和归档哈希六类拒绝路径，均未改变安装完成记录。
- 旧 0.1.0 镜像升级测试通过：工具安装和课程更新后，原提交、暂存区、工作区与进度保留，实际工具探测通过。隔离边界及 1 GiB 单进程地址空间限制保持不变。
- 四个新增桌面场景通过真实终端执行、手动检查和编辑器同步验证。修复重置期间终端仍显示旧就绪状态的问题：重置期间禁用输入，新会话等首个提示符就绪后开放输入。

完整目标仍需认证/权限诊断、入职/发布回滚/并发协作/遗留排错综合任务及自由实验区。预览安装包不声称穷尽所有 Git 平台和扩展。

## 2026-09-13 第二个预览版发布

第六批完成的 53 门课程、106 个场景已发布为 [v0.2.0-preview.2](https://github.com/LX-Cel/git-onboarding/releases/tag/v0.2.0-preview.2)，发布提交 `9b681f8`，课程源码来自 `9624965`。Windows x64 安装包与 SHA256 文件均已上传，服务端大小和哈希与本地一致，Release 已结束草稿状态。

打包程序通过全部 16 项桌面测试；安装器解出的程序、课程与离线工具哈希一致，并在独立空数据目录通过初始化、提交判题、重置及重新打开续练测试。1003 项真实 Git 断言、6 项 Node 测试、6 类归档拒绝检查、隔离/PTY 与保留 0.1.0 数据的升级测试通过。未覆盖用户现有安装执行 NSIS 升级。详见 [发布记录](release-0.2.0-preview.2.md)。

完整覆盖目标继续推进，尚未实现部分不包含在此预览版中。

## 一手参考

- [Git 命令参考](https://git-scm.com/docs)
- [Git 用户手册](https://git-scm.com/docs/user-manual)
- [GitHub fork 工作流](https://docs.github.com/en/pull-requests/how-tos/work-with-forks)
- [reset 的状态语义](https://git-scm.com/docs/git-reset)
- [worktree](https://git-scm.com/docs/git-worktree)
- [bisect](https://git-scm.com/docs/git-bisect)
- [push 与 force-with-lease](https://git-scm.com/docs/git-push)
- [子模块](https://git-scm.com/docs/git-submodule)
- [克隆与浅仓库](https://git-scm.com/docs/git-clone)
- [Git 合并树](https://git-scm.com/docs/git-merge-tree)
- [GitHub 分支保护](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [GitHub 必需检查](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
- [pull 策略](https://git-scm.com/docs/git-pull)
- [attributes 与换行](https://git-scm.com/docs/gitattributes)
- [merge 与中断恢复](https://git-scm.com/docs/git-merge)
- [Git 签名格式](https://git-scm.com/docs/gitformat-signature)
- [Git LFS 本地文件传输](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-standalone-file.adoc)
- [git-filter-repo 历史清理](https://github.com/newren/git-filter-repo/blob/main/Documentation/git-filter-repo.txt)

2026-09-13 核查上述官方资料，用于建立覆盖范围；具体场景以隔离环境中的实际 Git 行为验收。
