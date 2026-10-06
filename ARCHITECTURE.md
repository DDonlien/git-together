# TypeScript 客户端架构

React 客户端由 App shell、AccountSidebar、统一仓库 Dashboard、独立 SettingsView、LocalRepositoryModal 和只读 RepositoryView 组成。设置仅显示账号与外观，不显示指南或材质说明；App 仍保留原生桥接就绪检查。`import-model.ts` 定义有限 API 方法与 DTO，`import-api.ts` 验证响应形状，`use-workspace.ts` 管理账号目录、异步操作和外观偏好。AccountSidebar 按 accountId 展示完整 Catalog 仓库，不用 LocalLink 过滤导航或数量；Dashboard 以账号、默认分支、本地目录等列展示一个统一列表，并支持按账号/关联状态/搜索筛选。旧 `domain.ts` / `data.ts` 仅保留历史测试契约，运行入口不导入场景或模拟操作。

`ui.tsx` 是 OpenGlass UI 的薄适配层，统一按钮、字段、分段选择、菜单、弹窗和开关契约；`theme.ts` 管理公共令牌。App shell 只有一个共享窗口 canvas，CSS 区分全局悬浮导航与右侧平面内容组。账号导航在桌面最小宽度仍保留可读名称，760px 以下使用浏览器图标栏回退。仓库图标上的空心角标明确表示 Presence 未连接，不伪造在线数据。

`WindowChrome.tsx` 是生产 App 与真实 Git 隔离 QA 共用的窗口控制区，位于横向 app-body 外，只保留红绿灯；Electron 保留系统按钮，浏览器绘制既有预览。`SidebarHeader.tsx` 共用品牌行与公共 IconButton，展开时按钮位于名称旁，收起时隐藏品牌并保留同一按钮 DOM。App 的 sidebarCollapsed 仅切换 is-collapsed CSS 类，侧栏保留56px图标列，不条件卸载导航或工作区，不改变页面/RepositoryView 的 key；账户/仓库导航隐藏文字时仍有明确可访问名称。函数式切换、aria-expanded/aria-controls 和显式名称维持鼠标/键盘操作。保持 hook 顺序不变，布局热更新不使用强制 refresh reset，避免重置当前表单。原生窗口按钮固定在顶部控制条内，不依赖侧栏宽度或 resize 回调；不增加 IPC、账号服务变更或凭据存储。

`RepositoryActions.tsx` 用公共 Menu/MenuItem 承接 Dashboard 的行尾操作，分为 Git 与 GitTogether；已有工作台/本地配置复用 App 的原处理器和权限保护。Git Fetch、Pull、Push、提交仅显示为禁用入口，没有处理器或新服务 API；此 UI 改动不扩展只读凭据/本地 Git 边界。

`FilterMenu.tsx` 复用公共 Menu/MenuItem 作为轻量筛选；选择使用 aria-current 与勾选标识，不篡改库的 menuitem 键盘契约。搜索仍由 App 持有，其 ref 移入 Dashboard 的同一筛选行，Cmd+K 不变。筛选值与搜索不依赖目录 revision，背景检查不会重置它们。

Dashboard 的仓库名称直接读取 `RemoteRepository.name`；「组织 / 用户」列读取 `fullName` 中的 owner，账号列继续通过 accountId 读取用于访问的身份。这两种归属独立：个人仓库的 owner 可能不是访问账号，组织仓库也不以账号名替代组织名。`fullName` 在账号服务边界已校验为 owner/name，展示层不增加平行字段或回退身份，搜索与完整名称提示继续使用它；行键、导航、菜单与本地关联仍使用仓库 id，不按短名称定位。不改变 API、凭据或服务会话。

## 自动检查与缓存

`auto-refresh.ts` 是可注入时钟的单资源调度器，只有一个在途请求；请求结束后才安排下一次检查。`use-auto-refresh.ts` 根据稳定的资源 ID 保留计时器，监听 visibilitychange / focus / online / offline，隐藏或离线时取消/暂停；恢复后检查。重复激活合并，最短间隔 1 秒，失败指数退避至 5 分钟，激活不能绕过退避。每个账号/本地关联有独立调度器，删除一个资源不停止其他资源。

