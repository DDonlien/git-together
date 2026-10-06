# 本地开发

客户端位于 `macos/`。`npm run dev -- --port 4173 --strictPort` 启动 Vite 浏览器预览，`npm run desktop` 打开同一界面的 Electron macOS 窗口。先启动 Vite 再启动 Electron；开发窗口只加载 localhost。

## 独立 macOS 本地包

Apple Silicon macOS 在 `macos/` 运行 `npx tsx scripts/package-desktop.ts`。脚本读取当前 package.json 版本和已安装 Electron 版本，在临时快照里构建，无需重启现有 Vite 或复制账号；首次可能从官方 npm 获取固定版本的 Electron Packager。若已下载对应 Electron ZIP，可把缓存目录传入 `GITTOGETHER_ELECTRON_ZIP_DIR`，否则使用官方下载缓存。

产物位于项目容器的 `_builds/gittogether-<版本>-macos-arm64-<随机后缀>/`：独立 `.app`、ZIP 与包含两种 SHA-256 的 build-info.json。解压后双击 GitTogether.app 即可运行，不需要终端、Node、Vite 或 4173 服务；可自行移到应用程序目录，本脚本不会覆盖已安装应用。包只做本地 ad-hoc 签名，未用 Developer ID 签名或 Apple 公证，不作为公网安装版发布。

桌面设置从自己的系统加密存储读取账号，不自动复制网页令牌。先在桌面连接账号，再在 Dashboard 关联本地目录；文件夹入口调用 macOS 系统选择器，不使用文件上传伪路径。打包不等于 GitHub 网页返回、远端内容读取或 Git 写操作已接通。

2026-10-06 的两轮 0.4.0 本地包已实际加载包内 file 页面；设置/内置账号服务版本一致，原生 Liquid Glass 为 true。通过实际已打包的 preload/IPC 验证系统目录窗口打开、取消返回 null、选择本项目目录后返回精确绝对路径；未导入用户凭据，也未保存真实目录关联。最终完整快照含最新设置宽度与文件树胶囊修正，签名、ZIP 与源码校验通过，main/preload 与已实测包字节相同；最后一次打开被 Mac 锁屏阻止，未绕过，等待解锁后再复核新包启动。

## 开发入口与历史边界

`npm run check` 检查 TypeScript；`npm test` 运行账号/本地只读服务测试及保留的历史契约测试；`npm run build` 构建客户端。`npm run test:sites` 验证静态包装。0.2.0 不提供演示场景，旧 scene 参数会从 URL 移除且不加载 fixture。

左下角设置是独立账号页面，另有外观设置。0.2.1/0.2.2 的指南、材质、令牌创建、只读与存储说明保持删除。0.3.0 GitHub 默认网页授权、令牌输入折叠为备用；Gitea 保持域名与令牌方式。账号初始为空，不会自动读取系统中的 GitHub/Gitea 凭据。Dashboard 读取远端仓库，弹窗关联已有 Git 目录。浏览器账号只存于 Node 服务会话，桌面账号使用系统安全存储加密持久化；两者相互独立。网页存储只含外观与折叠偏好，旧演示存储不自动清理。

0.3.1 仅调整版本展示：GitTogether 版本号从设置标题移到外观后的页面底部，右对齐；页底 padding 与标题到账号区共用 22px 间距，不叠加最后一组的外边距，不增加分隔线。账号及授权交互未改动。

0.3.2 移除搜索框与表单文本输入聚焦时叠加的蓝色光圈/内部轮廓，只保留细灰边框。错误色、输入/清空与键盘定位保持，不改变按钮、选择框和勾选框的焦点规则。

