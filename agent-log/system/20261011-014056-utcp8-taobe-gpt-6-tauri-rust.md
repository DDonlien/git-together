# Tauri 2 与 Rust 后台迁移

- 开始：2026-10-11 01:40:56 UTC+8。
- 用户需求：迁移；补充明确要求后台直接使用Rust，不采用Node/TypeScript后台进程。
- 范围：RUN-01-tauri-rust；保留React/Material界面、现有Git语义和有限API，迁移桌面、账号、文件/Git/AI、授权、更新与发布。
- 工作区：codex-standalone-ts，main；fetch后与origin/main一致。保留本对话未提交的表头角标修正，不改旧main/或其他工作区。
- 模板：远端与本地均为v1.9.1-260916-010202。
- 版本：计划0.22.0，新增运行框架与Rust后台，递增minor；package.json仍为权威来源。
- 发布授权：沿用用户持续授权，复用公证profile，只核对安装包及公共更新源，不启动/更新用户已安装应用或要求解锁。
- 验证边界：本次不新增或运行测试；执行类型检查、Rust编译、生产构建与包/更新源校验，分别记录结果。
- 状态：源码迁移及编译完成，待正式构建与发布核对。

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
