# GitHub Desktop 界面替换清单

固定版本的全部 93 个 PopupType、9种提交/冲突流程步骤、15种横幅与6种选择器均有明确的 Material 展示定义。目录使用穷尽类型约束，上游新增类型不能落回旧界面。

GitTogetherApp 继承原版初始化与业务命令，覆盖展示入口。原版主页面、欢迎页、标题栏、工具栏、缩放提示及样式表不挂载。全部弹窗进入自己的 MaterialDialog / MaterialDialogHeader，保留原版焦点、关闭时机、堆栈、字段验证及执行回调。

应用设置、仓库设置和关于页另有视图；菜单与横幅读取原版模型并调用原回调。内置插画改为自己的界面缩略图或既有 Phosphor 图标；用户头像、内容图片、许可和原始终端输出保持真实。

实际截图及测试范围见 artifacts/github-desktop-material/report.json 和 review.html。目录覆盖不代表每一种真实服务器或授权场景均已验收。

| 原版类型 | GitTogether 展示 | 类别 |
| --- | --- | --- |
| RenameBranch | 重命名分支 | Material 表单 |
| DeleteBranch | 删除分支 | Material 安全确认 |
| DeleteRemoteBranch | 删除远端分支 | Material 安全确认 |
| ConfirmDiscardChanges | 丢弃更改 | Material 安全确认 |
| Preferences | 应用设置 | Material 表单 |
| RepositorySettings | 仓库设置 | Material 表单 |
| AddRepository | 添加本地仓库 | Material 表单 |
| CreateRepository | 新建仓库 | Material 表单 |
| CloneRepository | 下载仓库 | Material 表单 |
| CreateBranch | 新建分支 | Material 表单 |
| SignIn | 连接 GitHub 账号 | Material 授权与凭据 |
| About | 关于 GitTogether | Material 说明与错误 |
| InstallGit | 安装命令行工具 | Material 表单 |
| PublishRepository | 发布仓库 | Material 表单 |
| Acknowledgements | 开源许可 | Material 说明与错误 |
| UntrustedCertificate | 检查服务器证书 | Material 授权与凭据 |
| RemoveRepository | 移除仓库 | Material 安全确认 |
| TermsAndConditions | 使用条款 | Material 说明与错误 |
| PushBranchCommits | 推送提交 | Material 表单 |
| CLIInstalled | 命令行工具已安装 | Material 说明与错误 |
| GenericGitAuthentication | 连接远端仓库 | Material 授权与凭据 |
| ExternalEditorFailed | 无法打开编辑器 | Material 说明与错误 |
| CopilotAppNotFound | 未找到 Copilot 应用 | Material 说明与错误 |
| OpenWithExternalEditor | 选择编辑器 | Material 表单 |
| OpenShellFailed | 无法打开终端 | Material 说明与错误 |
| InitializeLFS | 设置 Git LFS | Material 表单 |
| LFSAttributeMismatch | 检查 Git LFS 文件 | Material 说明与错误 |
| UpstreamAlreadyExists | 远端连接已存在 | Material 说明与错误 |
| ReleaseNotes | 版本更新 | Material 说明与错误 |
| DeletePullRequest | 关闭 Pull Request | Material 安全确认 |
| OversizedFiles | 文件超过上传限制 | Material 说明与错误 |
| CommitConflictsWarning | 提交包含冲突标记 | Material 安全确认 |
| PushNeedsPull | 推送前获取远端更改 | Material 表单 |
| ConfirmForcePush | 确认强制推送 | Material 安全确认 |
| StashAndSwitchBranch | 保存更改并切换分支 | Material 表单 |
| ConfirmOverwriteStash | 覆盖暂存的更改 | Material 安全确认 |
| ConfirmDiscardStash | 丢弃暂存的更改 | Material 安全确认 |
| ConfirmCheckoutCommit | 切换到指定提交 | Material 安全确认 |
| CreateTutorialRepository | 创建入门仓库 | Material 表单 |
| ConfirmExitTutorial | 结束入门引导 | Material 说明与错误 |
| PushRejectedDueToMissingWorkflowScope | 更新工作流需要授权 | Material 授权与凭据 |
| SAMLReauthRequired | 验证组织身份 | Material 授权与凭据 |
| CreateFork | 创建仓库副本 | Material 表单 |
| CreateTag | 新建标签 | Material 表单 |
| DeleteTag | 删除标签 | Material 安全确认 |
| LocalChangesOverwritten | 本地更改需要处理 | Material 说明与错误 |
| ChooseForkSettings | 设置仓库副本 | Material 表单 |
| ConfirmDiscardSelection | 丢弃所选更改 | Material 安全确认 |
| MoveToApplicationsFolder | 移动到应用程序文件夹 | Material 表单 |
| ChangeRepositoryAlias | 仓库显示名称 | Material 表单 |
| ThankYou | 操作已完成 | Material 说明与错误 |
| CommitMessage | 编辑提交说明 | Material 表单 |
| MultiCommitOperation | 处理提交与冲突 | Material 多步骤与冲突 |
| WarnLocalChangesBeforeUndo | 撤销前检查本地更改 | Material 安全确认 |
| WarningBeforeReset | 确认重置分支 | Material 安全确认 |
| InvalidatedToken | 重新连接账号 | Material 授权与凭据 |
| AddSSHHost | 验证 SSH 主机 | Material 授权与凭据 |
| SSHKeyPassphrase | 解锁 SSH 密钥 | Material 授权与凭据 |
| SSHUserPassword | SSH 身份验证 | Material 授权与凭据 |
| PullRequestChecksFailed | 检查未通过 | Material 说明与错误 |
| CICheckRunRerun | 重新运行检查 | Material 表单 |
| WarnForcePush | 强推会覆盖远端历史 | Material 安全确认 |
| DiscardChangesRetry | 更改未能完全丢弃 | Material 安全确认 |
| PullRequestReview | 审阅 Pull Request | Material 表单 |
| UnreachableCommits | 查找未关联提交 | Material 表单 |
| StartPullRequest | 创建 Pull Request | Material 表单 |
| Error | 操作未完成 | Material 说明与错误 |
| InstallingUpdate | 正在安装更新 | Material 进度 |
| TestNotifications | 通知预览 | Material 说明与错误 |
| PullRequestComment | Pull Request 评论 | Material 表单 |
| UnknownAuthors | 确认提交作者 | Material 表单 |
| TestIcons | 图标预览 | Material 说明与错误 |
| ConfirmCommitFilteredChanges | 确认提交所选文件 | Material 表单 |
| TestAbout | 关于 GitTogether | Material 说明与错误 |
| TestCLIAction | 命令行操作预览 | Material 表单 |
| TestCopilotSnapshotCard | 协助信息预览 | Material 说明与错误 |
| PushProtectionError | 推送检测到敏感信息 | Material 安全确认 |
| BypassPushProtection | 确认敏感信息处理方式 | Material 安全确认 |
| GenerateCommitMessageOverrideWarning | 替换当前提交说明 | Material 安全确认 |
| GenerateCommitMessageDisclaimer | 生成提交说明 | Material 说明与错误 |
| CopilotConflictResolutionDisclaimer | 辅助处理冲突 | Material 说明与错误 |
| HookFailed | Git 钩子未通过 | Material 说明与错误 |
| CommitProgress | 正在提交 | Material 进度 |
| AddWorktree | 添加工作目录 | Material 表单 |
| RenameWorktree | 重命名工作目录 | Material 表单 |
| DeleteWorktree | 删除工作目录 | Material 安全确认 |
| EditCopilotBYOKProvider | 模型服务设置 | Material 表单 |
| EditCopilotBYOKModel | 模型设置 | Material 表单 |
| CopilotUserSettings | Copilot 账号设置 | Material 表单 |
| CopilotCustomProviders | 模型服务 | Material 表单 |
| ConfirmDeleteCopilotBYOKProvider | 移除模型服务 | Material 安全确认 |
| CopilotConflictResolutionAlwaysNudge | 冲突处理偏好 | Material 表单 |
| DeleteWorktreeFailed | 未能删除工作目录 | Material 说明与错误 |