0.4.0 增加已有账号的编辑与保存：名称预填，令牌为空时仅改名；新令牌需验证相同 provider/host/login，再沿用原子安全存储保存。账号与仓库 ID、本地关联和其他账号保持独立，错误输入保留，旧凭据的迟到刷新不能覆盖更新。用户明确许可本轮编辑接口和版本更新触发的预览重启；浏览器 Gitea 会话已清空，需用户重新连接，未导出或重放令牌。独立 QA 可在构建后运行 `npx tsx tests/account-edit-preview.ts`，使用生产客户端、真实 AccountService 和测试 provider，临时端口与账号不进入用户服务；控制命令只接受该进程标准输入（state / hold / release / quit），不提供运行应用里的测试接口。UI fixture、服务测试与构建不等于真实钥匙串持久化或用户令牌更新验收。

0.5.0（2026-10-07）正式接入无本地目录的远端分支/历史/树/已提交 Diff/文件内容，增加有限 `remoteWorkspace` / `remoteCommit` / `remoteFile` 方法，共用主服务 HTTP 和桌面 IPC，生产 App 自动加载选中仓库。前台约 60 秒检查分支 HEAD，SHA 缓存避免重复读取历史/树；切换仓库取消、错误保留上次数据并退避，HTTP 断连传递给提供方。用户另行明确许可「重启」，主预览已恢复监听 4173，版本 0.5.0；网页账号需用户重新连接，没有导出、恢复或重放旧令牌。授权辅助 4174 未重启，旧授权会话仍必须遵守主实例/版本检查；旧桌面包、本地完整多-worktree 读模型、系统目录选择器和 Git 写操作不包含在此交付。真实 Gitea 登录页面等待用户重连；无凭据公开接口只读已验证 backrooms 的三个分支、16 提交与完整树/Diff，不能冒称登录或私有权限验收。

完整链路回归位于 `tests/remote-integration.test.ts`，使用自己的真实临时 Git 和 synthetic provider；生产 UI QA 可在构建后运行 `npx tsx tests/remote-integration-preview.ts`。它输出独立临时端口，stdin `state` 查询只读计数和 Git 不变，`quit` 核对并清理临时仓库/服务；不会给 4173 注入测试账号、开放测试 API 或取得用户凭据。

2026-10-06 Dashboard 增量：行尾「…」提供 Git / GitTogether 分组，工作台和目录配置复用已有入口；目录列文字也可以直接配置。Fetch、Pull、Push、提交尚未实现，菜单禁用，不模拟成功。只读账号/Git 服务保持原边界。当前真实浏览器账号在服务内存中，package.json 的修改会触发 Vite 配置重启，因此本轮增量保持预览版本 0.3.2，正式版本递增留待可安全重启的交付阶段。

2026-10-06 本地配置弹窗：两段常驻说明移除，手动路径框改为整行系统文件夹选择入口。Electron 已有 `gittogether:choose-directory` IPC，选择返回真实绝对路径，取消不替换原路径，选好仍通过原 link API 验证/保存。当前浏览器没有该原生桥接，点击明确报不可用；浏览器接口与版本递增需要修改 Vite 配置依赖，会重置当前账号会话，等待用户批准后再接入。不得用 `webkitdirectory` 的相对目录或 `C:\\fakepath` 冒充真实工作目录。组件/助手测试与浏览器布局检查不等于原生系统窗口验收。

2026-10-06 搜索/筛选与自动检查：Dashboard 搜索移入统计下方、仓库表上方的筛选行，两个筛选使用轻量公共菜单，移除手动「重新加载」与本地文件页「刷新」。服务/Catalog 正常约 10 秒、每账号远端目录约 60 秒、每关联本地目录与选中文件 Diff 约 5 秒检查；间隔从上次请求完成起算，耗时与退避会增加延迟。隐藏/离线暂停，恢复检查；失败最大退避 5 分钟，窗口激活不能绕过。远端时间通过仓库数量提示查看，本地时间/错误通过状态提示查看。检查不是 Git fetch 或自动重放账号授权。

自动检查的纯调度回归使用注入时钟，不依赖真实等待；独立浏览器 QA 辅助为 `tests/auto-sync-preview.ts`，启动后提供临时端口，基于生产客户端、真实临时 Git 仓库和测试 provider，不连接用户凭据或进入运行构建。控制仅在该辅助进程 stdin 中，退出会核对 HEAD/index 未被应用修改并清理临时仓库。该验收与真实 Gitea 会话的目录心跳分别记录，不能冒充原生 IPC 或真实 GitHub 授权验收。

