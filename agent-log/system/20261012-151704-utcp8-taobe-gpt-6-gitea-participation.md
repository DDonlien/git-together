# Gitea默认隐藏的提交身份误判

- 用户原始prompt：「默认隐藏的判定对 Gitea 的实现似乎有问题。如果我开启了‘假设这个账号没有操作过就隐藏’，会导致有些我明显操作过的 Gitea 仓库也被隐藏了，似乎 github 没这个问题，检查一下？」截图是FreshLi4/double-deposition的man-cat和two-era。
- 模型：gpt-6；当前环境仅提供这个最具体标识。
- 开始：2026-10-12 15:17:04 UTC+8；结束：待发布验证完成。
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
