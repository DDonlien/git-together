# Tauri 2 与 Rust 后台迁移

- 开始：2026-10-11 01:40:56 UTC+8。
- 用户需求：迁移；补充明确要求后台直接使用Rust，不采用Node/TypeScript后台进程。
- 范围：RUN-01-tauri-rust；保留React/Material界面、现有Git语义和有限API，迁移桌面、账号、文件/Git/AI、授权、更新与发布。
- 工作区：codex-standalone-ts，main；fetch后与origin/main一致。保留本对话未提交的表头角标修正，不改旧main/或其他工作区。
- 模板：远端与本地均为v1.9.1-260916-010202。
- 版本：计划0.22.0，新增运行框架与Rust后台，递增minor；package.json仍为权威来源。
- 发布授权：沿用用户持续授权，复用公证profile，只核对安装包及公共更新源，不启动/更新用户已安装应用或要求解锁。
- 验证边界：本次不新增或运行测试；执行类型检查、Rust编译、生产构建与包/更新源校验，分别记录结果。
- 状态：完成；0.22.0公证发布及两套公共更新源回读通过，开发Rust服务与安全配置恢复。

## 实现与源码检查

- 新增Tauri 2/WKWebView及同进程Rust后台，有限原生桥保持现有React API。账号目录、Git/worktree/LFS、文件/Diff/历史、逐分支Codex说明、PKCE网页/设备授权、有限日志和Tauri更新均直接用Rust；生产不携带Electron或Node业务进程。
- 同仓库在途fetch共享结果，真实git-common-dir串行写入；账号/仓库/关联身份与任务在操作前后复核。Commit保留正常钩子与签名，Push只推明确提交且不强推；同步预览绑定完整文件指纹，保护其他worktree和未推送历史，失败保留回滚备份。
- 保留bundle ID、Developer ID及原账号数据目录，兼容旧v10密文和单目录关联；限定偏好键在WKWebView为空时迁移。开发账号会话独立，开发版禁用安装更新；没有读取/导出用户明文凭据或替换已安装App。
- 更新私钥在仓库外0700目录/0600文件生成，公钥内置。公证并staple后生成旧版ZIP/latest-mac.yml及Tauri tar/sig/latest.json，签名绑定版本；发布入口完整回读两套公共更新资产。旧Electron/server及对应后台测试保留历史参考，不进入当前运行入口或包。
- 本对话表头角标修正先独立提交697af58，再处理迁移，保留原修改范围。
- 当前源码：npm run check通过；cargo check（含--locked）通过；npm run build通过，262模块；git diff --check通过。未新增或运行测试，未据此声称真实账号、实际Git操作或用户升级验收。
- 开发服务4173/4174确认由本项目旧Node/Electron持有，授权助手公开状态版本0.21.2且configured=true；需恢复为0.22.0 Rust服务，不能把原公开配置状态等同于新运行已恢复。

## 首轮构建与修正

- 277e4d05b4e6087479530177fab2ea6e6998ec0c提交并推送main，远端回读一致。优化Rust构建完成（首次1分54秒），Tauri默认把辅助Cargo binaries同时装入App。
- 首轮Apple公证3c19ebb8-0f92-442a-b7b9-004494f574a1为Invalid：仅指出gittogether-service和gittogether-release-verify两个辅助程序没有Developer ID/安全时间戳；没有公开发布。修正最终App仅保留gittogether原生入口，开发服务及公钥校验器留在构建目录外；额外二进制检查在发布前阻断。
- 开发就绪检测改用固定Node HTTP请求（仅启动工具），保留Rust的Host边界；Node fetch会重写Host，首轮因此403，已修正。网页业务仍完全为Rust。
- 确认旧开发进程属于本项目后正常停止，0.22.0 Rust服务持有4174/4175，React预览4173恢复。页面/status/catalog均200，backend=rust，账号0、仓库0、storage=session；没有恢复或重放旧网页账号。
- 未签名的Rust开发服务对旧开发配置Keychain读取返回明确不可用；原加密文件保留，未弹解锁或绕过安全设置，未声称配置已恢复或真实授权成功。正式包沿用原Developer ID/bundle ID，实际用户账号升级仍不操作安装版验收。

## 最终发布与收尾

- 修正提交70219b54fb1b48c2c1bb12c58014080fa19c2604推送main并回读一致；v0.22.0 tag指向该提交。正式包由这个已提交main快照生成，不覆盖先前公开版本。
- Apple公证dede49cc-8166-49d8-a780-12bd11ff4b81为Accepted；staple/validate及deep/strict签名通过。spctl报告accepted/source=Notarized Developer ID，同时报告override=security disabled（本机既有设置，本轮未改变系统安全设置）；不据此声称已在启用Gatekeeper的另一台设备验收。
- 正式App仅gittogether主程序，约12MiB，未携带Electron/Node或开发/发布辅助程序。ZIP 4204936字节，SHA-256 0c8267126a0c754acd780f774cace4c1f3b0370701eff36b5013089b2aac43bd；Tauri tar 4200163字节，SHA-256 2aa6d6bb725a21a11dd5f181d87db20697d1ebe5f0af2fa50b3d89737ff78819。最终stapled tar的minisign、公钥及版本绑定校验通过。
- 发布https://github.com/DDonlien/git-together/releases/tag/v0.22.0，stable/latest；两套更新清单、公开sig、Atom、tag/main来源和完整ZIP/tar下载摘要/大小一致，publicUpdateVerified=true。
- 未操作用户已安装App。未新增或运行测试，未执行真实用户Git写操作、账号升级或安装更新验收；源码编译/正式包/公共更新源和真实安装状态分别记录。
- 开发Rust辅助程序在仓库外单独使用既有Developer ID及com.gittogether.standalone正常签名，随后重启本项目Rust预览。配置公开状态200/ok=true/configured=true，原开发配置已安全恢复；未修改Keychain ACL、解锁或读取/输出明文密钥。4173界面、status/catalog和4174授权状态均正常，账号0/仓库0/session，未重放旧网页账号。
- 将同样的冷启动编译/正常签名接入浏览器开发入口；检查TypeScript和差异后提交收尾，不改变此次已公证包的生产输入，保留实际构建tag及来源。
- RUN-01-tauri-rust完成。
