# GitHub Desktop 执行基础

本分支使用 GitHub Desktop `release-3.6.7`，上游提交为 `dbc92f973994da7fccc494d0e5a2ae0ffbd1434e`（准确值以 `github-desktop-upstream.json` 为准）。`desktop/` 保留原始源码、锁文件、许可证和固定版本的子模块资源。原版的 Git、认证、凭据、Store、Dispatcher、后台 Fetch、错误与冲突处理不重新实现。

`npm run verify:upstream` 按 SHA-256 检查全部上游文件，允许的差异限定为 GitTogether 展示替换、产品身份、第三方声明检查和导入时的忽略规则。Git、授权、凭据、Store、Dispatcher 和后台执行代码保持原版；60 个改动界面文件的非渲染控制器方法另有原版摘要。新增代码限定在 `app/src/ui/gittogether/`；Presence 独立在 `gittogether-presence/`，不包含 Git 执行器或 Git 平台凭据。

## 运行

使用 Node.js 22、Rust stable 和当前平台的原生构建工具：

```sh
npm run setup
npm run check
npm test
npm run build
npm run dev
```

`build` 输出到 `desktop/out/`，包含原版嵌入式 Git、Git LFS、凭据 trampoline、我们的界面和 Presence。它是可运行的开发目录，不是安装包。`dev` 启动这个独立开发版，不替换已安装应用。根目录 `package.json.version` 是产品版本来源。

在macOS执行 `npm run package:mac` 会先完成同源构建，再用上游固定版本的Electron Packager生成 `artifacts/macos/<版本>/GitTogether-dev-darwin-<架构>/GitTogether-dev.app`。包内自带运行时、Git、LFS、Presence及界面，可直接双击运行，不依赖源码目录或本地开发服务。保留上游开发签名和权限配置，使用GitTogether图标与独立的开发bundle ID和数据目录；本地ad-hoc签名不代表Developer ID公证或正式发布。

`macos/src/` 继续承载已有 Material 界面。界面以独立 frame 加载，使用仅对本地 frame 发放的 MessagePort 调用原版进程。React 19 与上游 React 16 分别运行。`GitTogetherApp` 继承原版 App 的初始化、订阅、菜单命令、登录回调和后台生命周期，覆盖其展示入口；原版主页面、工具栏、欢迎页及样式表从不挂载。原版弹窗控制器保留字段、验证、回调、焦点、安全默认项和栈管理，外壳、图标与控件使用我们的 Material 设计。设置、关于、菜单、横幅和崩溃恢复另有展示实现。界面层的定时读取只消费原版缓存；远端调度交给原版。

旧 `macos/src-tauri/`、`macos/server/`、`macos/electron/` 和旧脚本属于迁移前实现，不进入当前启动或构建链。旧 Windows 发布流程保存在 `archive/pre-desktop-runtime/`；当前 CI 验证新的 Desktop 运行链。

## 功能边界

- Fetch、Pull、Commit、Push、克隆、分支、标签、Merge、Rebase、Cherry-pick、Revert、Reset 直接调用原版 Dispatcher 或原版函数。原版需要额外确认或冲突处理时，保留原版执行流程并使用 GitTogether Material 界面。
- GitHub / GitHub Enterprise登录沿用原版。Gitea按下述用户补充要求提供访问令牌连接；Git读写仍使用原版通用凭据及Git引擎。GitLab等其他平台通过已有本地仓库及原版SSH/凭据助手使用，不恢复独立OAuth或远端API浏览器。
- Submit 使用现有可编辑草稿串联原版 Commit → Push；生成说明调用原版能力。Push 未确认成功时保留本地提交。原来的独立 Codex Git/AI 后台和 AI 多分支整理不进入运行链。
- Clear 保持以远端为准的工作文件语义。预览固定远端 SHA、HEAD、暂存和文件状态；通过临时 index 检出远端快照，多余文件移入系统回收站，保留原 HEAD 与暂存内容。
- Get Latest 下载深度 1 的当前分支，核对 SHA、浅边界、LFS 和对象完整性后才替换目录并删除旧历史。存在未推送提交、其他本地分支/标签或共享 worktree 时明确阻止回收，要求先处理需要保留的历史。失败保留原目录；实际回收量按磁盘占用计算。
- Presence 复用已有协议、账号、服务器、身份、组织和编辑器状态。所有 Git 状态和远端控制执行均通过私有管道转交原版 Desktop。配置和远端执行记录仍使用系统加密。