本机 macOS 26.6.2 可以验证原生 Liquid Glass 插件；macOS 27 原生运行需在该系统另行验证。浏览器版本呈现同一 TS UI 的玻璃效果，不能称为 AppKit 原生控件。

## GitHub 正常网页授权（本机开发）

自有 GitHub App `GitTogether-DDonlien-Dev` 已注册，公开 Client ID 已配置在开发入口，不使用其他产品的应用身份。浏览器按 [GitHub 官方网页流程](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-web-application-flow-to-generate-a-user-access-token) 打开登录/同意并返回本机；随机 state、S256 PKCE 和服务端客户端密钥共同保护交换过程。此处是开发者的一次性准备，普通用户不需要创建 GitHub App。

保持 4173 预览在线，在 macos 中运行 `./node_modules/.bin/tsx server/github-oauth-dev.ts`；本轮已启动，无需用户再启动。开发配置页是 `http://127.0.0.1:4174/setup`。在 GitHub 应用后台把 Callback URL 保存为 `http://127.0.0.1:4174/oauth/github/callback`，权限维持当前只读范围。若密钥已贴入聊天或日志，先在 GitHub 撤销旧密钥、生成替代密钥；直接在本机密码字段输入并提交，不发给 agent 或聊天。密钥由系统安全存储加密保存，授权助手重启会自动恢复，不写 .env 文件、网页存储、源码或安装包。macOS 配置文件位于 `~/Library/Application Support/GitTogether Authorization/github-oauth-v1.encrypted`，与桌面账号及临时 Chromium 数据分开；加密不可用或原配置损坏时拒绝使用/覆盖，不降级到明文。旧版仅有内存配置，升级首次需用户直接重新输入一次；不支持提取旧进程密钥迁移。

配置完成后返回 GitTogether 设置，点击「通过 GitHub 网页授权」，在官方页面自行登录/同意。回调服务端交换令牌后通过已有账号 API 添加/更新身份；窗口关闭、账号列表和 Dashboard 自动更新。同一身份复用 0.4.0 的编辑接口，ID 与本地关联保留；不同身份独立添加。访问范围仍由 GitHub App 权限、用户同意及个人/组织安装范围共同决定，不能把能登录当作私有仓库已获准访问。

本机开发服务不会重启主账号服务。每次新授权绑定当时的主实例，主服务重启后可直接开始新授权，不需要同时重启授权助手；进行中的旧回调仍会要求重新开始，不能自动重放到新实例。它不是已部署的生产授权服务，原生 Electron 的正常浏览器返回仍未接入，不得把客户端密钥打包进去。refresh token 不留存、自动续期未实现；当前通用账号接口不保存网页 OAuth 的有效期元数据，过期通过读取失败提示重新授权。2026-10-06 用户已自行启用本机配置并表示保存回调，configured=true 已读回；这不等于密钥有效性、GitHub 同意或仓库导入已验收，密钥轮换也未完成。普通用户只授权共享的应用，正式对外使用的应用发布与安全授权接入仍待完成，不要求用户各自注册或输入应用密钥。

主页面 CSP 精确允许 `http://127.0.0.1:4174/api/`；缺少它时浏览器会在服务 CORS 正常的情况下阻止请求，显示“无法连接本机网页授权服务”。修改 HTML 后需要新文档生效（Vite 当前已自动刷新），不需要重启两个内存服务。已实测当前按钮可进入等待授权并取消；这是本机连通性验收，不是完成 GitHub 同意后的返回验收。

