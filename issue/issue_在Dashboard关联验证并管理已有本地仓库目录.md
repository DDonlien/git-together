# 在Dashboard关联验证并管理已有本地仓库目录

- ID：`IMPORT-04`。
- 原聚合 ID：`IMPORT-native-browser`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：任务清单 / Phase - v0.1.0 - 独立 TypeScript 客户端 / codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 拆分前原稳定 ID：`IMPORT-native-browser`, `IMPORT-native-browser-live`, `IMPORT-01`, `IMPORT-02`, `IMPORT-02-repository-authentication`, `IMPORT-02-repository-access`, `IMPORT-02-git-auth-lifecycle`, `IMPORT-02-git-auth-lifecycle-source`, `IMPORT-02-git-native-remote`, `IMPORT-02-git-auth-lifecycle-runtime`, `IMPORT-02-edit`, `IMPORT-02-edit-remove`, `IMPORT-02-edit-remove-test`, `IMPORT-02-edit-test`, `IMPORT-03`, `IMPORT-04`, `IMPORT-04-worktrees`, `IMPORT-04-directory-display`, `IMPORT-04-directory-display-test`, `IMPORT-04-worktrees-test`, `IMPORT-04-account-batch`, `IMPORT-04-account-batch-feedback`, `IMPORT-04-account-batch-performance`, `IMPORT-04-account-batch-test`, `IMPORT-04-inline`, `IMPORT-04-path-hover`, `IMPORT-04-association-refresh`, `IMPORT-04-open-folder`, `IMPORT-04-discovery-boundary`, `IMPORT-04-discovery-boundary-release`, `IMPORT-04-picker`, `IMPORT-04-picker-test`, `IMPORT-05`, `IMPORT-06`, `IMPORT-08`, `IMPORT-08-test`, `IMPORT-09`, `IMPORT-09-test`, `IMPORT-10`, `IMPORT-10-test`, `IMPORT-11`, `IMPORT-11-token-refresh`, `IMPORT-11-windows-oauth-port`, `IMPORT-11-connect`, `IMPORT-11-browser`, `IMPORT-11-native-keychain`, `IMPORT-11-native-keychain-test`, `IMPORT-11-native-keychain-live`, `IMPORT-11-browser-local`, `IMPORT-11-browser-local-code`, `IMPORT-11-browser-local-csp`, `IMPORT-11-browser-local-csp-test`, `IMPORT-11-browser-network`, `IMPORT-11-browser-network-test`, `IMPORT-11-browser-progress`, `IMPORT-11-browser-progress-test`, `IMPORT-11-browser-return`, `IMPORT-11-browser-live`, `IMPORT-11-secret`, `IMPORT-11-secret-persistence`, `IMPORT-11-secret-persistence-test`, `IMPORT-11-secret-persistence-live`, `IMPORT-11-browser-rebind`, `IMPORT-11-browser-rebind-test`, `IMPORT-11-ready`, `IMPORT-11-ready-test`, `IMPORT-11-callback-document`, `IMPORT-11-callback-document-test`, `IMPORT-11-callback-document-live`, `IMPORT-11-callback-feedback`, `IMPORT-11-callback-feedback-test`, `IMPORT-11-callback-feedback-live`, `IMPORT-11-secret-entry`, `IMPORT-11-secret-rotation`, `IMPORT-11-test`, `IMPORT-12`, `IMPORT-12-branch-behavior`, `IMPORT-12-branch-behavior-gitea`, `IMPORT-12-branch-behavior-created`, `IMPORT-12-branch-behavior-import`, `IMPORT-12-branch-behavior-import-test`, `IMPORT-12-branch-behavior-account`, `IMPORT-12-branch-behavior-account-test`, `IMPORT-12-update-settings`, `IMPORT-12-test`, `IMPORT-13`, `IMPORT-13-repository-pin`, `IMPORT-13-status-header`, `IMPORT-13-branches`, `IMPORT-13-branches-test`, `IMPORT-13-branches-folder`, `IMPORT-13-branches-folder-test`, `IMPORT-13-branches-motion`, `IMPORT-13-main`, `IMPORT-13-test`, `IMPORT-13-owner`, `IMPORT-13-owner-test`, `IMPORT-14`, `IMPORT-14-last-divider`, `IMPORT-14-last-divider-test`, `IMPORT-14-grouped-actions`, `IMPORT-14-header-alignment`, `IMPORT-14-header-alignment-runtime`, `IMPORT-14-header-count-corner`, `IMPORT-14-production-submit`, `IMPORT-14-production-submit-runtime`, `IMPORT-14-push-lfs-errors`, `IMPORT-14-submit-popup`, `IMPORT-14-submit-summary-only`, `IMPORT-14-submit-popup-width`, `IMPORT-14-windows-lfs-commit`, `IMPORT-14-commit-timeout-headless`, `IMPORT-14-submit-popup-production`, `IMPORT-14-submit-popup-h5`, `IMPORT-14-submit-ai`, `IMPORT-14-header-text`, `IMPORT-14-download-icon`, `IMPORT-14-grouped-icons`, `IMPORT-14-grouped-refinement`, `IMPORT-14-grouped-h5`, `IMPORT-14-branch-name-alignment`, `UI-04-repository-reveal`, `IMPORT-14-inline`, `IMPORT-14-number-ignore`, `IMPORT-14-read-badges`, `IMPORT-14-read-health-scope`, `IMPORT-14-read-badges-test`, `IMPORT-14-read-failure-live`, `IMPORT-14-check-cycle`, `IMPORT-14-change-trigger`, `IMPORT-14-zero-badges`, `IMPORT-14-diagnostics`, `IMPORT-14-performance`, `IMPORT-14-performance-source`, `IMPORT-14-performance-runtime`, `IMPORT-14-diagnostics-copy`, `IMPORT-14-diagnostics-test`, `IMPORT-14-operation-semantics`, `IMPORT-14-branch-download`, `IMPORT-14-branch-download-layout`, `IMPORT-14-branch-download-layout-test`, `IMPORT-14-operation-semantics-test`, `IMPORT-14-visible`, `IMPORT-14-hide`, `IMPORT-14-hide-counts`, `IMPORT-14-hide-header-count`, `IMPORT-14-operation-execution`, `IMPORT-14-operation-collapse`, `IMPORT-14-operation-collapse-icons`, `IMPORT-14-feedback`, `IMPORT-14-action-names`, `IMPORT-14-action-names-test`, `IMPORT-14-feedback-test`, `IMPORT-14-number-ignore-test`, `IMPORT-14-test`, `IMPORT-15`, `IMPORT-15-test`, `IMPORT-16`, `IMPORT-16-provider-budget`, `IMPORT-16-provider-budget-diagnosis`, `IMPORT-16-provider-budget-validation`, `IMPORT-16-test`, `IMPORT-17`, `IMPORT-17-completeness`, `IMPORT-17-completeness-test`, `IMPORT-17-completeness-live`, `IMPORT-17-consistency`, `IMPORT-17-metadata`, `IMPORT-17-test`, `IMPORT-17-visibility`, `IMPORT-17-visibility-test`, `IMPORT-17-live`, `IMPORT-18`, `IMPORT-18-shell`, `IMPORT-18-shell-test`, `IMPORT-18-test`, `IMPORT-18-revert`, `IMPORT-18-revert-test`, `IMPORT-07`, `IMPORT-07-package`, `IMPORT-07-package-test`；不改写或重编号这些既有 ID。
- 拆分前标题：codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 原稳定 ID：`x`、`IMPORT-04`、`IMPORT-04-worktrees`、`IMPORT-04-directory-display`、`IMPORT-04-directory-display-test`、`IMPORT-04-worktrees-test`、`IMPORT-04-account-batch`、`IMPORT-04-account-batch-feedback`、`IMPORT-04-account-batch-performance`、`IMPORT-04-account-batch-test`、`IMPORT-04-inline`、`IMPORT-04-path-hover`、`IMPORT-04-association-refresh`、`IMPORT-04-open-folder`、`IMPORT-04-discovery-boundary`、`IMPORT-04-discovery-boundary-release`、`IMPORT-04-picker`、`IMPORT-04-picker-test`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围
- [x] \[IMPORT-04] Dashboard 逐仓库通过 popup 关联已有本地目录，验证 Git 仓库与远端身份；可修改/移除关联，移除仅解除应用关联，不删除目录或文件。
  - [x] \[IMPORT-04-worktrees] 仓库保留本地目录入口及尚未关联、部分关联、完全关联三态；每个真实分支单独显示和配置自己的worktree目录。选择父目录时，有界扫描实际子仓库及Git worktree，按已保存远端身份与真实分支匹配，批量原子关联；不凭文件夹名猜测、不穿越符号链接、不创建/切换/删除Git目录。兼容既有单目录记录与加密存储，读取所有已关联工作目录，失败/缺失明确呈现，不以远端分支或fixture冒充已关联。0.10.0已实现生产服务与UI接入；系统选择器和真实用户目录验收另列。
    - [x] \[IMPORT-04-directory-display] 仓库行根据本仓库已识别的真实工作目录显示路径：默认FOLDER/project-name/project-name_branch-name结构显示project-name容器，即使只有一个工作目录也保留两层显示；单个非默认结构显示工作目录自身；多个工作目录分散在混有其他仓库的目录下时显示这些工作目录的最小公共父目录。分支始终显示真实工作目录，显示范围不受搜索或隐藏分支影响；保留原选择范围和关联记录，不移动已有目录。0.32.1合并源码实现并通过隔离验证，已推送main；本次未更新安装版。
      - [x] \[IMPORT-04-directory-display-test] 20项相关客户端回归通过，覆盖Windows/macOS默认结构、单目录、重复路径、多个容器下的公共父目录、不同驱动器/UNC share无公共父目录、旧单目录记录和健康提示优先级。生产Dashboard隔离页面确认clash-config显示自身、默认结构显示项目层、mixed显示公共父目录；键盘搜索worktree-3后仅余该工作目录，仓库仍显示D:\FOLDER。分支和提示显示真实路径，原关联输入未改；合成账号页面不替代用户目录或安装版验收。
    - [ ] \[IMPORT-04-worktrees-test] 真实临时Git、父目录/linked worktree/多个clone、外部符号链接、错误远端、限额、取消/保存失败、旧记录恢复、分支变化、逐分支解除和HTTP/IPC边界回归；生产App验证分支目录、三态及本地树/Diff，核对HEAD/index不变。主预览与原生系统选择器/用户目录分别验收。
      - [x] 346/346回归、类型检查、4/4静态包装和构建通过。真实临时Git覆盖两个provider、父目录批量发现、独立Diff、多个clone/嵌套worktree、错误远端、符号链接、8层限制、取消、保存失败、v2恢复、分支改名和逐分支解除；应用未改HEAD/index。隔离生产App实测目录保存、完全关联→部分关联、其他本地树/Diff保留、收起行继续检查及实际落后黄色灯；用户4173/4174服务0.10.0健康，加密应用配置恢复，未修改用户账号或目录。
      - [ ] 桌面配置弹窗中的真实系统选择、父目录回填及用户仓库关联仍待验收；本轮没有重新打包/安装，不将浏览器fixture和原生桥调用契约当作桌面操作通过。
  - [x] \[IMPORT-04-account-batch] Dashboard 仓库数量可点击。点击后选择一个本地父文件夹，服务按当前账号筛选中的每个账号批量检查其全部可访问仓库，并按真实 Git 远端匹配关联；搜索、组织、仓库类型和可见性筛选不缩小匹配范围。扫描有界且不穿越符号链接；无匹配或部分账号失败时明确反馈，未匹配仓库和既有关联保留，不修改用户 Git 状态。
    - [x] \[IMPORT-04-account-batch-feedback] 批量匹配结束后的成功、未命中和失败结果提示在 6 秒后自动消失；账号读取错误和分类不完整提示仍由各自状态管理。
    - [x] \[IMPORT-04-account-batch-performance] 针对 Windows 批量匹配缓慢，在独立无界面实例中重复执行并持续监控请求、CPU、Git 子进程和后台轮询，确认可复现的阻塞点；保护安装版账号数据和用户 Git 状态，区分后台耗时、桌面返回延迟与尚未验证的推断。2026-10-13固定2账号/56仓库的元数据，在相同轮询、关闭Git详细追踪的两组重复对照中，确认Windows Job::attach每次启动Git都会遍历全系统线程；隔离副本省去该枚举后，并发匹配平均53.698秒降至6.474秒，8次匹配结果一致。正式源码及安装版尚未应用实验改动，原安装版IPC返回延迟未进行GUI对照验收。
    - [ ] \[IMPORT-04-account-batch-test] 验证一个账号多个仓库、同一父目录多个 clone/worktree、无匹配、部分账号失败、账号筛选为空及扫描限额；确认搜索等非账号筛选不缩小匹配范围、失败不覆盖既有关联、Git HEAD/index 不变，且匹配结果提示 6 秒后消失而账号读取错误及分类提示不会因此消失。
  - [x] \[IMPORT-04-inline] 本地目录栏的「尚未关联」文字本身是关联入口，点击直接打开原来的关联流程，不额外放置独立关联按钮。已关联时点击目录文字可以修改关联，保留键盘操作与权限限制；行尾仓库操作菜单仍按 IMPORT-14 保留。两项文字入口回归及实际点击/Enter 打开、Escape 关闭与焦点恢复检查通过；未保存用户目录关联。
    - [x] \[IMPORT-04-path-hover] 分支工作目录入口悬停仅显示当前可见路径的完整名称，不把其他关联工作目录堆成多行提示；保留多目录数量、全部真实关联、点击配置、键盘和无关联说明。 0.31.4隔离生产界面、类型/Cargo/构建通过；main源码038acaae及三平台正式更新已发布，公证、更新签名与公共资产完整性核验通过，未操作安装版。
  - [x] \[IMPORT-04-association-refresh] 已保存本地目录的仓库在刷新、检查失败或当前分支被隐藏时，不显示为「尚未关联」。关联标签保留同一服务器/仓库/目录映射和用户筛选设置下的最后成功验证结果；首次检查显示待确认，实际保存或解除关联、修改目录及用户隐藏设置立即失效旧结果。刷新和错误继续由现有读取角标/呼吸效果独立表达；新检查成功后更新完全/部分覆盖结果，隐藏分支不重新计入统计或操作范围。0.32.2源码、类型和前端构建检查完成；未新增或运行测试，安装版刷新交互尚未验收。
  - [x] \[IMPORT-04-open-folder] 在配置本地仓库和关联工作目录弹窗的路径右侧增加「打开本地文件夹」按钮，用系统默认文件管理器打开当前显示的目录，包括刚选择但尚未保存关联的目录。未选择目录时禁用，打开中防止重复操作；失败在原弹窗显示且保留路径，不修改关联或执行Git操作。隔离类型/Cargo/构建通过，4193生产弹窗实际观察空路径禁用、长路径与独立按钮；点击后Rust系统open成功，弹窗和路径保持。未新增或运行测试，安装包不在本轮发布。
  - [x] \[IMPORT-04-discovery-boundary] 按用户Projects/平台/仓库/worktree结构修复本地匹配：先检查.git目录或文件，识别后不枚举项目内容；最多向下搜索6层，超层只裁剪该支路而不丢弃其他已找到仓库。安全预算只计需要继续展开的父目录，避免worktree内部文件夹触发4000上限；已核对的登记worktree不重复扫描。保持真实remote/分支核对、符号链接边界、取消与关联原子保存。临时真实Git取样及Windows x86/x64原生构建验证通过，含4100个仓库内部目录、无关十层目录、6/7层边界、保留HEAD/index和取消不保存；源码d482887edb已推送main。未将临时取样当成用户实际目录验收。
    - [x] \[IMPORT-04-discovery-boundary-release] 将0.29.3目录发现修正纳入正式更新。0.29.3当时候选的Windows两种架构原生构建成功，macOS候选包Developer ID签名完成；Apple公证因既有gittogether-notary profile读取返回69、No Keychain password item found受阻。尚无本版本Accepted公证及完整公共更新源验收，不操作已安装应用或绕过系统安全设置。 该来源修正已包含在0.31.3/main 1052f9b并正式发布；Mac Accepted/staple、Windows两架构38496188196及三平台公共源/完整下载核验通过，保留0.29.3当时受阻记录。
  - [ ] \[IMPORT-04-picker] 按三处浏览器标注移除关联说明与绝对路径帮助文案，将手动路径输入改成可点击的文件夹选择入口，打开系统文件夹选择窗口并回填所选目录；取消选择保留原目录，选择后仍通过原流程验证和保存，保留解除关联与错误提示。桌面复用原生选择器；浏览器本机接口接入需先确认是否允许重启当前内存账号服务，不擅自清空已登录账号。
    - [x] 弹窗局部改动及桌面原生调用已实现；实际浏览器确认两段说明消失、路径不可编辑、Enter 激活、错误按需显示、未选目录禁止保存、Escape 与焦点恢复。当前会话 1/20/0 保留。
    - [ ] 浏览器本机系统选择器接口待用户批准接入；桌面真实窗口打开、取消与精确目录返回已在 IMPORT-07-package-test 验证，账号配置弹窗回填和真实关联仍待验收，不将原生桥测试当成真实仓库关联完成。
    - [ ] \[IMPORT-04-picker-test] 回归选择成功/取消/失败、已有路径与不可编辑入口、未选择时禁止保存、两段常驻说明消失及真实目录匹配检查；实际确认系统选择窗口与取消/回填，不将组件测试当成原生验收。
      - [x] 新增 7 项助手/组件/源码契约回归，原真实临时 Git 验证仍通过。70/70 测试、strict、4/4 静态包装与生产构建通过；系统选择窗口未作为测试验收结果。

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

原文件的共用上下文及完整既有 Comments 仅保留在[首个任务](issue_%E7%BB%9F%E4%B8%80Electron%E4%B8%8EGitHub%E7%BD%91%E9%A1%B5%E6%8E%88%E6%9D%83%E5%85%A5%E5%8F%A3%E5%B9%B6%E5%AE%8C%E5%96%84%E7%AD%89%E5%BE%85%E4%B8%8E%E9%87%8D%E8%AF%95%E6%B5%81%E7%A8%8B.md)，来源与历史没有删去。

## Comments

### 2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_在Dashboard关联验证并管理已有本地仓库目录.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
