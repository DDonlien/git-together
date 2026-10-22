# iOS 客户端约束

继承 [根协作规则](../AGENTS.md)，本目录只维护 Swift 原生客户端。参考 [必乐 iOS 规范](https://github.com/DDonlien/belle-app/blob/main/ios/DESIGN.md)。

- App 使用 SwiftUI、Swift 6 和系统 Foundation / Security；最低支持 iOS 26，使用真实系统 TabView 和搜索，不模拟玻璃底栏。正文继承 GitTogether Material 3。
- `config/version.xcconfig` 是独立 iOS 交付物的版本来源；桌面版本仍由根 package.json 维护。界面读取 Bundle 版本。
- `core/` 的提供方、Presence模型及请求必须与实际公开接口一致；`docs/presence-public-protocol.md` 为 Presence 入口。新增手机不得运行 Git、clone、shell 或本地仓库关联。
- Git令牌、Presence账号及设备凭证仅进入本App的Keychain。密码只用于当前登录，不落盘或记录；不读取桌面凭据。账号、服务器、组织、设备和worktree身份分别绑定，不能按邮箱、分支名或设备名称合并。
- iOS 不公布本地工作区；设备心跳公布空工作区数组。远程写操作必须先预览、选择文件并确认，固定目标和预览ID；失败后不自动重发写请求。
- `swift test --package-path ios` 测试可独立运行的核心逻辑。Mac编译：`xcodebuild -project ios/git-together.xcodeproj -scheme git-together -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath _builds/ios CODE_SIGNING_ALLOWED=NO build`。
- 子功能说明、需求、视觉及日志分别见 README.md、REQUIREMENTS.md、DESIGN.md、agent-log/。Windows静态检查、Swift单测、Xcode编译与设备交互分别报告；本轮用户只要求源码推送，不打包、签名或发布。
