# 统一Electron与GitHub网页授权入口并完善等待与重试流程

- ID：`IMPORT-native-browser`。
- 原聚合 ID：`IMPORT-native-browser`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：任务清单 / Phase - v0.1.0 - 独立 TypeScript 客户端 / codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 拆分前原稳定 ID：`IMPORT-native-browser`, `IMPORT-native-browser-live`, `IMPORT-01`, `IMPORT-02`, `IMPORT-02-repository-authentication`, `IMPORT-02-repository-access`, `IMPORT-02-git-auth-lifecycle`, `IMPORT-02-git-auth-lifecycle-source`, `IMPORT-02-git-native-remote`, `IMPORT-02-git-auth-lifecycle-runtime`, `IMPORT-02-edit`, `IMPORT-02-edit-remove`, `IMPORT-02-edit-remove-test`, `IMPORT-02-edit-test`, `IMPORT-03`, `IMPORT-04`, `IMPORT-04-worktrees`, `IMPORT-04-directory-display`, `IMPORT-04-directory-display-test`, `IMPORT-04-worktrees-test`, `IMPORT-04-account-batch`, `IMPORT-04-account-batch-feedback`, `IMPORT-04-account-batch-performance`, `IMPORT-04-account-batch-test`, `IMPORT-04-inline`, `IMPORT-04-path-hover`, `IMPORT-04-association-refresh`, `IMPORT-04-open-folder`, `IMPORT-04-discovery-boundary`, `IMPORT-04-discovery-boundary-release`, `IMPORT-04-picker`, `IMPORT-04-picker-test`, `IMPORT-05`, `IMPORT-06`, `IMPORT-08`, `IMPORT-08-test`, `IMPORT-09`, `IMPORT-09-test`, `IMPORT-10`, `IMPORT-10-test`, `IMPORT-11`, `IMPORT-11-token-refresh`, `IMPORT-11-windows-oauth-port`, `IMPORT-11-connect`, `IMPORT-11-browser`, `IMPORT-11-native-keychain`, `IMPORT-11-native-keychain-test`, `IMPORT-11-native-keychain-live`, `IMPORT-11-browser-local`, `IMPORT-11-browser-local-code`, `IMPORT-11-browser-local-csp`, `IMPORT-11-browser-local-csp-test`, `IMPORT-11-browser-network`, `IMPORT-11-browser-network-test`, `IMPORT-11-browser-progress`, `IMPORT-11-browser-progress-test`, `IMPORT-11-browser-return`, `IMPORT-11-browser-live`, `IMPORT-11-secret`, `IMPORT-11-secret-persistence`, `IMPORT-11-secret-persistence-test`, `IMPORT-11-secret-persistence-live`, `IMPORT-11-browser-rebind`, `IMPORT-11-browser-rebind-test`, `IMPORT-11-ready`, `IMPORT-11-ready-test`, `IMPORT-11-callback-document`, `IMPORT-11-callback-document-test`, `IMPORT-11-callback-document-live`, `IMPORT-11-callback-feedback`, `IMPORT-11-callback-feedback-test`, `IMPORT-11-callback-feedback-live`, `IMPORT-11-secret-entry`, `IMPORT-11-secret-rotation`, `IMPORT-11-test`, `IMPORT-12`, `IMPORT-12-branch-behavior`, `IMPORT-12-branch-behavior-gitea`, `IMPORT-12-branch-behavior-created`, `IMPORT-12-branch-behavior-import`, `IMPORT-12-branch-behavior-import-test`, `IMPORT-12-branch-behavior-account`, `IMPORT-12-branch-behavior-account-test`, `IMPORT-12-update-settings`, `IMPORT-12-test`, `IMPORT-13`, `IMPORT-13-repository-pin`, `IMPORT-13-status-header`, `IMPORT-13-branches`, `IMPORT-13-branches-test`, `IMPORT-13-branches-folder`, `IMPORT-13-branches-folder-test`, `IMPORT-13-branches-motion`, `IMPORT-13-main`, `IMPORT-13-test`, `IMPORT-13-owner`, `IMPORT-13-owner-test`, `IMPORT-14`, `IMPORT-14-last-divider`, `IMPORT-14-last-divider-test`, `IMPORT-14-grouped-actions`, `IMPORT-14-header-alignment`, `IMPORT-14-header-alignment-runtime`, `IMPORT-14-header-count-corner`, `IMPORT-14-production-submit`, `IMPORT-14-production-submit-runtime`, `IMPORT-14-push-lfs-errors`, `IMPORT-14-submit-popup`, `IMPORT-14-submit-summary-only`, `IMPORT-14-submit-popup-width`, `IMPORT-14-windows-lfs-commit`, `IMPORT-14-commit-timeout-headless`, `IMPORT-14-submit-popup-production`, `IMPORT-14-submit-popup-h5`, `IMPORT-14-submit-ai`, `IMPORT-14-header-text`, `IMPORT-14-download-icon`, `IMPORT-14-grouped-icons`, `IMPORT-14-grouped-refinement`, `IMPORT-14-grouped-h5`, `IMPORT-14-branch-name-alignment`, `UI-04-repository-reveal`, `IMPORT-14-inline`, `IMPORT-14-number-ignore`, `IMPORT-14-read-badges`, `IMPORT-14-read-health-scope`, `IMPORT-14-read-badges-test`, `IMPORT-14-read-failure-live`, `IMPORT-14-check-cycle`, `IMPORT-14-change-trigger`, `IMPORT-14-zero-badges`, `IMPORT-14-diagnostics`, `IMPORT-14-performance`, `IMPORT-14-performance-source`, `IMPORT-14-performance-runtime`, `IMPORT-14-diagnostics-copy`, `IMPORT-14-diagnostics-test`, `IMPORT-14-operation-semantics`, `IMPORT-14-branch-download`, `IMPORT-14-branch-download-layout`, `IMPORT-14-branch-download-layout-test`, `IMPORT-14-operation-semantics-test`, `IMPORT-14-visible`, `IMPORT-14-hide`, `IMPORT-14-hide-counts`, `IMPORT-14-hide-header-count`, `IMPORT-14-operation-execution`, `IMPORT-14-operation-collapse`, `IMPORT-14-operation-collapse-icons`, `IMPORT-14-feedback`, `IMPORT-14-action-names`, `IMPORT-14-action-names-test`, `IMPORT-14-feedback-test`, `IMPORT-14-number-ignore-test`, `IMPORT-14-test`, `IMPORT-15`, `IMPORT-15-test`, `IMPORT-16`, `IMPORT-16-provider-budget`, `IMPORT-16-provider-budget-diagnosis`, `IMPORT-16-provider-budget-validation`, `IMPORT-16-test`, `IMPORT-17`, `IMPORT-17-completeness`, `IMPORT-17-completeness-test`, `IMPORT-17-completeness-live`, `IMPORT-17-consistency`, `IMPORT-17-metadata`, `IMPORT-17-test`, `IMPORT-17-visibility`, `IMPORT-17-visibility-test`, `IMPORT-17-live`, `IMPORT-18`, `IMPORT-18-shell`, `IMPORT-18-shell-test`, `IMPORT-18-test`, `IMPORT-18-revert`, `IMPORT-18-revert-test`, `IMPORT-07`, `IMPORT-07-package`, `IMPORT-07-package-test`；不改写或重编号这些既有 ID。
- 拆分前标题：codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 原稳定 ID：`x`、`IMPORT-native-browser`、`IMPORT-native-browser-live`、`IMPORT-11`、`IMPORT-11-token-refresh`、`IMPORT-11-windows-oauth-port`、`IMPORT-11-connect`、`IMPORT-11-browser`、`IMPORT-11-native-keychain`、`IMPORT-11-native-keychain-test`、`IMPORT-11-native-keychain-live`、`IMPORT-11-browser-local`、`IMPORT-11-browser-local-code`、`IMPORT-11-browser-local-csp`、`IMPORT-11-browser-local-csp-test`、`IMPORT-11-browser-network`、`IMPORT-11-browser-network-test`、`IMPORT-11-browser-progress`、`IMPORT-11-browser-progress-test`、`IMPORT-11-browser-return`、`IMPORT-11-browser-live`、`IMPORT-11-secret`、`IMPORT-11-secret-persistence`、`IMPORT-11-secret-persistence-test`、`IMPORT-11-secret-persistence-live`、`IMPORT-11-browser-rebind`、`IMPORT-11-browser-rebind-test`、`IMPORT-11-ready`、`IMPORT-11-ready-test`、`IMPORT-11-callback-document`、`IMPORT-11-callback-document-test`、`IMPORT-11-callback-document-live`、`IMPORT-11-callback-feedback`、`IMPORT-11-callback-feedback-test`、`IMPORT-11-callback-feedback-live`、`IMPORT-11-secret-entry`、`IMPORT-11-secret-rotation`、`IMPORT-11-test`、`IMPORT-07`、`IMPORT-07-package`、`IMPORT-07-package-test`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围