| 其他界面 | 展示实现 |
| --- | --- |
| 主窗口 / 空状态 / 工作区 | 现有 Material 页面；原版主页面不挂载 |
| 9种提交/冲突流程步骤 | 独立的 Material 标题、进度与警示层级，原状态机和回调保持 |
| 下拉菜单 | MaterialFloatingMenu 原生 popover 层，保留原键盘与菜单控制器 |
| 菜单 / 仓库、分支、工作目录、同步选择器 | MaterialMenu / MaterialChooser，调用原命令 |
| 15种横幅 / 更新提示 | MaterialBanner，保留处理、撤销和关闭回调 |
| 下载 / 仓库缺失与信任 | Material 状态卡，保留原目录定位与信任控制器 |
| 终端 / 钩子输出 | 原版 xterm，使用自己的 Material 配色 |
| 崩溃恢复 | Material 卡片，保留原错误传递和退出/重启 |
| 系统菜单名称 / 启动失败文案 / HTML 标题 | GitTogether 文案；窗口按钮、文件选择器沿用操作系统 |

执行与控制器摘要检查由 npm test 运行；未操作安装版。正式安装包、真实 OAuth 和多设备 Presence 分别验收。

## 提交与冲突流程步骤

| 原版步骤 | GitTogether 展示 |
| --- | --- |
| ChooseBranch | 选择分支 |
| WarnForcePush | 此操作需要强制推送 |
| ShowProgress | 正在处理提交 |
| ShowConflicts | 处理文件冲突 |
| HideConflicts | 仍有冲突需要处理 |
| ConfirmAbort | 确认中止操作 |
| CreateBranch | 新建目标分支 |
| ShowCopilotConflictsLoading | 正在辅助处理冲突 |
| ShowCopilotConflicts | 检查冲突处理结果 |
