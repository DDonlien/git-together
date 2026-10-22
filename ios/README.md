# GitTogether iOS

SwiftUI 原生远端客户端。沿用桌面的 Dashboard、分支 Graph、更改、文件和 Presence 语义，手机通过平台 API 浏览远端，通过 Presence 观察并控制桌面 worktree。手机不会 clone 或拥有本地 Git 工作目录。

## 在 Mac 打开

需要 Xcode 26 或更新版本、iOS 26 或更新版本。直接打开 [`git-together.xcodeproj`](git-together.xcodeproj)，选择共享 scheme `git-together` 和一个 iPhone/iPad Simulator 后运行。真机运行在 Signing & Capabilities 中选择自己的 Team。无需安装第三方 Swift 包或生成工程。

```sh
swift test --package-path ios
xcodebuild -project ios/git-together.xcodeproj -scheme git-together \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath _builds/ios CODE_SIGNING_ALLOWED=NO build
```

上述命令从仓库根目录执行。GitHub Actions 的 `iOS source validation` 使用 macOS 运行核心回归与 Simulator 编译，具体运行结果以该次工作流及执行日志为准；这不能代替实际界面和双设备验收。

## 使用

在“设置 → 账号”连接 GitHub、GitHub Enterprise、GitLab、Gitee 或 Gitea，填写该平台访问令牌。iOS 使用独立 Keychain，不读取或同步桌面的登录凭据。GitHub细粒度令牌需要所选仓库的 Metadata/Contents 读取权限；GitLab使用可读API的个人访问令牌，其余平台按自己的仓库读取授权配置。

Dashboard 支持账号、组织/用户、类型、公开/私有筛选、排序、置顶和远端分支展开。进入仓库后，Graph、更改、文件与设备共享同一工作台；Graph按真实parent关系绘制，可按分支和提交者筛选并继续加载历史。文件树固定到所选提交，支持逐层浏览和远端文本/差异查看。

在“设置 → 插件 → Presence”登录现有账号，手机会登记独立设备，自动上报当前Git账号可访问的仓库清单，同时始终公布空本地工作区。添加其他服务器使用当前身份的挑战/票据交换，不转发归属密码或会话。关闭插件或应用进入后台会停止连接，保留上次结果并标为未知。

每个仓库的“设备”栏目按服务器和设备分别列出worktree，包括同分支的多个目录及组织范围。分支、HEAD、Git修改、编辑器状态和未推送提交分别显示；协议公开的目录标识可复制，未公开的本机绝对路径不会被猜测。没有编辑器来源显示“编辑器未接入”；离线显示上次事实及当前未知。

远程动作使用现有公开协议的 Commit、Submit、中止操作和丢弃更改。先取得目标预览，选择文件并编辑 Summary / Description，再确认执行；AI说明在目标设备生成。目标、组织修订和过期预览会重新核对。已受理或结果未知的写请求不会自动重发；可查询执行记录、取消排队、仅重试Push，或从目标保存的备份恢复丢弃内容。协议当前不开放的桌面操作不会显示为可执行入口。

## 实现入口

- `app/`：SwiftUI界面、Main Actor状态和Keychain。
- `core/`：提供方API、Presence协议、worktree归并和提交图。
- `tests/`：隔离JSON与HTTP回归，不登录真实账号或操作真实仓库。
- `config/version.xcconfig`：iOS版本唯一来源，独立于桌面版本。
- [需求与验收](REQUIREMENTS.md)、[视觉规范](DESIGN.md)、[协作约束](AGENTS.md)。