- [x] [IMPORT-native-browser] 修复 Electron 错用未配置设备流的账号入口，统一正常网页授权并复用已安全保存的应用配置。原生会话能力值与凭据只在主进程/助手传递；账号保存后确认回调，保留既有账号、目录映射与授权有效期。缺少助手时内置进程自动恢复配置，不依赖开发预览。59项相关回归通过；实际新包与 GitHub 用户同意分别记录在任务日志。
  - [x] [IMPORT-native-browser-live] 2026-10-10启动通过源码一致性保护和Developer ID验证的0.11.0签名包，从设置正常发起GitHub授权，真实浏览器回调完成并返回桌面。实际读回GitHub38/Gitea20仓库、2个账号和原2个本地关联；加密应用配置未重填或修改。本次复用0.11.1本机助手；签名包内置助手独立启动、生产共享授权及全部私有/组织安装范围分别待验收，不代替用户最终同意。

- [x] \[IMPORT-11] 已实现流程代码：GitHub 添加账号以网页授权为主入口，提供独立等待弹窗、系统浏览器/网页窗口入口、授权码复制、自动检测、取消、拒绝/过期/错误重试；手动 token 仅作为折叠的备用方式。采用官方设备授权，不嵌入 GitHub 登录、不内置第三方 Client ID 或 client secret，凭据不返回渲染层。Gitea 保留现有令牌方式。真实授权接通仍依赖下列验收前提。
  - [x] \[IMPORT-11-token-refresh] GitHub网页/设备授权保存系统加密的续期凭据，在访问令牌到期前按账号合并续期，401最多续期并重试一次；轮换凭据原子保存，取消、账号移除/换令牌、网络/保存失败均不破坏账号和仓库关联。安全日志记录过期、续期结果、HTTP状态与失败原因；旧登录缺少续期凭据时明确说明需一次重新授权。修复后提交推送main并同源发布macOS ARM和Windows x86/x64，复用签名及公证，校验安装包与公共更新源，不操作用户安装版。 0.30.4已从main同源三平台正式发布，类型/Cargo/生产构建、Apple Accepted及staple、Windows原生安装/启动、更新签名与公开完整下载校验通过；真实账号长时续期与用户自行安装后的使用分别观察，不把源码/包验证当成已安装应用验收。
  - [x] \[IMPORT-11-windows-oauth-port] 区分 GitHub 固定回调的端口占用和系统拒绝绑定，保留系统错误码。回调不可用时自动使用自有 GitHub App 的官方设备网页授权，沿用账号导入、取消及重试，不关闭未知进程或修改系统网络。备用授权需开发者一次开启；端口冲突隔离验证、GitHub 配置可用性及真实 Windows 授权分别记录。 2026-10-12：0.29.2已正式发布，启用自有GitHub App的设备流后，隔离真实端口冲突取得合法设备验证码、轮询/取消与监听恢复通过；同源macOS ARM和Windows x86/x64安装包、Apple Accepted公证、签名及公开完整更新源校验通过。用户Windows最终同意和原始系统错误未代为验收。
  - [ ] \[IMPORT-11-connect] 由 GitTogether 开发者在开发阶段一次性注册自有 GitHub 应用、配置真实 Client ID 与授权回调，再验证真实网页同意后读取账号与仓库。开发者注册与普通用户登录分开；不能让每个用户去 Developer settings 注册应用或填写 Client ID。仅申请当前只读导入需要的权限，不复用 GitHub CLI 或其他应用的身份。
  - [ ] \[IMPORT-11-browser] 普通用户在 GitTogether 点击 GitHub 授权按钮后，直接打开 GitHub 官方登录/同意页面，完成后自动回到应用、添加账号并加载仓库，体验参考 GitHub Desktop。不将应用注册或开发配置放入账号连接流程；现有设备码流程不能替代这条浏览器授权与回调的真实验收。
    - [x] \[IMPORT-11-native-keychain] 桌面重新授权直接打开 GitHub 网站，正常流程不再启动另一个钥匙串身份并额外要求系统登录密码。授权服务在主进程运行，启动时恢复与账号凭据共用系统加密身份的应用配置；既有独立助手配置只安全迁移一次，保留原文件，密钥只经进程私有管道进入主进程并重新加密，不进入页面、日志、命令参数或安装包。系统尚未允许读取旧钥匙串时，首次迁移仍由用户确认；不绕过系统权限。准备/迁移期间暂缓应用更新安装，失败仍可进入设置并在授权入口读到错误；源码实现已完成，安装版尚未更新。
      - [x] \[IMPORT-11-native-keychain-test] 连续两次网页授权不重读安全存储、配置准备和迁移合并、保存完成前不启用配置、迁移/解密失败保留原配置、复用外部助手不关闭它，以及私有管道正常/空配置/超长输出/失败/取消通过。新增16项回归，相关49/49、类型检查和生产构建通过；实际Electron生产main迁移分支以隔离appData和虚构解密器核对fd 3，不读取用户钥匙串或配置。
      - [ ] \[IMPORT-11-native-keychain-live] 更新正常签名的桌面安装包后，核对既有配置首次迁移、应用重开及连续两次真实GitHub重新授权；确认正常流程无额外系统密码提示且账号/本地关联保留。源代码、虚构配置和原生管道测试不替代用户钥匙串权限及网页同意验收。
    - [x] \[IMPORT-11-browser-local] 开发预览使用独立的本机网页授权回调，完成后通过现有账号接口导入；授权辅助服务本身不重启或清空主服务会话。校验一次性 state 与 PKCE，取消、拒绝、过期和重复回调不得误报连接成功；密钥、授权码和访问令牌不返回账号界面。2026-10-07 用户完成真实同意，返回与目录导入通过，成功时原实例有 GitHub38/Gitea20仓库；后来获准的远端接入任务停止主服务属于独立更新，不把此快照当作重启后的在线状态。
      - [x] \[IMPORT-11-browser-local-code] 已实现本机回调与服务端交换、现有账号导入/重新授权、浏览器等待弹窗及取消结果；未修改或重启主服务。15 项新回归通过，涵盖 PKCE、一次性回调、拒绝/过期、取消竞争、身份保留、凭据隔离、CORS/Host/配置来源；不作为真实 GitHub 同意的验收。
      - [x] \[IMPORT-11-browser-local-csp] 修正网页安全策略漏放行本机授权 API 的接入错误：只允许固定 `http://127.0.0.1:4174/api/`，保留其他来源限制；不重启主服务或授权服务，不清空已连接账号。应用注册、密钥和回调是开发者一次性配置，普通用户仅进行自己的登录/同意，不各自注册应用。
        - [x] \[IMPORT-11-browser-local-csp-test] 新增实际客户端 HTML 策略回归，旧策略确实失败、补丁后通过；全套 153/153（含其他并行任务的回归）、strict、4/4 静态包装、生产构建通过。构建、当前 HTTP 页面和浏览器 DOM 均包含精确放行，实际点击进入等待授权并成功取消，无浏览器 error/warn；原实例和 1 个 Gitea 账号 / 20 仓库 / 0 关联保留。未在受控标签中确认 GitHub 官方同意页，未执行同意或导入，不能将本项标记为完整 OAuth 验收。
      - [x] \[IMPORT-11-browser-network] 授权辅助服务和桌面账号请求已实现 Chromium 网络栈，自动遵循系统代理/PAC/直连，不硬编码 VPN 地址，不修改用户的系统网络规则；受保护的本机账号桥接强制直连。保留超时、取消、TLS 校验、固定端点与凭据隔离。仅重启获准的辅助服务，4173 原实例与 1 个 Gitea 账号 / 20 仓库 / 0 关联保持；桌面源码编译通过，安装包未更新，保留的 Node 仓库 API 未替换网络。
        - [x] \[IMPORT-11-browser-network-test] 实际 Electron 运行时通过受控直连、代理、PAC、代理故障、请求/正文超时、取消、Cookie 隔离、重定向及 TLS 拒绝；默认 session 与辅助服务同形隔离 session 的 GitHub 公共端点 GET 均自动走当前系统代理（授权端点404/API200），只证明网络可达。并发远端接入变更前，全套169/169、strict、4/4静态包装、生产构建与 Electron main/preload 编译通过；没有关闭 VPN。这些隔离/公共端点测试不代替真实授权，用户最终流程另见 IMPORT-11-browser-return。
      - [x] \[IMPORT-11-browser-progress] 有效回调已实现先立即显示进度，再执行授权交换及账号导入；完成请求自动关闭，浏览器不允许关闭时保留结果与返回动作，失败显示明确提示。无效/重复/拒绝回调仍受原验证约束，页面及时清理授权参数，不回显密钥、令牌或授权码。
        - [x] \[IMPORT-11-browser-progress-test] 定向回归先证明旧实现4项失败，修复后全部通过；实际 HTTP 流验证远端请求未结束时已有进度 HTML，以及最终成功/失败、验证前置与 nonce。原取消竞争回归保持。隔离浏览器中已看到进度与无参数回调 URL 并保存截图；关闭旧测试服务后的错误页被工具策略拒绝，未绕过，最终状态目视与真实回调不据此标记通过。
      - [x] \[IMPORT-11-browser-return] 辅助服务重启后已由用户自行重新输入配置，configured=true。从真实应用按钮发起新的授权，GitHub 最终 Continue/同意由用户完成，用户确认「现在可以了」。服务读回 2 个账号（GitHub1/Gitea1）、58 仓库（GitHub38/Gitea20）、0关联，原主服务实例保持；真实页面已离开授权弹窗并出现 GitHub 仓库侧栏。此项验收本机回调/账号及仓库目录导入，不包含生产授权、全部私有/组织安装范围、桌面包更新或仓库内容接口接入。
      - [ ] \[IMPORT-11-browser-live] 2026-10-07 用户已重新配置并完成真实 GitHub 同意，本机返回和账号/仓库目录导入已通过，成功快照为 GitHub1/Gitea1账号、38+20仓库。完整私有/组织安装范围、生产安全授权服务与已暴露密钥的轮换仍未完成；用户选择暂不轮换，本轮不代填、更换或重放凭据。主服务随后在另一项已获准的远端接入任务中停止，成功快照不是其重启后的当前状态。
    - [ ] \[IMPORT-11-secret] 应用客户端密钥通过本机开发配置页直接输入，并由本机系统安全存储加密持久保存、重启恢复；这取代之前仅留在内存的开发实现。密钥不进入聊天、日志、源码、浏览器存储或安装包，系统加密不可用时不明文降级。已出现在聊天中的密钥必须先撤销并重新生成；配置是开发者的一次性工作，不作为每个用户的登录步骤。
      - [x] \[IMPORT-11-secret-persistence] 按用户 2026-10-07「？？那这么做呀」实现独立开发授权配置的系统加密持久化；稳定存储路径与临时构建、Chromium 会话和桌面账号存储分开。保存成功后才启用新配置，失败保留旧配置和输入；启动解密或身份校验失败不得覆盖原文件。旧进程的内存密钥无安全迁移接口，需要用户首次在新版密码字段直接输入，不由 agent 提取、代填或重放。
        - [x] \[IMPORT-11-secret-persistence-test] 真实 Electron 系统加密及两个不同临时启动目录的跨进程恢复通过；密文无明文、文件0600/目录0700、加密不可用拒绝、写入失败和坏配置/错Client ID保留通过。隔离测试只用虚构密钥，strict、全套186/186、4/4静态包装、生产构建及差异检查通过。
        - [x] \[IMPORT-11-secret-persistence-live] 2026-10-07本次恢复发现用户已在稳定路径安全保存配置；助手跨临时启动目录及统一入口退出/重启后均自动读回configured=true，未再填写配置。只核对密文文件元信息，0600/115bytes及02:29保存时间未变，没有输出/重放秘密、覆盖文件或宣称已轮换。此项验收实际配置读回，不替代新一次GitHub同意、密钥有效性或账号导入；原生包与生产授权未更新。
      - [x] \[IMPORT-11-browser-rebind] 每次新网页授权读取当前主服务实例并固定在该授权会话中；主服务重启后新授权无需重启辅助服务，旧回调仍不能自动导入新的账号会话。仅更新和重启本轮获准的 4174，不重启或清空 4173，不迁移用户账号或扩展到生产授权/桌面包发布。
        - [x] \[IMPORT-11-browser-rebind-test] 真实受保护 HTTP 回归覆盖新授权接入重启后的主实例、旧回调拒绝、并行会话、身份查询期间重启与配置保存竞争，以及原 state/PKCE、取消和凭据隔离。当前主预览PID23078/实例/0账号0仓库0关联保持，4174新助手PID31840、受保护status HTTP200；尚未在新助手完成真实密钥输入和GitHub同意。
      - [x] \[IMPORT-11-ready] 用户授权自动处理本项目变更所必需的本地预览、账号服务和授权助手重启/恢复，已记录父子AGENTS。0.7.1默认开发入口共同启动所需服务，已有安全保存的GitHub应用配置自动恢复；检查页面、API版本/实例、助手版本/公开应用身份及配置状态，未知端口占用或助手故障明确失败。普通用户只进行账号登录/同意，不重复注册GitHub App、填写Client ID/密钥/回调，不自动代替同意或从聊天重放凭据。
        - [x] \[IMPORT-11-ready-test] 8项新增回归涵盖健康复用、冷启动等待、缺失/超时/异版本/身份不符、启动失败与只清理自己进程；实际默认/兼容入口启动、协调退出后的端口释放、重新启动及真实加密配置恢复通过。最终主服务/助手均0.7.1，实例67f981c1-0557-4a4d-9968-d59000dc6002，0账号/0仓库/0关联，助手configured=true；设置已恢复Taobe名称、授权按钮可用且无error/warn。没有建立系统自启动、更新原生包、发布或Git写入；新的账号同意/导入另列。
      - [ ] \[IMPORT-11-callback-document] 用户恢复后再次报告内置授权弹窗回调黑屏。将回调页由长响应改为立即结束的完整HTML文档，后台仍只交换一次；页面通过同源受保护接口仅查询待处理/完成/安全失败，不返回凭据或账号目录，不把展示修复当作本次真实授权成功。保留一次性state、PKCE、取消/过期、固定本机来源、实例绑定和错误重试；没有证据前不归因VPN，不取消用户进行中的授权来做测试。
        - [x] \[IMPORT-11-callback-document-test] 完整HTTP响应在交换悬停时已结束；新增3项回归和改写旧流式断言，验证结果最小化、来源/专用头/方法/Host、取消/拒绝/重复/过期及有限诊断，观察器失败不影响结果。隔离内置浏览器标签中readyState=complete而授权仍pending，URL参数已清理，随后实际显示成功及明确失败；不代称原生popup验收。严格类型检查、最终270/270回归、构建、4/4静态包装与差异检查通过。新版助手已重启/恢复，实际无参数错误页显示正确并产生received/rejected阶段日志，不含网址/参数/身份。
        - [ ] \[IMPORT-11-callback-document-live] 0.7.1恢复后的真实回调已观察到received/accepted/complete，主服务1个GitHub账号/38仓库/0关联及用户页面均已读回；原生popup等待展示仍无直接控制证据，不能断言黑屏根因。0.7.2等待反馈更新后已自动重启，正常账号重连和新弹窗展示仍由用户完成核对。
        - [x] \[IMPORT-11-callback-feedback] 回调等待页增加轻量等待动画、真实服务阶段、已等待时间及较慢提示，区分交换授权、核对身份、导入账号/仓库与完成/失败；阶段不由计时假装推进，不使用虚假百分比。完成或失败停止动画与计时；遵循减少动态效果，保留返回动作和安全错误，不暴露凭据或目录。隔离验证后自动恢复所需本机服务，不代替用户同意，也不把展示验证当真实导入。
          - [x] \[IMPORT-11-callback-feedback-test] 新增5项生产脚本受控时钟/合成DOM回归和1项实际连接器阶段回归；完整HTTP及时结束、最小DTO、来源/nonce/state/PKCE/取消边界保持。隔离内置浏览器验证阶段、15秒慢提示、成功/失败/状态中断停止动画、亮暗色、减少动态效果及390px无横向溢出；保存等待和结果截图并清理测试服务/标签。strict、276/276、4/4静态包装、构建和差异检查通过。统一入口与真实加密App配置自动恢复，4173/4174均0.7.2，实例b505de5b-a076-4e86-bd1f-41a227135f3e，0账号/0仓库/0关联，configured=true；已恢复Taobe名称和可用授权按钮，没有重填密钥。
          - [ ] \[IMPORT-11-callback-feedback-live] 用户正常重连账号，确认这一次实际GitHub网页回调弹窗的等待提示及最终导入；隔离动画/阶段验收不代替真实popup、账号同意、全部私有/组织范围或生产授权验收。未更新原生包、提交、推送或部署。
      - [x] \[IMPORT-11-secret-entry] 本机配置页已启动并实际打开，密码字段空白、直接输入、同源保护、轮换确认与禁止缓存已实现和检查；仅持有公开 Client ID，不使用聊天中的密钥。
      - [ ] \[IMPORT-11-secret-rotation] 用户在 GitHub 撤销已暴露的密钥、生成替代密钥，并直接在本机配置页完成输入和提交；本轮未代为生成或保存凭据。#blocked
  - [ ] \[IMPORT-11-test] 回归授权协议、节流、重复请求、取消竞争、过期/拒绝/权限失败、凭据隔离和链接白名单；浏览器正常返回需要自有 GitHub App 的 Client ID、服务端密钥、已注册回调及本人同意与仓库安装范围，原生历史设备码入口另需启用设备授权。缺少时明确阻塞，不伪造成功。
    - [x] strict、42/42测试、4/4静态包装、生产构建、Electron bridge 编译与差异检查通过。等待/取消/弹窗拒绝是组件/服务单元回归，不是浏览器点击或真实 OAuth。
    - [x] 正常网页流程新增 15 项服务/客户端回归；最终全部 148 项回归、strict、4 项静态包装和生产构建通过（含并发本地打包任务新增项）。真实浏览器确认本机配置入口，但 GitHub 页面两次受支持读取超时，未保存实际 Callback URL，不绕过浏览器控制或权限边界。
    - [ ] 自有 GitHub App 已注册并确认公开 Client ID；本轮提供的客户端密钥已暴露，需撤销并在本机直接输入替代密钥。真实回调配置、GitHub 网页同意/安装范围、原生网页打开和实际加密保存仍待验收。浏览器安全拒绝保持，不绕过。#blocked