Workspace 每约 10 秒检查服务 instance/version 与 Catalog；每个账号正常约 60 秒调用已有只读仓库 refresh；每个关联目录正常约 5 秒读取 snapshot。远端目录沿用服务分页/错误保留/原子 revision；新会话旧响应、已解绑或换路径的迟到响应不能覆盖当前数据。服务失联保留缓存并显示错误，不重放 connect、token 或授权。版本不一致停止检查，保留原刷新页面交接。

本地快照缓存位于 controller 的 localStates，Dashboard 可显示本地不可用错误，RepositoryView 复用同一快照，不各自重复拉取。内容比较复用未变的快照对象；UI 不进入整页加载、清空搜索或已选文件。选中文件 Diff 独立正常约 5 秒重读：已经修改的文件继续编辑时 status 可能相同，不能只比较文件名/status 而忽略内容。错误保留最后成功的快照/Diff 并标明过期，恢复成功后消除错误；文件退出真实更改列表时关闭其 Diff。

R-05 中已选文件退出更改列表时保留树选择，但不再显示旧 Diff，而明确显示没有未提交更改。每个任务卡片独立正常约 5 秒检查自己选中的更改文件；聚焦隐藏的卡片暂停 Diff 请求，重新展示后检查，草稿与选择不清空。

浏览器远端读取的 AbortSignal 通过 HTTP 连接关闭传递到服务端，再传递给提供方请求；监听 response close / request aborted，不把正常 POST 读完误判为取消。既有目录 refresh 不改变去重语义。原生 IPC 本身没有远端执行取消，renderer 的 signal/资源身份阻止卸载后的发布。0.5.0 的 `use-remote-repository.ts` 只为打开且可访问的仓库建立正常约 60 秒的 HEAD 心跳，以服务 instanceId + 仓库身份定位缓存，保留最后成功结果与逐任务 UI 状态；停止旧资源、丢弃迟到结果，隐藏/离线和错误退避沿用共享调度器。这是前台轮询，不是 webhook 推送，不 fetch 或写入本地 refs，不表示零延迟或 API 限流时仍实时。

## 账号服务与凭据边界