原版不具备的文件管理写操作及未明确恢复的平台账号入口在此分支停用。没有本地克隆时只显示账号目录已知的默认分支，并明确未读取历史；下载后显示实际分支、图谱和文件。

2026-10-18账号反馈补充：0.36.0按用户明确要求恢复Gitea账号连接。设置中的账号列表不预置服务占位，点击添加后出现一条可取消的草稿，用GitHub、GitHub Enterprise、Gitea三个标签选择类型；原生偏好中的账号页保持同样交互。GitHub和企业版继续调用原版登录。Gitea移植main的服务器地址/访问令牌、身份确认和完整分页目录契约，不恢复旧服务；只在连接或手动刷新时读取Gitea API，失败保留上次完整目录并显示错误。API令牌由原版TokenStore保存，公开目录及JSON文件只保存账号/仓库元数据。Git凭据通过原版通用凭据函数保存，同一服务器的不同账号在克隆URL中仅携带用户名；原版Git及credential helper继续决定实际认证、SSH、配置和后台行为。

2026-10-19证书错误反馈：0.36.1的Gitea GET采用与原版相同的Chromium fetch，进入原版证书错误和Material证书查看流程；网络错误转为中文说明，超时、响应体大小限制和拒绝重定向继续保留。应用不自动信任证书；服务器证书配置与真实账号授权须分别验收。

## 验证

完整展示目录见 [界面替换清单](github-desktop-ui-surfaces.md)。两层共用 `macos/src/material-tokens.css`；不加载原版主题，也不以遮住旧窗口或隐藏旧弹窗代替替换。系统窗口按钮、文件选择器和渲染器无法启动时的系统错误框沿用操作系统。开源许可和原始错误输出保留准确原文。

`npm test` 检查来源完整性和执行边界；`node scripts/smoke-desktop.mjs` 在完整构建后启动隔离开发实例及临时 bare 远端，验证真实 Store/Dispatcher、界面连接、Commit、Push、Clear、Get Latest 和 Presence 启动。它不使用用户仓库，不代用户进行 OAuth 授权，也不操作已安装应用。

将 `GITTOGETHER_SMOKE_APP` 指向生成的 `.app` 后运行相同脚本，可验证包内可执行文件、资源和实际Git流程。该模式从临时目录启动，不传开发页面或文件访问开关，继续使用隔离的测试配置。

真实用户登录、多设备 Presence 和各平台正式安装包仍需各自验收。原版 Electron 42 的 Windows 支持以其实际支持架构为准；旧 Tauri x86 安装包不能当作新运行时的验证证据。

账号检查入口scripts/smoke-accounts.mjs使用临时Gitea接口和需要凭据的Git HTTP远端，检查账号草稿、三标签、拒绝/取消、分页、同服务器多账号、重启、刷新失败以及原版Git凭据链。也支持用GITTOGETHER_SMOKE_APP验证实际应用包，截图和报告输出到artifacts/account-entries/版本/。真实用户OAuth及Gitea服务器访问仍单独验收。

`node scripts/smoke-presentation.mjs` 另检查隔离原生窗口中的授权表单、SSH/凭据回调、安全取消、设置分类、长错误、真实冲突和钩子失败，并输出截图。测试为 Git 全局配置指定临时文件，不使用用户仓库、不代用户授权、不操作安装版。
