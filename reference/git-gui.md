# Git GUI 授权与 Git 执行对照

2026-10-16 按用户要求直接查找并读取官方开源仓库。参考代码仅用于核对行为与边界，不进入 GitTogether 实现。

## 源码

- [GitHub Desktop](https://github.com/desktop/desktop)，development，`bebc062caafcf818993b9f53397b976d33484231`。本机稀疏检出：`/Users/taobe/Projects/GitHub/Reference/github-desktop`。
- [GitButler](https://github.com/gitbutlerapp/gitbutler)，master，`6558e061edc74763129dce66fd8b16a054d4fce3`。本机稀疏检出：`/Users/taobe/Projects/GitHub/Reference/gitbutler`。

## 对照结果

| 问题 | 参考实现与契约 | GitTogether 的实际缺口与修改 |
| --- | --- | --- |
| 用户能登录，但 Git 推送没有得到正确凭据或权限 | Desktop 的 [credential helper](https://github.com/desktop/desktop/blob/bebc062caafcf818993b9f53397b976d33484231/app/src/lib/trampoline/trampoline-credential-helper.ts)按远端选择凭据；GitButler 的 [askpass 与错误恢复](https://github.com/gitbutlerapp/gitbutler/blob/6558e061edc74763129dce66fd8b16a054d4fce3/crates/gitbutler-git/src/context.rs)区分凭据助手、SSH 密钥口令及其他输入。 | 0.33.0 始终注入应用账号令牌，覆盖系统 credential helper。0.34.0 分支已改为已有本地仓库默认使用系统 Git/SSH，但未交付安装版。应用账号仍是显式选项，失败不自动切换身份。 |
| 后台续期会撤销正在使用的访问令牌 | Desktop 的 [CredentialSessions](https://github.com/desktop/desktop/blob/bebc062caafcf818993b9f53397b976d33484231/app/src/lib/credential-sessions.ts)为 Git/LFS 持有令牌 lease；[GitHub 官方文档](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)明确刷新会使旧访问令牌失效。 | 原来只在进程启动前拿一次令牌。0.34.1 增加账号级读写锁：按进程时限提前续期，Git 及输出管道结束前不允许轮换。真实用户续期与长时间 Git/LFS 并发尚未验收。 |
| 把 remote 名称换成 URL，会丢失该 remote 的行为 | Desktop 的 [push](https://github.com/desktop/desktop/blob/bebc062caafcf818993b9f53397b976d33484231/app/src/lib/git/push.ts)传入 remote.name；GitButler 的 [fetch/push](https://github.com/gitbutlerapp/gitbutler/blob/6558e061edc74763129dce66fd8b16a054d4fce3/crates/gitbutler-git/src/repository.rs)也保留 remote 参数。[Git 配置契约](https://git-scm.com/docs/git-config)包含 remote 专用代理、接收/上传命令。 | 认证分支原来仍将操作目标换成 URL，导致 remote 专用代理、LFS 地址和 pre-push 首参数不再沿用。0.34.1 对已有工作目录使用已验证 remote 名称；引用预检/回读固定实际推送 URL。执行期间目标变化、多个推送地址在执行前明确失败。临时快照继续使用验证后的地址。 |
| 推送拒绝被误报或压成通用错误 | Desktop 的 [Git core](https://github.com/desktop/desktop/blob/bebc062caafcf818993b9f53397b976d33484231/app/src/lib/git/core.ts)保留输出并分类；GitButler 的 [错误模型](https://github.com/gitbutlerapp/gitbutler/blob/6558e061edc74763129dce66fd8b16a054d4fce3/crates/gitbutler-git/src/error.rs)区分授权失败、non-fast-forward 和强推保护。 | 原来忽略 stdout，并将所有 failed-to-push-some-refs 归为远端领先。0.34.1 同时解析两个输出流，保存白名单认证方式/原因，不记录原始输出或凭据。 |
| 早期只读 GitHub App 指导与真实 Push 功能冲突 | [GitHub App 权限契约](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)：用户令牌受用户、应用及安装范围共同限制。 | 开发文档仍写 Metadata read-only、不申请写权限。现已改为推送需要 Contents read/write，工作流变更还需 Workflows read/write，并说明权限更新要由仓库所有者批准。当前注册 App 的实际权限未能通过公开端点读取，不能据此认定截图就是只读 App 导致。 |

## 当前仓库与安装版证据

- 正在运行的安装版为0.33.0。2026-10-16 15:58 的 Push 退出码128、分类permission；旧日志没有具体拒绝理由。
- 系统认证的真实 GitHub 推送预检能够通过；当前主目录 HEAD 因分叉返回 non-fast-forward。主目录仍有既存合并冲突，本地领先7、落后16；这是独立于应用账号授权的状态。
- 临时工具通过本应用既有读取器访问系统加密凭据失败，因此尚未取得应用账号的直接服务端拒绝原因。没有操作、重启或替换用户安装版。
- 0.34.1 位于已有认证分支，未提交、未整合到main、未发布；不能把源码修复当作用户已获得正常推送能力。

## 修改与验证入口

- [认证与网络执行](../macos/src-tauri/src/provider.rs)、[令牌生命周期](../macos/src-tauri/src/service.rs)、[Git 错误解析](../macos/src-tauri/src/git.rs)、[日志白名单](../macos/src-tauri/src/diagnostics.rs)。
- [开发配置说明](../docs/development.md)、[需求追踪](../REQUIREMENTS.md)、[执行记录](../agent-log/system/20261016-160351-utcp8-taobe-gpt-6.md)。
- 类型检查、锁定依赖的 Rust 检查与前端构建通过。通过生产 Network 路径完成真实 GitHub push --dry-run；在临时 clone 核对正常 pre-push 收到 origin 与正确 URL、专用 remote 代理不会被绕过、推送目标变化及多推送地址会在执行前停止。临时 clone、钩子与诊断入口随后清理，没有修改远端。自定义 LFS 地址及其他 Git 操作的真实运行验收尚未完成。
