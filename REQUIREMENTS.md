# GitTogether Requirements / Feature 清单

状态快照：2026-08-12

本文件只描述 GitTogether 想提供的用户可感知 Feature、产品边界和版本阶段，不是 Agent 的执行计划，也不是待办 Task list。实现步骤、改哪些文件、运行什么命令和临时决定记录在 `agent-log/` 或专门的工程计划中。

Feature ID 是稳定标识；Feature 被放入哪条版本线，以本文件的阶段结构为准。

## 产品定位

GitTogether 是一个基于 GitButler 的 repository-first workspace for humans and AI agents：继承 GitButler 已经做好的 Git GUI、diff、commit 和桌面应用基础，同时把产品中心改成多个 repository、真实 branch/worktree、Work Session、Agent 和 Presence。

核心对象关系是：

```text
Repository
  ↓
Workspace
  ↓
Worktree / Branch
  ↓
Work Session
  ↓
Human / Agent
  ↓
Change
```

用户自己决定任务如何组织。GitTogether 不按单个文件拆任务，也不要求用户为一次包含几千个文件的批量资产操作创建几千个 worktree；自动化围绕一次 Work Session 聚合状态、隔离修改、创建快照并判断后续合并。

## Version line - 0.0.x - GitButler fork 基线

### Phase - 0.0.0 - 继承 GitButler 客户端基础

#### F-0.0.1 GitButler fork baseline

- Feature：GitTogether 从 GitButler fork 开始，保留其成熟的桌面应用、Git 操作、GUI、diff、commit、provider integration 和跨平台基础。
- 用户价值：先得到一个能运行、能管理 Git、能查看文件变化的客户端，不重新实现 Git GUI 的基础能力。
- 当前状态：已实现。`git-together/main` 已合入本次开始时最新的 `upstream/master`，现有源码目录、Git GUI、diff、commit、provider integration 和跨平台基础保持可用；来源仓库只跟踪 `master`，后续开发继续留在 `git-together/main`。
- 边界：这一阶段不重新设计完整 Git 客户端，也不因为 agent-template 改变 `apps/`、`crates/`、`packages/` 或 `e2e/` 的历史路径。

### Phase - 0.0.1 - 建立 GitTogether 产品基线

#### F-0.0.2 GitTogether product identity

- Feature：应用名称、窗口标题、仓库身份、开发配置和后续发布配置明确使用 GitTogether，同时保留必要的 GitButler 兼容信息。
- 用户价值：用户能分辨当前运行的是 GitTogether，而不是一个没有说明的 GitButler 私有构建。
- 当前状态：已实现本地 macOS 产品基线。应用名、图标、Bundle ID、仓库地址、deep-link、CLI namespace 和配置使用 GitTogether；上游 telemetry 与 updater 默认关闭，`disable-auto-updates` 发布包不注册 updater plugin，发布配置不再引用上游 endpoint 或签名 key。本地 arm64 `0.2.5` 包使用独立身份和 ad-hoc 签名，并已完成真实窗口启动与响应验收。Apple Developer ID 签名与 notarization 属于公开发布凭证流程，不伪装为本次已完成。

## Version line - 0.1.x - 移除不需要的 GitButler 本地 Workflow

### Phase - 0.1.0 - 取消强制 Virtual Branch Workflow

#### F-0.1.1 Git Mode / ordinary branch policy

- Feature：默认使用用户熟悉的普通 Git branch、commit、merge 和 worktree；移除或关闭 GitButler 强制创建 Virtual Branch 的本地 workflow。
- 用户价值：branch 是真实存在、可以被其他 Git 工具看到的版本差异，worktree 与 GitTogether UI 保持同步。
- 产品判断：保留 GitButler 多工作区、多个 branch/worktree 并行管理的理念，因为它适合现代 Agent 开发流程；不保留 Virtual Branch 作为中间抽象，因为普通 Git branch 已经能够清晰、稳定地表达版本差异，也更容易与其他 Git 工具、脚本和 Agent 协作。
- 继续路径：以 GitButler 现有实验性 Git mode 和 `singleBranch` 基础继续改造，把它作为普通 Git branch/worktree 工作流的技术起点，而不是从零重写 GitButler 的 workspace GUI。
- 当前状态：已实现。默认设置启用普通 Git 模式与真实 worktree 操作，新首页只读取和操作真实 branch/worktree；Virtual Branch 的兼容代码仍留在来源代码中，但不再是 GitTogether 的默认入口或强制工作流。
- 边界：Virtual Branch 或 Agent Mode 可以作为可选能力保留，但不能强制所有用户改变原有 Git 心智模型。

