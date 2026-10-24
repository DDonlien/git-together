# 读取账号全部可访问仓库并立即显示在侧栏

- ID：`IMPORT-03`。
- 原聚合 ID：`IMPORT-native-browser`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理：Git。
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：任务清单 / Phase - v0.1.0 - 独立 TypeScript 客户端 / codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 拆分前原稳定 ID：`IMPORT-native-browser`, `IMPORT-native-browser-live`, `IMPORT-01`, `IMPORT-02`, `IMPORT-02-repository-authentication`, `IMPORT-02-repository-access`, `IMPORT-02-git-auth-lifecycle`, `IMPORT-02-git-auth-lifecycle-source`, `IMPORT-02-git-native-remote`, `IMPORT-02-git-auth-lifecycle-runtime`, `IMPORT-02-edit`, `IMPORT-02-edit-remove`, `IMPORT-02-edit-remove-test`, `IMPORT-02-edit-test`, `IMPORT-03`, `IMPORT-04`, `IMPORT-04-worktrees`, `IMPORT-04-directory-display`, `IMPORT-04-directory-display-test`, `IMPORT-04-worktrees-test`, `IMPORT-04-account-batch`, `IMPORT-04-account-batch-feedback`, `IMPORT-04-account-batch-performance`, `IMPORT-04-account-batch-test`, `IMPORT-04-inline`, `IMPORT-04-path-hover`, `IMPORT-04-association-refresh`, `IMPORT-04-open-folder`, `IMPORT-04-discovery-boundary`, `IMPORT-04-discovery-boundary-release`, `IMPORT-04-picker`, `IMPORT-04-picker-test`, `IMPORT-05`, `IMPORT-06`, `IMPORT-08`, `IMPORT-08-test`, `IMPORT-09`, `IMPORT-09-test`, `IMPORT-10`, `IMPORT-10-test`, `IMPORT-11`, `IMPORT-11-token-refresh`, `IMPORT-11-windows-oauth-port`, `IMPORT-11-connect`, `IMPORT-11-browser`, `IMPORT-11-native-keychain`, `IMPORT-11-native-keychain-test`, `IMPORT-11-native-keychain-live`, `IMPORT-11-browser-local`, `IMPORT-11-browser-local-code`, `IMPORT-11-browser-local-csp`, `IMPORT-11-browser-local-csp-test`, `IMPORT-11-browser-network`, `IMPORT-11-browser-network-test`, `IMPORT-11-browser-progress`, `IMPORT-11-browser-progress-test`, `IMPORT-11-browser-return`, `IMPORT-11-browser-live`, `IMPORT-11-secret`, `IMPORT-11-secret-persistence`, `IMPORT-11-secret-persistence-test`, `IMPORT-11-secret-persistence-live`, `IMPORT-11-browser-rebind`, `IMPORT-11-browser-rebind-test`, `IMPORT-11-ready`, `IMPORT-11-ready-test`, `IMPORT-11-callback-document`, `IMPORT-11-callback-document-test`, `IMPORT-11-callback-document-live`, `IMPORT-11-callback-feedback`, `IMPORT-11-callback-feedback-test`, `IMPORT-11-callback-feedback-live`, `IMPORT-11-secret-entry`, `IMPORT-11-secret-rotation`, `IMPORT-11-test`, `IMPORT-12`, `IMPORT-12-branch-behavior`, `IMPORT-12-branch-behavior-gitea`, `IMPORT-12-branch-behavior-created`, `IMPORT-12-branch-behavior-import`, `IMPORT-12-branch-behavior-import-test`, `IMPORT-12-branch-behavior-account`, `IMPORT-12-branch-behavior-account-test`, `IMPORT-12-update-settings`, `IMPORT-12-test`, `IMPORT-13`, `IMPORT-13-repository-pin`, `IMPORT-13-status-header`, `IMPORT-13-branches`, `IMPORT-13-branches-test`, `IMPORT-13-branches-folder`, `IMPORT-13-branches-folder-test`, `IMPORT-13-branches-motion`, `IMPORT-13-main`, `IMPORT-13-test`, `IMPORT-13-owner`, `IMPORT-13-owner-test`, `IMPORT-14`, `IMPORT-14-last-divider`, `IMPORT-14-last-divider-test`, `IMPORT-14-grouped-actions`, `IMPORT-14-header-alignment`, `IMPORT-14-header-alignment-runtime`, `IMPORT-14-header-count-corner`, `IMPORT-14-production-submit`, `IMPORT-14-production-submit-runtime`, `IMPORT-14-push-lfs-errors`, `IMPORT-14-submit-popup`, `IMPORT-14-submit-summary-only`, `IMPORT-14-submit-popup-width`, `IMPORT-14-windows-lfs-commit`, `IMPORT-14-commit-timeout-headless`, `IMPORT-14-submit-popup-production`, `IMPORT-14-submit-popup-h5`, `IMPORT-14-submit-ai`, `IMPORT-14-header-text`, `IMPORT-14-download-icon`, `IMPORT-14-grouped-icons`, `IMPORT-14-grouped-refinement`, `IMPORT-14-grouped-h5`, `IMPORT-14-branch-name-alignment`, `UI-04-repository-reveal`, `IMPORT-14-inline`, `IMPORT-14-number-ignore`, `IMPORT-14-read-badges`, `IMPORT-14-read-health-scope`, `IMPORT-14-read-badges-test`, `IMPORT-14-read-failure-live`, `IMPORT-14-check-cycle`, `IMPORT-14-change-trigger`, `IMPORT-14-zero-badges`, `IMPORT-14-diagnostics`, `IMPORT-14-performance`, `IMPORT-14-performance-source`, `IMPORT-14-performance-runtime`, `IMPORT-14-diagnostics-copy`, `IMPORT-14-diagnostics-test`, `IMPORT-14-operation-semantics`, `IMPORT-14-branch-download`, `IMPORT-14-branch-download-layout`, `IMPORT-14-branch-download-layout-test`, `IMPORT-14-operation-semantics-test`, `IMPORT-14-visible`, `IMPORT-14-hide`, `IMPORT-14-hide-counts`, `IMPORT-14-hide-header-count`, `IMPORT-14-operation-execution`, `IMPORT-14-operation-collapse`, `IMPORT-14-operation-collapse-icons`, `IMPORT-14-feedback`, `IMPORT-14-action-names`, `IMPORT-14-action-names-test`, `IMPORT-14-feedback-test`, `IMPORT-14-number-ignore-test`, `IMPORT-14-test`, `IMPORT-15`, `IMPORT-15-test`, `IMPORT-16`, `IMPORT-16-provider-budget`, `IMPORT-16-provider-budget-diagnosis`, `IMPORT-16-provider-budget-validation`, `IMPORT-16-test`, `IMPORT-17`, `IMPORT-17-completeness`, `IMPORT-17-completeness-test`, `IMPORT-17-completeness-live`, `IMPORT-17-consistency`, `IMPORT-17-metadata`, `IMPORT-17-test`, `IMPORT-17-visibility`, `IMPORT-17-visibility-test`, `IMPORT-17-live`, `IMPORT-18`, `IMPORT-18-shell`, `IMPORT-18-shell-test`, `IMPORT-18-test`, `IMPORT-18-revert`, `IMPORT-18-revert-test`, `IMPORT-07`, `IMPORT-07-package`, `IMPORT-07-package-test`；不改写或重编号这些既有 ID。
- 拆分前标题：codex/standalone-ts: 账号与仓库导入（0.2.0–0.3.2）。
- 原稳定 ID：`x`、`IMPORT-03`、`IMPORT-13`、`IMPORT-13-repository-pin`、`IMPORT-13-status-header`、`IMPORT-13-branches`、`IMPORT-13-branches-test`、`IMPORT-13-branches-folder`、`IMPORT-13-branches-folder-test`、`IMPORT-13-branches-motion`、`IMPORT-13-main`、`IMPORT-13-test`、`IMPORT-13-owner`、`IMPORT-13-owner-test`；保留既有编号与完成状态。
- 拆分状态说明：状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。