2026-10-07 网络/黑屏修复：启动命令不变，现在使用专属临时目录编译/启动无窗口 Electron 授权进程，不启动第二份主账号服务。GitHub 的交换与身份读取遵循 Chromium 的系统代理/PAC/直连；本机 4173 桥接强制直连。没有硬编码 VPN 端口，不改系统代理或 TLS，不把代理故障隐藏为直连。有效回调立即显示进度并移除 code/state，随后原位更新成功/失败。只重启获准的 4174，4173 原实例及 Gitea 账号保留；用户随后自行在本机密码字段重新配置，configured=true 已读回，从真实应用入口授权并完成 GitHub Continue/同意。用户确认成功，实际读回 GitHub1/Gitea1账号、38+20仓库、0关联；页面已返回并显示新账号仓库。原安装包尚未更新，4173 Node 仓库读取的网络路径仍未替换；生产授权、其他网络环境全流程与完整私有/组织范围仍未验收。

网络测试 `tests/system-network.test.ts` 会在自动清理的临时目录启动隔离 Electron，测试自己的 HTTP/PAC/代理/TLS 服务，不修改系统代理、不关闭用户 VPN。`tests/system-network-fixture.ts` 的 `--live-connectivity` 是额外的无凭据公共端点检查，不进入运行入口，也不作为真实 OAuth。回调浏览器 QA 在交互终端运行 `./node_modules/.bin/tsx tests/github-callback-preview.ts`，输出独立回调网址；输入 `success` / `failure` 结束对应测试等待，`quit` 清理。仅使用虚构凭据与空目录 DTO，不连接实际账号服务，不留测试 API 在生产中。

随后状态（2026-10-07 00:42–00:47）：主预览4173不再监听，PID75051已退出，授权辅助服务4174仍在线。只读核对「sol_app」任务确认用户另行允许远端内容接入并重启，该任务实际停止了上述主进程且仍在实现/验证。授权修复任务没有再次启动主服务；上面的2账号/58仓库是停止前的成功证据，不能称为当前在线会话。独立任务完成后需要按新实例重新连接账号，授权助手仍会校验主服务实例变化，不能重放旧回调。

2026-10-07 02:19 持久化更新：用户明确要求安全保存配置并修复重启衔接。只替换4174授权助手（PID97207→31840），4173保持PID23078、实例c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1与0.5.0，更新前后均为0账号/0仓库/0关联，未额外清空会话。真实 Electron 的不同临时启动目录、跨进程加密恢复、权限/明文检查与故障保留已通过；授权新旧实例隔离回归通过，全套186/186、strict、4/4静态包装及生产构建通过。配置页已打开，密码字段为空、configured=false，等待用户本人首次保存；这些测试不表示旧内存密钥已经迁移。应用包未更新。新增测试 `tests/oauth-config.test.ts` / `oauth-config-fixture.ts` 使用虚构密钥与自动清理的隔离目录，不读写用户配置。

## GitHub 设备授权配置（历史桌面入口）

注册 GitTogether 自有 GitHub App，在应用设置启用 Device flow。仓库权限至少为 Metadata read-only，不申请写权限；按需把应用安装在要访问的个人/组织仓库。设备流程不需要 client secret，不能拿 PAT 或其他产品的 Client ID 替代应用身份。配置注册步骤见 [GitHub 文档](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)，协议见 [设备授权文档](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)。

仅对保留的设备授权入口，在本地进程环境配置 `GITTOGETHER_GITHUB_CLIENT_ID=自己的ClientID`。不要加 VITE_ 前缀或放入 token/client secret。修改主服务配置会重启并清空浏览器内存账号，应先取得许可；此配置不等于新的网页回调已接通。账号连接仍可选择备用的访问令牌。

GitHub 授权在官方验证网页输入弹窗中的公开验证码，应用自动检测完成。自动网页弹窗被拦截时点击「打开 GitHub」。浏览器需要重新加载到当前 0.4.0，原生客户端需要重启到重新编译的桥接。用户关闭/取消停止本地导入，不等于撤销 GitHub 网页上的应用授权；撤销授权应在 GitHub 设置完成。

GitHub App 的仓库访问受用户、应用权限与安装范围共同限制；组织可能需要管理员批准或 SSO。访问令牌有有效期时，过期重新授权，当前不实现自动 refresh token 续期。Gitea 网页 OAuth 不属于本轮实现范围。

## 0.3.0 验证边界（2026-10-06）