### Phase - 0.1.1 - 简化继承的 GitButler 本地 GUI

#### F-0.1.7 Repository Workspace GUI

- Feature：在继承 GitButler 优秀 GUI 的基础上，去掉用户不需要的本地 workflow 入口和复杂度，同时保留文件、branch、worktree、diff 和 commit 的核心体验。
- 用户价值：用户仍然得到 GitButler 已经验证过的视觉和交互基础，但不会被 Butler 专属逻辑强迫改变工作方式。
- 视觉约束：新增页面直接使用 GitButler 现有的视觉风格、主题 token、布局模式和 `@gitbutler/ui` 组件；附件中的灰色线框只定义信息层级和空间关系，不定义新的颜色、字体、控件或设计系统。
- 当前状态：修正中。GitButler 原有 Workspace、Branches、Operation History、文件、diff 和 commit 界面必须继续作为默认体验；GitTogether 的试验功能只能通过侧边栏中的独立入口进入，不能再次用新 Dashboard 替换原工作区。
- 边界：侧边栏按项目级和全局级分组。项目级保留 Workspace、Branches、Operation History，并新增 Work Trees；Project Settings 在项目级区域底部对齐。全局级提供 Overview、Global Settings 和 Share Feedback。两个层级使用明确的分隔线，不把项目设置混入全局设置。
- Global Settings 边界：左栏在 General 后单列 GitButler；GitButler 账号与 access token、上游 committer credit、兼容 `but` CLI、GitButler organizations 与上游资源统一收纳在该页。General 只保留 GitTogether 自身的编辑器、终端、更新与本地项目管理设置；通用 Git、AI Provider 和 forge integrations 继续使用各自页面。

## Version line - 0.2.x - 增加 Local GitTogether Feature

### Phase - 0.2.0 - 多仓库总览与批量 Git 操作

#### F-0.1.2 Multi-repository overview

- Feature：GitTogether 提供全局 Overview，展示本机能够找到或登记的所有 repository，而不是一次只能查看一个 repository。
- 用户价值：用户可以同时管理十几个小型游戏 idea、工具仓库或 Agent 项目，并看到 branch、worktree、dirty state、ahead/behind、Agent 和 Presence 摘要。
- 当前状态：修正中。Overview 继续聚合已登记的本地 repository，按仓库展示真实 branch、linked worktree、HEAD/base、dirty、conflict、ahead/behind、Work Session owner 和 Presence 可用性；入口改为侧边栏的全局级 Overview 按钮，不接管应用默认首页。
- 布局参考：全局视图按纵向 repository group 组织；每个 repository 有一行主要标题和对应的操作区域，下面缩进显示该 repository 的 branch/worktree 行，每个 branch/worktree 的操作与对象保持同一行对齐；多个 repository 依次向下排列，并保留左侧窄导航或上下文栏的位置。
- 边界：Overview 是独立的全局试验视图；应用默认仍进入 GitButler 原有单仓库 Workspace。从 Overview 点击 repository 必须直接进入该 repository 的原 Workspace，也可以选择多个 repository 执行批量操作。

#### F-0.1.3 One-click fetch / commit / push

- Feature：用户可以从总览页或仓库范围内一键执行 fetch、创建 commit 和 push，并分别看到每个 repository 的真实结果。
- 用户价值：不需要逐个打开十几个仓库、切换窗口、重复执行相同的 Git 操作。
- 当前状态：已实现。单仓库和多选批量操作都分别执行 fetch、commit、push，并为每个 repository、每种操作保留独立的进行中、成功或失败结果；commit 不会被显示为 push 成功。
- 边界：fetch、commit 和 push 必须显示不同状态；不能把本地 commit 当成 push 成功，也不能用一个总成功提示掩盖单个仓库失败。

### Phase - 0.2.1 - 模仿 Perforce 的中央式 Git 使用方式

#### F-0.1.4 Get Latest

- Feature：提供类似 Perforce `Get Latest` 的用户操作，让用户从中央来源获取最新状态，并在 Git branch/worktree 规则下安全地更新本地工作区。
- 用户价值：用户可以用接近 Perforce 的直观方式更新项目，而不必先理解一组分散的 fetch、merge、rebase 和 checkout 命令。
- 当前状态：已实现。Get Latest 先 fetch，再展示预检结果；只有当前 worktree 干净、HEAD 与预检一致且 upstream 可严格 fast-forward 时才应用，dirty、detached、缺失 upstream、分叉或预检后状态变化都会阻止更新。
- 边界：Get Latest 的 GUI 语义需要明确区分“只获取远端引用”和“把最新内容应用到当前 worktree”；遇到本地修改、冲突或 branch 不一致时，必须先显示风险，不得静默覆盖用户工作。