## 当前需求与范围
- [x] \[IMPORT-03] 添加账号验证身份后读取所有令牌可访问的仓库，处理分页、加载、无仓库、认证/网络失败、重新加载；不同账号状态相互隔离。
- [x] \[IMPORT-13] 账号连接后，左侧对应账号立即列出所有已读取的仓库，数量与完整账号仓库列表一致，不要求先关联本地目录。Dashboard 用一个统一仓库表展示仓库、所属账号、默认分支、本地目录和状态，不再按账号分别显示标题卡片；账号筛选与各账号错误独立处理，手动重新加载由 IMPORT-15/16 取代。未关联目录也应读取远端分支、历史、树和已提交内容（R-05-remote）；关联目录只影响本地未提交更改与本地读取/动作，不是远端历史的前提。
  - [x] \[IMPORT-13-repository-pin] 侧边栏与Dashboard仓库条目在悬停或键盘聚焦时于右侧显示置顶按钮，点击置顶、再次点击取消；已置顶图标常显。两处使用同一份按仓库ID保存的本机偏好，重启后保留；侧边栏在所属账号内优先显示，Dashboard在当前筛选结果内优先显示，其余排序规则继续生效。按钮独立于导航、分支展开及Git动作，保留行高、Presence与键盘焦点；收起侧栏保留排序，在展开侧栏时显示按钮。 0.32.0源码、TypeScript、locked Cargo与生产构建通过，保留已有大chunk提示；已精确同步现有Web预览源码，其当前0.33.1类型检查也通过。本轮未新增或运行测试，未把源码/HTTP模块确认称为实际hover交互或安装版验收，未发布新安装包。
  - [x] \[IMPORT-13-status-header] 仓库列表最后一行不显示底部分割线，包括末仓库的分支区域未挂载或收起时。「仓库」表头与名称左边缘对齐，图标上方显示居中的「状态」表头，点击按真实仓库状态正反排序，同状态按名称稳定排序。排序复用读取异常、处理中、实际Git差异、已确认同步与未知信息，不将未读取视为已同步，不新增远端读取或Git写操作；保留原图标、Presence、表格列宽、筛选、展开与关联。0.24.0类型/Cargo检查及生产构建通过；隔离真实Dashboard组件量测两个对齐差值均为0px、末行0px/中间1px边线，正反排序、读取状态变化、实际键盘搜索及分支展开核对通过。没有新增或运行旧测试套件，当前用户后台因运行中的安装版占用4174未能恢复，未操作安装版或声称真实账号/原生验收。
  - [x] \[IMPORT-13-branches] Dashboard 移除独立的「默认分支」列，每个仓库可独立展开，展开后显示该访问账号实际读取的远端分支，一个分支一行。允许同时展开多个仓库，默认分支只作为分支行内标记；未关联本地仍可读取，加载、空分支、权限/网络失败和读取上限明确区分，不用默认名称伪造分支。保留仓库计数、搜索/筛选、工作区入口、本地目录配置、行尾菜单及账号会话；展开只读，不 checkout 或写入 Git。此条取代上方历史默认分支列规则。
    - [x] \[IMPORT-13-branches-test] 验证六列顺序、真实逐分支行、独立展开与键盘、账号/服务隔离、取消与迟到结果、空态/错误/恢复和计数不含子行。strict、325/325、4/4静态包装、生产构建及差异检查通过；新增11项回归并以两provider真实临时Git对比refs。当前GitHub会话实际读取main和两个codex分支；2合成账号的生产App完成多展开、筛选、权限错误/保留旧数据、恢复、空分支、取消和菜单/目录弹窗验证。亮暗1280×720及真实849×853窄窗已检查，窄窗内部横滚261px、根溢出0，未显示两轴滚动条。1账号/38仓库/0关联与主实例不变；隔离Git数据不作为真实Gitea授权或原生包验收，未重打包。
    - [x] \[IMPORT-13-branches-folder] 移除额外的展开箭头，让原仓库文件夹图标及其圆角底板直接成为分支展开/收起按钮。保留19px居中图标、与两行文字等高的底板、10px间距、仓库名称打开工作区及键盘/可访问展开状态，不改变分支读取、搜索、计数或账号会话。
      - [x] \[IMPORT-13-branches-folder-test] 验证每个仓库只有一个图标展开按钮，无独立箭头或装饰图标副本；鼠标和Enter/Space可展开/收起，仓库名导航仍独立，原大小与分支行、加载/错误反馈保留，完成类型、回归、构建及实际预览检查。
    - [x] \[IMPORT-13-branches-motion] 按2026-10-11截图反馈，Dashboard仓库展开与收起采用约200ms的高度和淡入淡出过渡；实际分支行与仓库行共用58px高度及上下各8px留白，保留现有名称对齐、列宽和行尾操作。收起期间禁用分支交互，结束后隐藏内容；快速反向点击可连续过渡，减少动态效果时直接切换。真实分支读取、筛选、计数和仓库级操作范围保持原样。
    - [x] \[IMPORT-13-main] 按本次明确请求，把当前独立客户端源码及已验证的文件夹展开修正推送到用户仓库origin的main。预检目标分支与历史，只做正常创建或快进，不覆盖原git-together/main、其他分支或工作区，不推送安装包、凭据或生产部署；回读远端提交确认结果。
  - [x] \[IMPORT-13-test] 验证零本地关联时仓库仍完整显示，多账号及共享仓库的归属保持独立；统一表的账号、分支和目录是同级列。实际检查当前 Gitea 会话的 20 个仓库、未关联仓库导航、筛选、账号折叠和本地配置弹窗，保留已连接会话。新增 10 项组件回归；当前真实会话与浏览器检查通过，多账号/关联隔离通过测试 fixture 验证。
  - [x] \[IMPORT-13-owner] 仓库列只显示仓库名称，不拼接组织或用户名；在仓库与账号之间新增「组织 / 用户」列，组织仓库显示组织名，个人仓库显示所属用户名。所属方从仓库完整名称读取，不用访问账号的登录名替代；保留独立账号列、完整身份提示、组织搜索和原有导航/配置行为。
    - [x] \[IMPORT-13-owner-test] 新增 3 项归属/名称/搜索隔离回归，更新七列顺序与目录入口索引；实际 strict、117/117 全套测试、4/4 静态包装、生产构建与差异检查通过。当前 1201×853 的 20 个 Gitea 仓库中，19 个组织仓库显示 FreshLi4，个人 clash-config 显示 Taobe；仓库名无前缀、账号列独立，组织搜索、个人名称导航、菜单与 Escape 正常。表宽仍 913px、58px 行高、根无水平溢出，原圆角图标与 1账号/20仓库/0关联会话保持。多账号和其他个人用户名通过 fixture 验证；未新增原生桌面验收。

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

按任务原语言改为 `issue_读取账号全部可访问仓库并立即显示在侧栏.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。