`server/account-service.ts` 是浏览器/Electron 共用的只读服务。GitHub 请求固定 `api.github.com/user` 与 `/user/repos`；Gitea 请求指定 HTTPS origin 的 `/api/v1/user` 与 `/user/repos`。来源参照 [GitHub 仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)、[Gitea 接口](https://docs.gitea.com/api/operations/user-current-list-repos/) 及 [Gitea ListMyRepos 实现](https://github.com/go-gitea/gitea/blob/main/routers/api/v1/user/repo.go)。GET 仓库接口包含账号/组织/协作范围，但仍受令牌权限限制；分页构造本机 URL，不向 Link 提供的第三方 URL 转发令牌，不跟随认证重定向。

账号 ID 独立于 host，仓库 ID 为 accountId + remoteId，因此同 host 多身份以及同一共享仓库不相互覆盖。身份重复检查 provider/host/login。状态变更串行、保存成功后才发布新状态，响应携带服务 instanceId 和递增 revision；新会话的 revision 0 可以取代旧会话，旧会话迟到响应不能覆盖已验证的新目录。添加账号前先检查 status 与版本，错误区分本地断连、超时、静态托管、服务错误与认证失败；不自动重复提交凭据。

0.4.0 的 `updateAccount` 共享 DTO 仅允许 accountId、name 与可选 token，通过原 HTTP/IPC 分发与 controller 的账号级操作锁保存。SettingsView 复用公共 Modal，AccountEditForm 按 account.id 初始化独立名称/令牌草稿；不随目录心跳重置输入，空名称、未修改和保存中禁用提交，失败保留草稿。原令牌从不返回或回填。改名不请求提供方；更换令牌只访问已保存的平台/域名，验证 login 相同后完整读取仓库，再原子持久化名称、凭据与目录。保留 account.id、仓库 ID、本地关联及其他账号，已关联但失去访问的仓库保留为 unavailable；清除旧凭据的错误与到期元信息。账号已移除或凭据已被其他编辑替换时拒绝迟到保存；旧令牌的在途 refresh 不覆盖新目录或状态。

`server/github-authorization.ts` 实现官方 GitHub 设备授权，仅在服务端持有 device_code 和 access_token；renderer 只得到随机会话 ID、公开验证码、固定验证网页、有效期与轮询间隔。最多 8 个并行等待会话，过期清理；服务端限频、slow_down 延长、单会话重复请求合并、完成结果幂等。网页拒绝/过期/无配置与网络失败分开表达，不回显第三方错误详情。取消在凭据保存前通过 AbortSignal 和提交门阻止导入；已进入原子保存的取消返回真实完成结果。React 等待循环可取消，Strict Mode effect 重放不取消真实服务会话；卸载停止等待并尽力取消服务会话。

采用 [GitHub App 官方设备流程](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)，不申请传统 OAuth 的 repo 写 scope，不打包 client secret。权限和仓库范围由自有 GitHub App 配置与用户安装/授权共同决定。收到有效期时保存到账号元信息，过期需重新网页授权；未实现 refresh token 自动续期，不保存该 refresh token。同一身份重新授权更新凭据并保留 ID/本地关联，新身份另建账号。真实流程仍需自有 Client ID 与用户同意，测试 provider 不进入运行入口。

Vite 只监听 loopback，HTTP 中间件要求本机 Host、同源 Origin / Sec-Fetch-Site、专用请求头、JSON POST 及大小限制，无 CORS 放行。静态 Sites 包装不运行这个本地账号服务，UI 会明确报不可用，不把 HTML 当作导入成功。

### 正常网页返回与开发配置

主页面的 `connect-src` 除自身和现有开发 websocket，只增加固定 `http://127.0.0.1:4174/api/` 路径前缀，供网页授权的 start/poll/cancel 请求使用；不允许任意 HTTP、外部 GitHub API、开发配置或回调路径。仅配置服务 CORS 不够，客户端 CSP 也必须允许该精确来源。客户端 HTML 策略回归同时限制脚本、默认来源和对象，构建与实际页面均需核对。

浏览器主入口现使用 `github-web-api.ts` 和 `GitHubBrowserAuthorizationModal`，不再调用设备码接口；原生桌面入口未迁移。`github-web-model.ts` 只有自有开发应用的公开 Client ID、固定本机地址与无凭据 DTO。先在点击事件内预留窗口，拿到经白名单校验的 URL 后只导航到 GitHub 官方 authorize；关闭 opener，弹窗被阻止时提供明确的再次打开入口。等待检查本机结果，不把访问令牌返回 renderer。

`github-web-authorization.ts` 保存十分钟的随机 state、S256 PKCE verifier 和一次性回调状态，服务端固定向 GitHub access_token 端点交换，不跟随重定向，不回显 provider payload，不保存 refresh token。拒绝、格式/网络失败、过期、重复回调和取消分别处理；提交门后取消等待保存结果，不误报回滚。主账号服务重启后停止当前流程，不把授权凭据自动重放到新的会话。

`server/github-oauth-dev.ts` 保留本机开发启动命令，在自动清理的专属临时目录编译并启动 `electron/github-oauth-dev.ts` 无窗口辅助进程，固定监听 127.0.0.1:4174。不读取桌面账号存储，不打开登录 WebView，不加载 .env。应用配置通过独立 `oauth-config-store.ts` 复用系统加密边界，保存在稳定的 appData/GitTogether Authorization/github-oauth-v1.encrypted，绑定配置版本和自有 Client ID；Chromium 的 userData/sessionData 仍位于临时目录。启动时恢复配置，系统加密不可用、解密或身份校验失败则拒绝启动并保留原文件，不明文降级。

每次新授权读取当前 4173 服务实例/版本，并把该连接器固定在本次授权会话中，而非永远绑定辅助进程启动时的实例。主服务重启后新的授权无需重启助手；旧回调仍拒绝跨实例导入。身份查询后读取目录及提交前再次核对实例，不重试或重放凭据。首次导入用 connect，重新授权先验证身份并用既有 updateAccount，保留账号 ID 与本地关联。账号令牌依旧仅进入账号服务的内存；现有通用 API 不保存 OAuth 有效期元数据，过期时明确要求重新授权，没有自动续期。

`electron/system-network.ts` 是桌面账号与辅助服务共用的 fetch 适配边界：通过 [Electron Chromium 网络](https://www.electronjs.org/docs/latest/api/net) 读取系统代理/PAC/直连规则，而非 Node fetch 或猜测某个 VPN 端口。辅助服务的远端请求使用独立、不持久化且禁缓存的 session；Cookie 不参与身份认证。4173 桥接使用另一个显式 direct session，仍保留固定路径、Origin、专用头、JSON、超时和实例验证。不会修改系统设置、绕过 TLS 或在代理失败后偷偷直连。已在桌面 main 注入同一适配器，必须重新构建/启动才影响已安装包；当前保留的 4173 Node 账号服务未改为 Chromium，仓库读取仍使用该进程原有网络路径。

有效回调通过协议校验后立即写出 nonce CSP 保护的进度 HTML，清除地址中的 code/state；后台交换/导入完成后在同一响应流追加相同 nonce 的脚本，以 textContent 更新结果。成功请求自动关闭；若浏览器禁止关闭，保留结果与返回动作。失败显示安全错误。无效/重复/拒绝回调不触发交换，立即返回 400；已发进度的失败用页面状态表示，不试图修改已发送的 HTTP 状态。

应用 API 的跨端口 CORS 只允许固定 4173 origin，要求专用头和 JSON；配置 API 仅允许自身 origin、随机配置页凭证和明确轮换确认。密钥直接从密码字段进入本机进程，等待系统加密文件保存成功后才启用；保存中拒绝开始授权和并发配置，失败保留旧密钥与用户输入，不回显内部存储错误。有活动授权时拒绝更换配置。父目录0700、密文文件0600，响应/日志/源码/安装包/浏览器存储均不带密钥。页面禁缓存、禁止嵌入与 referrer，回调响应移除 URL 中的授权码；不会代填或自动生成真实密钥。旧进程的内存配置没有安全导出接口，首次升级由用户直接重新输入一次，不提取或重放。本机入口与测试不是生产远端 OAuth broker，也没有把秘密打包进 Electron。此进程的配置/重启不清除主服务账号。

Electron main/preload 只开放有限 import、目录选择器、系统主题、原生玻璃检测与固定 GitHub 授权网页打开；所有 IPC 均检查当前窗口、主 frame 和可信页面，不接受调用者 URL。页面 window.open 一律拒绝，登录不嵌入 Electron renderer。`credential-store.ts` 使用 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) 将完整账号存储加密，系统加密不可用时拒绝保存，不明文降级；本地签名版可能触发系统钥匙串询问。浏览器服务使用内存会话存储，两者账号数据不共享。

### 独立 macOS 包

生产 `.app` 通过 `app.isPackaged` 加载 `app.getAppPath()/client/index.html`，不用开发 URL，也不启动 Vite/HTTP 服务；账号服务直接在 Electron main 中运行。预览环境变量只影响开发启动。`renderer-source.ts` 对文件来源比较精确的绝对页面路径，不能把所有 origin 为 `null` 的 file URL 视为同源；开发版仍比较指定 HTTP(S) origin。保持 contextIsolation、sandbox 与 nodeIntegration 禁用，不扩大 preload 能力。

`scripts/package-desktop.ts` 在系统临时目录构建有限源码快照，Vite 使用相对资源路径和禁用开发 env 注入，esbuild 编译 main/preload。产物只有 client、desktop、package.json 与有限原生模块依赖，不复制 `.env`、日志、测试、用户数据或浏览器账号。版本统一读取 `macos/package.json.version`；源码快照和 ZIP 的 SHA-256 写入产物外的 build-info.json，并拒绝交付构建期间变化的源码快照。官方 Electron Packager 生成 arm64 应用，再进行本地 ad-hoc 签名、签名验证和 ZIP 包装；不宣称 Developer ID 签名、公证或生产自动更新。

## 本地关联与只读查看

账号设置中没有仓库路径字段。账号连接后，全部已读取的仓库直接出现在侧栏和 Dashboard；远端分支/历史/树/已提交 Diff 的读取不依赖 localLink，不请求本地 snapshot，按 R-05-remote 单独接入，不能停在 metadata-only 信息页。Dashboard 和仓库信息页的配置弹窗使用可点击的目录选择字段，不再手工输入路径；`local-directory.ts` 验证桌面原生 IPC 返回的绝对目录，取消返回 null 并保留原目录。浏览器尚无原生桥接，明确提示不可用，待用户允许重启后接入受保护的本机接口；不接受 HTML 文件上传伪路径。选择不自动保存，仍由原 link API 识别 checkout 根目录，读取已配置 remote 并比较 host + owner/repo，匹配后保存关联。解除关联不移除远端仓库，也不强制退回 Dashboard；移除账号后移除其导航。两者均不删除文件。

关联本地目录后，RepositoryView 使用真实 Git status、branch、最近 log、工作目录与暂存区 Diff；关联或解除时重建对应视图，避免残留的本地快照。有限 execFile 参数、不使用 shell、禁止外部 diff/textconv、关闭可选 index 锁；不提供任意命令/任意文件读取。Diff 仅接受当前更改列表中的路径；未跟踪文件不编造差异或读取内容。没有 Git 写动作与模拟成功。修改文件、克隆、LFS 写入、AI 和 Presence 连接需要后续独立合同。

外观与折叠偏好使用 `gittogether.preferences.v2`；不保存账号令牌、仓库私密数据或错误状态。旧 v1 演示存储保留但不读取为新工作区，也不自动覆盖/清除它。

## 仓库三栏与任务模型（R-05，部分接入）

App 不再渲染重复顶栏，RepositoryView 保留一个基础信息块，并组合 RepositoryGraph、RepositoryChanges 与 RepositoryFileTree。`repository-model.ts` 定义 task/commit/workspace 数据：任务 ID 区分 branch 与 worktree 路径，commit 包含真实 parents 和 refs。全部任务同时挂载；聚焦采用 hidden，而非过滤卸载或 Git checkout，因此每个卡片的输入与 native details 展开状态保留。文件选择由 RepositoryView 按 task ID 存储，描述由对应 RepositoryChanges 持有，离开整个仓库页后不声称草稿已持久化。

`RepositoryColumnHeading.tsx` 是模块级公共栏标题，各实例持有自己的收起状态，函数式更新且不新增RepositoryView的hook、任务包裹或key变化。按钮保留同一DOM，名称随状态切换并提供aria-expanded/aria-controls。CSS通过标题的is-collapsed与`:has()`分别设置三栏宽度/min-width变量和隐藏相邻内容；44px窄栏保留展开按钮与标题，三个开关互不影响。内容仍挂载，任务草稿、selectedFiles、native details与文件树来源不重置，原读取/心跳机制保持；没有账号服务、API、IPC、Git写操作或存储变更。

默认图表使用全部已读取提交；聚焦按任务 HEAD 的真实祖先遍历过滤，并保留原 topo 顺序。SVG 只绘制 commit-parent 数据关系，包含分叉、合并与断开的根；未知父关系不会按日志相邻顺序合成。文件树由已读取路径组成、目录优先排序，行点击只更新对应 task 的选择。

`server/repository-reader.ts` 是独立、尚未由 AccountService 导入的只读读取器。以调用方已验证关联的根目录为前提：读取 `worktree list --porcelain -z`、local/remote refs、每个 worktree 的 status 和 tracked/untracked（忽略项排除）路径，以及未检出本地分支的 ls-tree。读取范围是当前本地 refs，不进行网络 fetch；提交图按真实父节点 topo 排序，最多最近 200 条，不代表完整历史或远端实时提交。

每个 worktree 校验其 realpath Git common-dir 与关联仓库相同；缺失 worktree 的错误限制在该任务。Diff 按精确 task ID 找到工作目录，只接受当前更改列表中的字面路径，不接受任意目录、未检出分支或 Git 特殊 pathspec；不读取未跟踪文件内容。所有 Git 使用有限 execFile 参数、10 秒超时/8MB输出上限、禁止外部 diff/textconv、关闭可选锁，不写 HEAD/index、不暂存/提交/切换。

完整读模型和 task Diff 的服务 DTO、HTTP/IPC 校验及 controller 接入仍待更新。0.4.0 仅按本轮许可接通账号编辑并重启预览，没有接入这些读取器；运行界面通过 `snapshotWorkspace` 兼容旧快照，仅显示已知单任务与更改文件，complete=false、无伪造 ancestry。独立 QA 入口 `tests/repository-preview-client.tsx` / `repository-preview.ts` 在另一临时 loopback 端口使用本轮创建的真实 Git fixture，不导入运行入口、不使用用户凭据，不作为账号 API 已接通的证据。

历史提交详情由模块级 `RepositoryCommitDetails.tsx` 统一渲染在本地/远端任务底部，不再属于Graph。View从现有按task.id存储的selectedCommits推导选中记录，聚焦时优先对应任务，未聚焦时保留远端HEAD/真实祖先匹配。原composer使用hidden而不卸载，本地草稿与文件选择继续保留；取消选择恢复输入。远端只使用匹配当前SHA的读取结果，未读到或失败时显示当前图记录而非旧提交。R-05-remote-metadata 从远端卡片的 HEAD/历史两种模式移除整个顶部重复分支/来源/SHA 与摘要/作者/时间，仅多任务保留具任务专属可访问名称的聚焦控件；单任务无空标题。区域名称继续标识任务，图、树及底部详情不改。没有新hook、任务key、读取协议或存储。本地任务分支/路径及现有工作目录Diff不改为历史Diff；提交正文仍未额外读取。

## 无本地关联的远端内容（R-05-remote，0.5.0 正式接入）

`server/remote-repository-reader.ts` 只接收 provider、已验证的仓库标识和服务端 transport。0.5.0 的 AccountService 提供固定 API base、账号凭据、8MB 有界 JSON/文本响应和有限远端方法 `remoteWorkspace` / `remoteCommit` / `remoteFile`；renderer 只能传入仓库 ID、合法 SHA 与字面路径，不能传入 URL、host、token 或任意 blob。生产 App 调用专用 hook 并向 RepositoryView 传递远端状态与有限提交读取函数，未关联本地也自动加载。服务缓存最多 16 个读取器，凭据/仓库变更或移除后失效；每次请求前后及返回前复核身份，旧凭据结果不能重新发布。HTTP/IPC 共用 AccountService 的有限分发，客户端再验证无凭据 DTO；不新增任意网络或目录入口。

GitHub 使用 branches、commits、git/trees、git/blobs；Gitea 区分 branches 的 commit.id、提交列表、git/commits/{sha} 与原始 .diff，再读取树和 blob。参考 [GitHub Branches](https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28)、[Commits](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28)、[Trees](https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28)，以及 [Gitea 单提交](https://docs.gitea.com/api/1.24/operations/repo-get-single-commit/)、[提交 Diff](https://docs.gitea.com/api/1.24/operations/repo-download-commit-diff-or-patch/)、[Tree](https://docs.gitea.com/api/operations/get-tree/)。不克隆、不 fetch，不读写用户 HEAD/index。

分支最多 1000 个，每个 head 最近 50 条提交，最多 4 个分支并发。树与 head 历史按不可变 SHA 缓存，各最多 64 份；真实父节点去重并拓扑排序，不用作者日期或相邻行捏造 ancestry。GitHub recursive 树截断时回退逐目录读取，Gitea 按 total_count/truncated/Link 本机分页；最多 20000 个树条目（Gitea 200 页、GitHub 400 个子树请求），到限明确提示不完整。GitHub 提交文件最多 3000 个，缺少 patch 时明确二进制/未提供差异，不伪造。逐分支失败保留成功部分；取消传播，失败和空仓库分开。

`remote-repository-model.ts` 定义独立、无凭据的响应验证。远端任务 path=null、files=[]、remote=true，树属于已提交对象，不是本地更改。`combineRepositoryWorkspaces` 同时保留 remote/local 任务身份，按真实提交父节点合并；本地解除不应擦除远端内容。文件读取只接受合法 SHA 与字面仓库路径，并先查该提交的树定位 blob；不跟随 submodule 或接受任意 blob。超过 500KB、含 NUL 或非 UTF-8 返回明确不可文本预览。

RepositoryView 接受独立 remoteState 和有限 readRemoteCommit。图选中提交控制对应任务的中栏文件列表和右栏树，再点选中项回到 HEAD；文件选择仍按任务 ID 同步。按 R-05-remote-inline-preview 移除远端内嵌文本展示、内容状态/轮询以及 App→View→RemoteChanges 的文件读取 prop；生产 hook 不再发起专供预览的 remoteFile 请求。后台有限 API、Diff/blob DTO 和相关权限/隔离测试保留，没有服务或协议改动。`use-remote-commits.ts` 复用前台取消/退避调度器，按 SHA 缓存最多 64 份；资源身份阻止过期发布，聚焦只影响活动读取，不卸载卡片。远端已提交卡片的 composer 与 Commit 禁用，本地未提交卡片仍独立保留草稿和 Diff。实际 App 始终传入远端读取状态，失败显示实际错误/自动重试、空仓库显示真实空态，不再使用未接入占位；旧隔离组件未传 reader 的占位契约保留。当前主服务已重启到 0.5.0，真实账号须用户重新连接后另行验收，不能将 fixture 端口或无凭据公开读取称为已登录页面。

测试 `git-remote-fixture.ts` 把本轮创建的真实临时 Git 数据转换为有限 provider 响应，覆盖零关联的真实 merge、分支树、Diff、已提交 blob 与本地脏内容隔离；`remote-integration.test.ts` 经过实际 AccountService→HTTP→importAPI，验证两个 provider、有限输入、SHA 缓存、凭据更新/移除竞争、取消和 HTTP 断连。`remote-integration-preview.ts` 在独立临时端口运行生产构建 App 和实际服务，测试账号只有 synthetic token，无测试入口进入生产；`repository-preview.ts --remote` 保留组件隔离 QA。临时 Git 的 HEAD/index 不受应用改动，用户凭据不导出、不重放、不落盘。

文件树来源控制仅为 RepositoryView 内部状态，不新增 API。未选择时优先远端（只有本地任务时显示本地）；用户选择不被心跳重置。按 task.remote 区分来源，按现有 task.id 隐藏而不卸载树，选择与展开仍各任务独立；聚焦任务不属于所选来源时，右栏按同一分支匹配另一来源的任务，不改变聚焦或 checkout。源无任务时显示明确状态，不回退冒充另一源。标题公共分段组件提供具名 fieldset/legend 与 pressed 按钮，复用 Tab、Enter、Space；右栏卡片不重复显示远端文字。隔离 `repository-preview.ts --mixed` 组合同一个新建临时 Git 仓库的 provider 已提交内容与本地脏工作目录，用于来源差异/状态保留验证，不连接用户账号服务。
