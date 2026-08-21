# GitTogether 视觉规范

本文件记录 GitTogether 当前继承自 GitButler 的界面视觉约束，不代表一次新的视觉重设计。已有组件和主题 token 优先于本文件中的概括；新增 UI 应先复用现有 `@gitbutler/ui` 组件和主题变量。

## 视觉主题

- 关键词：桌面优先、信息密度高、清晰、可审查、面向开发者。
- 整体气质：让仓库、分支、worktree、文件差异和操作状态易于扫描与比较。
- 应避免的气质：装饰性过强、把状态只用颜色表达、隐藏关键 Git 操作结果或伪装尚未完成的能力。

## 色彩

- 颜色优先使用现有主题 token，不在新组件中硬编码独立色板。
- 主色用于主要操作、当前选中状态和清晰的交互焦点；次要操作应保持视觉层级低于主要操作。
- 成功、警告、错误和信息状态必须使用语义色，并同时提供文字、图标或结构上的说明，不能只依赖颜色。
- 暗色和亮色主题都必须保持文本、边框、控件和 diff 状态的可读性。
- 现有 token 的主要来源：`packages/ui/src/styles/core/variables.css`、`packages/ui/src/lib/components/Button.svelte` 以及 `apps/desktop/src/styles/styles.css`。

## 字体

- 普通界面文本优先使用 `var(--font-default)`。
- 分支名、commit hash、路径、代码和 diff 内容优先使用 `var(--font-mono)`。
- 标题、仓库名称和主要状态可以通过字重和尺寸建立层级，不通过大量装饰性字体变化制造层级。
- 新增局部字号应与现有组件保持一致；dashboard 当前已有紧凑的卡片、标签和状态文字，不要随意放大或缩小。

## 间距与布局

- 优先复用现有组件的间距和布局约束，不在单个页面中创造另一套 spacing scale。
- 默认页面继续使用 GitButler 原有 Workspace 布局；GitTogether 的 Overview 与 Work Trees 是侧边栏中的独立试验入口，不接管默认页面。
- Work Trees 的 Repositories、Threads/Tasks、Chat 和 Context 四个区域是信息架构的一部分；每个区域可以独立折叠，并通过明确的方向控件重新排列，调整后仍必须保持区域关系和恢复入口可发现。
- 仓库卡片、文件列表、diff 和 commit 信息应支持快速纵向扫描，并保持操作控件与对应对象相邻。
- 响应式布局应在较窄窗口中保持主要操作可见；隐藏或折叠区域必须有清晰的恢复入口。
- Context 使用 Files、Diff、Preview、Terminal、Git Graph、Git Details 和 Branch Workspace tabs；Git Graph 的视觉阅读方向从下往上，Branch Workspace 横向排列真实 branch/worktree 列。

### 侧边栏层级

- 侧边栏继续使用 GitButler 的 `34px` 方形按钮、`4px` 间距、圆角、主题 token 和左侧激活指示器。
- 项目级顶部依次为 Workspaces、Branches、Operation History 和 Work Trees；Project Setting 位于项目级区域底部。
- Project Setting 上方与全局级入口上方各放置一条共享 `Spacer` 分隔线，形成 Rider 风格的两个横向层级边界。
- 全局级依次为 Overview、Global Setting 和 Share Feedback；图标来自现有共享图标库，所有入口必须有可读 tooltip。

## 页面布局参考

附件中的两张线框图只规定信息关系和布局方向，最终颜色、边框、字号、按钮、卡片状态和交互反馈都使用 GitButler 现有实现。

### 全局 Repository 视图

- 页面按纵向 repository group 排列，多个 repository 从上到下连续出现。
- 每个 repository 的标题占据一行主区域，右侧放置属于 repository 的主要操作。
- repository 下方缩进显示 branch/worktree；branch/worktree 的操作放在与对象对应的右侧位置，避免操作脱离对象。
- 保留左侧窄导航或上下文栏；它是页面结构的一部分，但不在本阶段引入新的导航视觉语言。
- repository、branch/worktree 和 action 的层级必须通过 GitButler 现有的卡片、间距、分组和状态组件表达，而不是依赖附件中的粗灰色边框。

### Repository 内多 Branch 视图

