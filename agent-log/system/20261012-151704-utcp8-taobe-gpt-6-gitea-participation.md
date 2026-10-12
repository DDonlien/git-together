# Gitea默认隐藏的提交身份误判

- 用户原始prompt：「默认隐藏的判定对 Gitea 的实现似乎有问题。如果我开启了‘假设这个账号没有操作过就隐藏’，会导致有些我明显操作过的 Gitea 仓库也被隐藏了，似乎 github 没这个问题，检查一下？」截图是FreshLi4/double-deposition的man-cat和two-era。
- 模型：gpt-6；当前环境仅提供这个最具体标识。
- 开始：2026-10-12 15:17:04 UTC+8；结束：2026-10-12 16:21:36 UTC+8。
- 需求：IMPORT-12-branch-behavior-gitea，沿用父需求明确的「访问该仓库的账号没有提交记录」，不改为仅按浏览、仓库所有权或本地关联判定。
- 保留主工作区其他任务全部未提交文件及索引；在已有独立main快照release-main-brand-fly4zgg1做当前源码检查与发布，未新建分支。
- 规则：根/macOS AGENTS及父需求已读；模板远端v1.9.1-260916-010202与本地通用版本相同。按持续授权自动main推送、同源macOS和Windows x86/x64打包发布；不操作已安装应用，不要求解锁Mac。
- 查证：Gitea公开API/version实际1.26.2。两个分支的HEAD分别b824242dc520与bc7fc5ccbaf2；提交内Git作者/提交者都是Taobe，本地Git只读log一致，而API的author/committer为null。原实现仅检查author.login，完整父图闭合后把所有空值误判为没有账号贡献。
- 官方契约核对Gitea提交与/user/emails，邮件只信任verified=true；不按显示名、公开profile邮箱、仓库组织或本地Git配置猜身份。
- 修复：作者账号为空时使用当前登录账号已验证邮箱补充匹配。无法映射的作者或邮箱读取故障保留未知和明确warning，完整历史不是完整身份映射。平台账号已确认属于本人时仍直接成功；GitHub原作者查询、手动隐藏/恢复和本地脏目录保护均保持。
- 初步验证：干净main快照npm run check、Cargo --locked及生产前端构建通过，285模块；既有分块体积建议保留。未新增或运行旧自动化测试套件。
- 实际只读核对：首次无签名探针按正常系统加密入口读取被拒，保留全部文件；按项目既有Developer ID/bundle identity签名该独立探针后成功读取当前账号，不导出令牌、邮箱或任何凭据。账号login匹配，已验证邮箱1个，提交邮箱不在其中。直接调用旧main和修正后的生产Provider，main/man-cat/two-era旧实现都Ok(false)，修正后为身份未知且autoHidden=false。匿名公开API比较结果一致；未修改账号、偏好或Git状态。
- 9次有限localhost契约取样：平台账号、已验证邮箱、未验证邮箱、同显示名未映射、完整其他作者、邮箱403、缺父节点、邮箱失败后历史命中本人及错误账号响应符合预期。受控样例仅fixture-only凭据，不等同平台用户登录；上条真实账号记录单独提供。
- 客户端保留未知：hasAccountCommits缺省不触发自动隐藏；participationError不继承旧false；旧读取失败快照task.error同样不触发隐藏。手动hiddenEntries/shownBranches以及本地dirty/HEAD保护代码未改动。
- 版本从0.28.2递增至0.28.3，4个清单保持一致。代码、模型/类型、前端构建和Rust检查已通过；安装包与发布待核验。
- 发布预检：Developer ID签名身份有效、login Keychain正常可读且未锁定；notarytool对既有gittogether-notary默认及明确login keychain查询均返回No Keychain password item found。按精确账号和只读公证元数据检查无现存profile，不改变Keychain、不索取或重放秘密，不要求解锁。继续准备已授权源码和三平台产物，未Accepted不能正式发布。

## 发布与最终核对

- 源码提交/推送：f5a72be654b92c87c35f34319b0a696ee45ab8bc，干净独立main制作；共享main按该提交快进，仅同步8个本任务文件的索引，保留平台授权、Presence管理、性能记录和Dashboard等其他任务的未提交差异。
- 首次公证profile有限只读查询失败后，正常入口重新读取同一个gittogether-notary成功；没有配置新profile、修改Keychain、索取秘密或要求解锁。既有Developer ID和系统账号加密入口同样成功。本地签名候选辅助文件未运行构建：因正式入口已持有发布锁立即停止，随后删除该未使用辅助文件。
- macOS 0.28.3：Developer ID团队86J7X3KZ5Z，bundle version核对及单个gittogether主程序确认。Apple公证87c85643-3b9b-429e-b634-18ad047a96ed为Accepted；staple/validate、codesign strict及Tauri更新签名、版本和解压结构均通过。spctl报告Notarized Developer ID；环境原有security disabled覆盖未被更改，不能冒称用户设备Gatekeeper或升级验收。
- Windows同源运行：https://github.com/DDonlien/git-together/actions/runs/38219772351，x86/x64均success，版本0.28.3、sourceCommit与上条源码完全一致；原生检查、真实NSIS安装/卸载及WebView2界面启动通过。程序Machine分别332/34404；x86运行在WOW64，未实测纯32位设备。安装器仍未配Authenticode，更新包签名已验证。
- 原发布脚本x64 gh run download发生EOF/超时后两次完整重试仍悬停。直接按相同GitHub artifact 11734051628取回完整5882368字节ZIP，其SHA256 ad2f7d7099379c98cdcefeb3bd52886e65dbc09a2ebedb44eb0367456985e773与认证API artifact.digest一致。只终止本任务已确认PID/父进程/命令/输出目录的最后悬停下载；原流程退出并释放自己的锁，没有停止其他服务或进程。
- 复用Accepted的同源Mac包及已验证CI产物进行受控恢复；保留正式Windows helper的报告来源/版本/架构、大小/摘要、签名及原生验证器检查。没有重新编译不同源码，没有省略公证或正式公开回读，也没有向目录注入未验证下载。
- 输出：_builds/gittogether-0.28.3-macos-arm64-eTDXV1；sourceSha256为220ad09d9dfa52d8f0fce4ba3fecb789bd76c6c92311097f2a96e81227623883。最终build-info publicUpdateVerified=true，latest.json包含darwin-aarch64/windows-i686/windows-x86_64。
- 正式版本：https://github.com/DDonlien/git-together/releases/tag/v0.28.3。9个资产齐备，draft/prerelease均false，tag与target_commitish均为固定f5a72be提交；匿名公开latest、Atom、两种更新清单、全部安装包及签名已完整下载核对。发布说明已改为本次Gitea身份修复和此前已合入的8字符Presence密码修正，并保留平台验证边界。
- 客户端实际生产branchHiddenEntries取样：真实三分支未知结果隐藏集合为空；完整其他作者会隐藏；手动隐藏保持；显式恢复和本地dirty均保持可见。没有启动、操作、替换、更新或重启用户已安装GitTogether。安装/重启由用户自行选择，发布成功不表示其电脑当前已经是0.28.3。
- IMPORT-12-branch-behavior-gitea按以上证据完成；本轮没有新增/运行旧自动化测试套件，没有修改其他任务实现或更新记忆。