- [ ] \[IMPORT-07] strict 类型检查、只读服务/账号隔离/分页/异常/本地关联测试、生产构建与服务测试通过；实际启动浏览器和桌面并检查上述流程。测试凭据与临时仓库不视为用户真实账号验收。
  - [x] \[IMPORT-07-package] 按用户「如果是浏览器版本问题，打个本地包给我」交付可独立启动的 macOS Apple Silicon `.app` 与 ZIP。内置页面和桌面账号服务，不依赖 Vite/4173；本地配置调用系统文件夹选择器。保留隔离、有限 IPC 和系统加密存储，不复制浏览器账号或把开发配置、密钥与测试数据装进包。
    - [ ] \[IMPORT-07-package-test] 静态/包检查与原生桥实测已通过，最新完整快照的再次启动复核等待 Mac 解锁。
      - [x] 新增 4 项来源/主 frame IPC/allowlist 回归，更新旧授权安全断言；strict（含脚本）、149/149 测试、4/4 静态包装、独立生产构建、签名检查、ZIP 完整性和源码/ZIP SHA-256 核对通过。两轮0.4.0 arm64原生包已实际加载 file 页面、设置/服务版本一致、nativeGlass=true；通过实际 preload/IPC 打开系统窗口，取消返回null，选择本任务目录返回精确路径。账号为空、未保存关联；无开发配置/凭据/用户数据入包，仅ad-hoc签名、未公证。不是远端内容、GitHub网页授权或真实账号/钥匙串/关联验收。
      - [ ] 最终重打包包含最新设置宽度和文件树胶囊修正，源码校验与当前输入一致，main/preload与原生实测包字节相同；再次打开遇到Mac锁屏，未绕过或声称新包已启动。已请求用户解锁，最终原生启动待复核。
  - [x] strict、22 项测试（11 项新服务 + 11 项历史契约）、4 项静态包装、生产构建与差异检查通过。
  - [x] 浏览器真实点击验证账号/分页/多账号/错误与重试/本地弹窗/侧栏/只读文件与 Diff/筛选/外观/键盘/窄窗口；临时账号、目录与服务已清理。
  - [x] 桌面版已重启并报告 native glass 和 renderer bridge 就绪。
  - [ ] 系统锁屏，最新桌面目视、系统目录选择器及真实凭据加密保存/重启仍待手动验收。真实用户授权范围未验证。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。