- 同一 repository 的多个真实 branch/worktree 横向并排展示，每个 branch/worktree 占据一个可比较的列。
- 每列顶部是 branch/worktree 信息卡片；其下方直接显示该 branch 的 commit、change 或相关状态。
- 各列保持一致的宽度、标题位置和主要状态位置，便于同时比较 branch、commit、dirty state、ahead/behind 和 Agent session。
- 每列显示 HEAD/base、worktree 路径、dirty/conflict、ahead/behind、Work Session 与当前 changes；焦点动作切换 Context，方向按钮保存用户的列排序。
- 横向空间不足时，沿用 GitButler 现有的滚动、折叠或上下文切换模式，不把多个 branch 压缩成不可读的单列列表。
- branch 列表达真实 Git branch/worktree，不恢复 GitButler Virtual Branch 的专用抽象。

### Global Settings 的 Git Integrations

- 原有 `Git stuff` 与 `Integrations` 在侧栏合并为单一 `Git Integrations` 入口，避免把 Git 自动化设置、provider 账号与自托管服务器凭据拆成相邻但互相割裂的页面。
- GitHub、GitLab、Bitbucket 与 Gitea / self-hosted Git 都使用现有 `CardGroup`、输入框、按钮、加载和错误状态；Gitea 不引入独立的卡片视觉体系。
- 自托管连接是全局复用配置，因此创建、编辑与撤销放在 Global Settings；repository Settings 仅选择和绑定已有连接，并提供返回 `Git Integrations` 的清晰入口。

### 组件与视觉边界

- 优先复用 `@gitbutler/ui` 的 Button、Card、Input、Tabs、状态提示、列表、Modal 和布局组件。
- 优先复用 GitButler 已有的 theme tokens、border、surface、focus、loading、error 和 diff 状态样式。
- Work Trees 的辅助信息、控件与元数据、正文、区块标题和页标题分别复用 `text-11`、`text-12`、`text-13`、`text-14`、`text-18` 层级；按钮高度复用 `--size-tag` / `--size-button`，输入框与卡片圆角复用现有 radius tokens。
- 附件是布局草图，不是要求照搬的视觉主题；不得因为线框图使用了灰色粗边框，就在 GitTogether 中创建独立的灰色卡片体系。
- 新增页面应先寻找 GitButler 中对应的现有组件和交互，再补充 GitTogether 所需的最小组合层。

## 组件风格

- 按钮、输入框、tabs、toast、modal、列表和空状态优先使用 `packages/ui/` 中的共享组件。
- 主要按钮只用于当前上下文中最重要的动作；破坏性操作必须有明确的危险状态和结果反馈。
- 选中、hover、focus、disabled、loading、success、error 和 conflict 状态必须有可辨识的视觉反馈。
- Git 操作的结果必须在操作附近或统一状态区域明确显示；不能只依赖短暂的动画或颜色变化。
- Diff、commit message 和路径展示必须保持代码内容的可读性，必要时使用等宽字体和水平滚动，而不是截断关键内容。

## 动效

- 动效用于说明状态变化、区域展开收起和操作反馈，不用于装饰。
- 动画必须可被系统的 reduced-motion 偏好降低或关闭。
- 网络或 Git 操作中的 loading 状态应说明正在进行的动作，不得让 loading 看起来像已经成功。

## 可访问性

- 保持键盘可操作、焦点可见、焦点顺序与视觉顺序一致。
- 交互控件必须有可读名称；图标按钮不能只依赖图形。
- 状态、错误、冲突和异步结果应通过文本或辅助技术可感知。
- 对比度和 focus state 必须在亮色、暗色以及 diff 状态下分别检查。
- 新增 Svelte UI 后运行相应的 `svelte-check`、组件测试或端到端验证；静态检查通过不等于真实交互已经验证。

## Do / Don't

- Do：复用 `@gitbutler/ui` 和现有 theme tokens。
- Do：让 branch、worktree、路径、文件状态和 Git 操作结果可以直接比较。
- Do：为空状态、失败、冲突、重试和取消提供可理解的下一步。
- Don't：为了套用新的目录或视觉模板而移动已有源码，或在 UI 中重命名现有 GitButler 代码路径。
- Don't：用 placeholder 数据或单一颜色暗示操作已经完成。
- Don't：在没有同步更新设计 token、组件和验证的情况下引入独立颜色、字体或间距体系。

## 相关实现入口

- Sidebar：`apps/desktop/src/components/views/AppSidebar.svelte`
- Dashboard：`apps/desktop/src/components/dashboard/RepositoryDashboard.svelte`
- Repository card：`apps/desktop/src/components/dashboard/RepositoryCard.svelte`
- Shared UI：`packages/ui/src/lib/components/`
- Shared style tokens：`packages/ui/src/styles/core/variables.css`