### Phase - 0.2.2 - 多 Worktree、Branch 与 Work Session

#### F-0.1.5 Multi-worktree / multi-branch workspace

- Feature：同一个 repository 内的多个 worktree 或 branch 可以在一个 workspace 中并排显示、自由组织和切换，必要时拖到侧边栏或同时打开多个上下文。
- 用户价值：用户可以同时观察 `main`、feature branch 和 agent branch，不需要在多个孤立窗口之间来回切换。
- 当前状态：修正中。项目级 Work Trees 视图以横向真实 branch/worktree 列展示 HEAD/base、dirty、ahead/behind、session 和当前 changes；它通过侧边栏中的独立按钮进入，不替换原 Workspace。列可重新排序、聚焦到对应 Context，并可直接在该 worktree 打开终端。
- 布局参考：仓库内视图以横向并排的 branch 列组织；每一列上方是一个真实 branch/worktree 卡片，下方直接排列属于该 branch 的 commit、change 或状态区域，使多个 branch 能够在同一视口内比较。
- 边界：每个 worktree 都对应真实 Git branch，并显示 owner、base commit、dirty state、当前 session 和可用操作；GitTogether 不把多个 worktree 假装成一个 branch。

#### F-0.1.6 Protected Work Session

- Feature：用户开始一段本地工作时，GitTogether 可以把它放入个人或会话级的安全 worktree，持续记录 base commit、touched files、touched roots、操作类型和 dirty 状态，并在结束时生成 snapshot commit。
- 用户价值：用户不需要手动为一次 Fix Up Redirectors 或其他批量资产操作拆分大量 worktree；系统保护工作边界，但不替用户决定任务内容。
- 当前状态：已实现本地保护闭环。创建 Work Session 会建立真实 branch 与 linked worktree，持续聚合 base、touched files/roots、dirty/conflict 和操作记录，并可生成 snapshot commit；结束前评估目标分支的真实路径交集与高风险资产。由于 `0.3.x` Presence 未实现，Presence 状态明确显示不可用，自动合并保持关闭。
- 边界：自动合并只能基于 base commit 到目标分支的真实文件交集、Presence 状态和资产风险判断；不以“main 是否有任何 diff”作为唯一判断，也不默认自动合并高风险二进制资产。

### Phase - 0.2.3 - Local Workspace GUI 与 Context Panel

#### F-0.1.8 Four-region workspace and context panel

- Feature：workspace 可以围绕四类可组合区域组织：左侧 Repository，仓库内的 Threads/Tasks，中间主要 Chat，最右侧 Context Panel；区域可以展开、收起和重新排列。
- Context Panel 至少包含 Files、Diff、Preview、Terminal、Git Graph 和 Git Details；Git Graph 从下往上展示历史和 branch 关系。
- 用户价值：repository、任务/对话、Agent 和 Git 上下文在一个页面内相互关联，而不是分别散落在 Git GUI、终端、Agent 工具和文件浏览器中。
- 当前状态：修正中。Repositories、Threads/Tasks、Chat、Context 四个区域继续作为 Work Trees 试验视图的一部分，可独立折叠并用方向按钮重新排列；Context 提供 Files、Diff、Preview、Terminal、Git Graph、Git Details 和 Branch Workspace。该试验视图必须复用 GitButler App Shell、共享组件和视觉状态。
- 边界：这是一项 GUI Feature 设计，不把每个面板或每种状态拆成独立的 implementation task；具体布局可在设计阶段继续收敛。

### Phase - 0.2.4 - 自托管 Git 服务器访问

#### F-0.1.9 Self-hosted Git server connection

- Feature：用户可以配置任意 Git 服务器的访问地址、账号和密码，并把这组连接配置绑定到一个或多个 repository，用于 clone、fetch、Get Latest、push 等需要访问远端的操作。
- 用户价值：用户不需要等待 GitTogether 为每一种服务商单独开发登录流程，就可以连接自己部署或自行托管的 GitHub Enterprise、GitLab、Gitea、Forgejo、Bitbucket Server 或其他兼容 Git 传输协议的服务器。
- 当前状态：已实现通用 HTTPS 连接基线。用户可创建、替换、撤销连接，按 scheme、host、port 和路径段限定凭据作用域，把连接绑定到 repository，并用于 clone、fetch、Get Latest 和 push；界面与后端不会返回或显示已保存 secret。
- 边界：第一阶段以通用 Git over HTTPS 和服务器支持的账号/密码认证为基础；GitHub、GitLab 等服务商专属的 Pull Request、CI 和高级 API 仍然是可选的 provider-specific 能力，不能假设所有自托管服务器都提供这些 API。
- 安全：密码或等效的访问 secret 必须进入操作系统凭据存储，不写入 repository 配置、远程 URL、Feature 文档、日志或终端输出；用户可以查看、替换和撤销已保存的连接配置。
- 交互：添加 repository、Home 空状态、repository Settings 和远程操作失败提示都应能引导用户选择或创建服务器连接配置，并明确显示当前操作使用的服务器和账号。