## 拆分关联

本次从同一旧迁移 Issue 按独立交付目标整理；同一目标的实现、依赖与验收子项保留在一起。

- [统一Electron与GitHub网页授权入口并完善等待与重试流程](issue_%E7%BB%9F%E4%B8%80Electron%E4%B8%8EGitHub%E7%BD%91%E9%A1%B5%E6%8E%88%E6%9D%83%E5%85%A5%E5%8F%A3%E5%B9%B6%E5%AE%8C%E5%96%84%E7%AD%89%E5%BE%85%E4%B8%8E%E9%87%8D%E8%AF%95%E6%B5%81%E7%A8%8B.md)
- [建立独立账号设置页并精简说明与版本号布局](issue_%E5%BB%BA%E7%AB%8B%E7%8B%AC%E7%AB%8B%E8%B4%A6%E5%8F%B7%E8%AE%BE%E7%BD%AE%E9%A1%B5%E5%B9%B6%E7%B2%BE%E7%AE%80%E8%AF%B4%E6%98%8E%E4%B8%8E%E7%89%88%E6%9C%AC%E5%8F%B7%E5%B8%83%E5%B1%80.md)
- [安全保存账号凭据并避免暴露给渲染进程与localStorage](issue_%E5%AE%89%E5%85%A8%E4%BF%9D%E5%AD%98%E8%B4%A6%E5%8F%B7%E5%87%AD%E6%8D%AE%E5%B9%B6%E9%81%BF%E5%85%8D%E6%9A%B4%E9%9C%B2%E7%BB%99%E6%B8%B2%E6%9F%93%E8%BF%9B%E7%A8%8B%E4%B8%8ElocalStorage.md)
- [读取账号全部可访问仓库并立即显示在侧栏](issue_%E8%AF%BB%E5%8F%96%E8%B4%A6%E5%8F%B7%E5%85%A8%E9%83%A8%E5%8F%AF%E8%AE%BF%E9%97%AE%E4%BB%93%E5%BA%93%E5%B9%B6%E7%AB%8B%E5%8D%B3%E6%98%BE%E7%A4%BA%E5%9C%A8%E4%BE%A7%E6%A0%8F.md)
- [在Dashboard关联验证并管理已有本地仓库目录](issue_%E5%9C%A8Dashboard%E5%85%B3%E8%81%94%E9%AA%8C%E8%AF%81%E5%B9%B6%E7%AE%A1%E7%90%86%E5%B7%B2%E6%9C%89%E6%9C%AC%E5%9C%B0%E4%BB%93%E5%BA%93%E7%9B%AE%E5%BD%95.md)
- [移除添加仓库与演示场景的旧入口和模拟运行逻辑](issue_%E7%A7%BB%E9%99%A4%E6%B7%BB%E5%8A%A0%E4%BB%93%E5%BA%93%E4%B8%8E%E6%BC%94%E7%A4%BA%E5%9C%BA%E6%99%AF%E7%9A%84%E6%97%A7%E5%85%A5%E5%8F%A3%E5%92%8C%E6%A8%A1%E6%8B%9F%E8%BF%90%E8%A1%8C%E9%80%BB%E8%BE%91.md)
- [区分本地连接与第三方认证失败并支持保留输入重连](issue_%E5%8C%BA%E5%88%86%E6%9C%AC%E5%9C%B0%E8%BF%9E%E6%8E%A5%E4%B8%8E%E7%AC%AC%E4%B8%89%E6%96%B9%E8%AE%A4%E8%AF%81%E5%A4%B1%E8%B4%A5%E5%B9%B6%E6%94%AF%E6%8C%81%E4%BF%9D%E7%95%99%E8%BE%93%E5%85%A5%E9%87%8D%E8%BF%9E.md)
- [按用户标注调整Dashboard仓库行与搜索筛选布局](issue_%E6%8C%89%E7%94%A8%E6%88%B7%E6%A0%87%E6%B3%A8%E8%B0%83%E6%95%B4Dashboard%E4%BB%93%E5%BA%93%E8%A1%8C%E4%B8%8E%E6%90%9C%E7%B4%A2%E7%AD%9B%E9%80%89%E5%B8%83%E5%B1%80.md)
- [通过心跳前台恢复与联网事件更新真实仓库状态](issue_%E9%80%9A%E8%BF%87%E5%BF%83%E8%B7%B3%E5%89%8D%E5%8F%B0%E6%81%A2%E5%A4%8D%E4%B8%8E%E8%81%94%E7%BD%91%E4%BA%8B%E4%BB%B6%E6%9B%B4%E6%96%B0%E7%9C%9F%E5%AE%9E%E4%BB%93%E5%BA%93%E7%8A%B6%E6%80%81.md)
- [按组织本地状态类型与可见性筛选仓库](issue_%E6%8C%89%E7%BB%84%E7%BB%87%E6%9C%AC%E5%9C%B0%E7%8A%B6%E6%80%81%E7%B1%BB%E5%9E%8B%E4%B8%8E%E5%8F%AF%E8%A7%81%E6%80%A7%E7%AD%9B%E9%80%89%E4%BB%93%E5%BA%93.md)
- [为Dashboard制作JetBrains Ring UI试用外观](issue_%E4%B8%BADashboard%E5%88%B6%E4%BD%9CJetBrains%20Ring%20UI%E8%AF%95%E7%94%A8%E5%A4%96%E8%A7%82.md)

## Comments

### 2026-10-23 17:44:33 UTC — Agent（文档迁移）

按原有功能 / 工作目标标题拆分需求，保留原 ID、勾选、依赖、最新补充及来源。没有稳定根 ID或旧 ID 在不同上下文重用时，采用由来源路径和标题确定的迁移 Issue ID，原 ID 仍在正文保留。完整旧内容可从来源版本读取；独有未提交内容的版本化副本见迁移映射。

### 2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_统一Electron与GitHub网页授权入口并完善等待与重试流程.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