- 用户测试 token 通过一次性标准输入只读请求验证：GitHub 身份与一页仓库接口 HTTP 200，不写文件或应用账号，不输出个人身份/仓库名/凭据。没有验证所有私有仓库、组织批准或 SSO。
- 当前 4173 status 与 catalog HTTP 200，版本 0.3.0；没有配置 Client ID 时授权开始明确返回配置错误。截图中的旧断连未复现，不断言原因为服务退出。
- 回归覆盖设备协议、节流、拒绝/过期、并发、取消竞争/提交门、同 host 多身份与重新授权、凭据隔离、版本/服务会话切换、连接错误分类与有限链接；不是用户在 GitHub 的真实网页同意或原生安全存储验收。
- 本轮 strict、42/42测试、4/4静态包装、生产构建、Electron main/preload 编译通过；构建和工具模拟窗口测试不是原生 UI 运行验收。
- 浏览器工具已有安全拒绝，不绕过；当前 UI 目视/点击和真实设备授权仍待人工验收。没有提交、推送或部署。

## 账号导入验证（0.2.0，2026-10-04）

- TypeScript strict、22 项测试（11 项新账号/只读服务测试 + 11 项历史契约）、4 项静态包装测试、生产构建。
- 新服务测试涵盖 GitHub/Gitea 分页、同 host 多身份、重复身份、错误令牌、加载失败保留/重试、存储失败原子性、损坏存储拒绝覆盖、API 来源限制、含空格本地目录与错误远端拒绝。临时 Git 仓库测试前后 index、HEAD、文件和状态不变。
- 浏览器用 loopback 假 Gitea 服务实际填写表单，验收多账号读取、弹窗错误/成功、侧栏折叠、真实临时仓库 Diff/历史、失败重试、筛选、Cmd+K、Escape 焦点恢复、外观与窄窗口。测试服务不进入应用，也没有新增内置演示入口。
- 桌面已重启并报告 native glass / renderer bridge 就绪。系统锁屏导致最新桌面目视、系统目录选择器和真实凭据持久化/重启验证尚未完成；不得把注入式存储测试称为实际系统钥匙串验收。
- 真实账号授权、组织 SSO 与实际 Gitea 版本尚需用户提供令牌后验证。没有克隆、修改或推送真实仓库，没有提交代码、推送或部署。静态 Sites 部署不支持本机账号/Git 服务，需本地版或桌面版。

## 历史验证结果（0.1.2，2026-10-03 至 10-04）

- `npm run check`：TypeScript strict 通过。
- `npm test`：11 项业务测试通过。
- `npm run test:sites`：4 项静态服务/构建产物测试通过；没有部署到 Sites。
- `npm run build`：生成生产客户端与 bootstrap 所需的服务包装。
- 浏览器：本轮打开并审查全部13个场景，检查亮暗色、减少透明度、1600×900、920×640/740及390×844。复查平面分组、Split Diff、Graph/Tree、详情收起、Commit预览、AI生成时禁用、失败保留、菜单方向键/Escape、弹窗关闭焦点恢复和Cmd+K。前一版33项业务流程检查是历史证据，不冒称全部已在本轮重跑。
- Electron 39.8.10：实际窗口重启，输出 `native Liquid Glass: enabled` 和 `renderer mounted; native bridge connected`。本轮前段已截图确认悬浮导航与平面内容；最后重启后Mac已锁屏，最终桌面截图及原生最小窗口尺寸尚未复查。未声称macOS 27兼容验收。
- 本轮截图与修复记录见根目录 `design-qa.md`；没有接入真实Git/AI/Presence，也未提交、推送或部署。

上述 0.1.2 场景/模拟操作是历史证据，0.2.0 已移除其运行入口。

若 npm 安装策略未执行 Electron 的安装脚本，需要先完成官方运行时安装。本次环境的自动 ZIP 解压未完整结束，使用官方缓存 ZIP（校验 SHA-256 与包内清单一致）完成依赖解压，没有修改任何用户应用或真实仓库。