## Version line - 0.3.x - Git Presence Server 心跳功能

### Phase - 0.3.0 - Git Presence Server Heartbeat

#### F-0.2.1 Git Presence Server heartbeat

- Feature：建立 Git Presence Server（GPS），接收 GitTogether Client 的 heartbeat 和聚合后的工作状态。
- 用户价值：用户可以知道某个 repository、worktree 或 Work Session 是否仍然在线，以及其他人或 Agent 当前是否在工作。
- 边界：heartbeat 主要负责续命；状态变化时发送新的聚合 snapshot。一次修改几千个文件仍然是一条包含状态摘要、touched files/roots/count 和操作类型的消息，不是几千条消息。

### Phase - 0.3.1 - 本机 Bridge 与 Presence 状态

#### F-0.2.2 Local client bridge

- Feature：同一台机器上的 UE、Godot 或其他工具客户端先把状态发送给 GitTogether Local Bridge，再由 GitTogether 作为本机唯一的 Presence 出口连接 GPS。
- 用户价值：不同工具不需要各自维护 Git、用户、branch、worktree 和网络身份，Presence 状态不会因为多个客户端同时上报而互相冲突。
- 边界：外部工具负责采集本地事件，GitTogether 负责结合 Git 状态和 Work Session 整理统一消息；GPS 不直接接收多个本机客户端的平行身份。

#### F-0.2.3 Presence state and claims

- Feature：GPS 和 GitTogether 共同表达 viewing、editing、dirty、claimed、locked 等状态，并支持 repository、worktree、folder、file 或 asset 范围的 claims。
- 用户价值：用户能够知道谁正在改什么、谁占用了什么，以及当前变化是否影响自己的 snapshot 或合并判断。
- 边界：Presence 广播以 session state 替换和广播为主，服务器不需要在每次广播前对所有用户逐文件计算复杂 diff；新用户进入项目时可以获取一次完整状态。

### Phase - 0.3.2 - Presence-aware 合并与授权

#### F-0.2.4 Presence-aware safe merge

- Feature：本地 GitTogether 在 snapshot 或合并判断时可以使用 GPS 的 Presence 状态，结合 Git diff 判断是否安全、需要警告或进入 review。
- 用户价值：提交之后仍然可以停在“已提交、未合并、可审查、可回滚”的安全中间态，不因自动化而强行覆盖他人的工作。
- 边界：同文件 locked、claimed 或 editing 时默认暂停自动合并；Presence 是安全判断依据之一，不替代 Git 自己的冲突分析。

#### F-0.2.5 Simple identity and administration

- Feature：GPS 初期采用直观的用户身份和授权方式，例如绑定用户的隐式 key、邮箱登录，以及在 GitTogether GUI 中提供简约的管理入口。
- 用户价值：普通用户不需要理解复杂的 token、服务部署或权限系统；有管理权限的用户可以在 GitTogether 中管理项目授权。
- 边界：第一版优先简单、可解释、可维护；长期的管理能力仍属于 GitTogether GUI 与 GPS 之间的产品设计范围。

## 当前产品边界

- `0.0.x` 已完成 GitButler fork 与 GitTogether 本地产品基线，并保留只从 `upstream/master` 获取更新的能力。
- `0.1.x` 已完成普通 Git branch/worktree 默认策略与继承 GUI 的本地 workflow 收敛。
- `0.2.x` 已完成本地 GitTogether Feature：repository overview、fetch/commit/push、Get Latest、多 worktree/branch、Protected Work Session、新的 workspace GUI 和自托管 Git 服务器访问。
- `0.3.x` 再加入 GPS heartbeat、Presence snapshot、claims、Presence-aware merge 和初期授权。
- 不因为采用 agent-template 而移动已有 GitButler 源码目录；文档和协作规则可以迁移，源码路径先保持兼容 upstream 的状态。
- 不把 Feature 清单写成实现任务清单；实现计划、测试命令和逐文件修改记录在其他工程文档中。
