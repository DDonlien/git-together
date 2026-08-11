# Agent 协作规范

版本：v1.1.0-260807-214301

本文件分为“标准内容”和“项目专用内容”。除非用户明确要求修改协作规范，否则只允许在“项目专用内容”下补充或调整，不修改标准内容。

## 标准内容

### 0. 文档缺失时先创建

- 如果当前仓库或当前子功能根目录没有 `AGENTS.md`，先阅读 `agent-template/AGENTS.md`，并在当前适用目录创建属于该目录自己的 `AGENTS.md`。
- 如果没有 `REQUIREMENTS.md`，先阅读 `agent-template/REQUIREMENTS.md`，并在当前适用目录创建属于该目录自己的 `REQUIREMENTS.md`。
- 如果没有 `DESIGN.md`，先阅读 `agent-template/DESIGN.md`，并在当前适用目录创建属于该目录自己的 `DESIGN.md`。
- 如果没有 `README.md`，先阅读 `agent-template/README.md`，并在当前适用目录创建属于该目录自己的 `README.md`。
- 如果仓库内已有内容，或已经与当前 Agent 进行过对话，基于仓库内的内容和对话的实际情况填写上述文件，填写规则会在下文中写明。
- `AGENTS.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `README.md` 默认使用中文书写；除非用户特别说明，或术语、代码符号、专有名词本身应使用英文。
- `agent-template/` 中的 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 日志模板只保留演示内容；具体撰写规则统一以本 `AGENTS.md` 为准，阅读时需要注意分辨规则和示例的差异。
- 上述创建的文件名必须全大写；其中 `AGENTS.md` 和 `REQUIREMENTS.md` 必须使用复数形式。即使用户临时写成小写或单数，也应遵循该统一标准，除非用户明确要求修改。
- 复制模板到实际仓库前，应删除模板中的 `.git` 等 Git 相关资产，移除其仓库特征；同时清理 `agent-log/` 中除日志模板文件 `yyyymmdd-hhmmss-utcpn-username-modelname.md` 以外的历史日志，避免把模板仓库的执行上下文带入新项目。
- 如果当前要初始化的是 Game 项目，必须改用 `game-agent-template/`，并在新项目仓库中默认启用 Git LFS；模板自带的 `.gitattributes` 必须一并复制到项目根目录，不得删改为普通 Git 跟踪，除非用户明确要求调整。
- Game 项目初始化时还必须一并复制模板自带的 `.gitignore`；`.gitignore` 负责忽略引擎缓存、构建产物、中间文件和其他不应入库的派生内容，规则应与资产管线、引擎和 `.gitattributes` 的跟踪边界保持一致。

### 1. 每次任务开始前

- 确认当前工作目录、分支和 worktree 是否符合用户本次明确指定的工作目标。
- 如果用户已经明确指定 feature、branch 或 worktree，且当前目录不匹配，Agent 可以按项目规则进入已有 worktree，或创建对应 branch/worktree 后再执行任务。
- 如果用户没有明确指定目标分支或 feature，Agent 不得自行猜测并切换分支、创建分支或创建 worktree；应在当前分支继续，或停止并询问用户。
- 如果当前工作区存在未提交改动，Agent 不得切换分支、移动 worktree 或创建会覆盖现有路径的 worktree；必须先告知用户当前状态。
- 在 Git worktree 模式下，优先通过“进入已有 worktree”或“创建新的 worktree”来切换工作上下文，而不是在已有 worktree 内执行 `git checkout` / `git switch`。
- Agent 严禁在未获得用户明确授权的情况下执行 `git reset --hard`、`git clean`、`git branch -D`、`git worktree remove`、`git worktree move` 等破坏性命令。
- Git 同步预检规则：
  - `git fetch --prune`、`git merge --ff-only` 等同步操作需要直接访问远端仓库；如果当前执行环境默认禁止联网，应提示用户切换到允许网络访问的模式，否则无法完成同步预检。
  - 如果当前目录属于 Git 仓库，任务开始前先执行 `git fetch --prune`，只更新远端追踪信息，不直接修改本地工作区。
  - 然后检查当前分支是否设置了 upstream；如果没有 upstream，只记录当前分支状态，不执行 pull、merge 或 rebase。
  - 检查当前分支相对 upstream 的 ahead / behind 状态：
    - 如果没有落后远端，继续执行任务。
    - 如果本地没有未提交改动，且当前分支只落后远端，则执行 `git merge --ff-only @{u}`，只允许快进更新。
    - 如果本地存在未提交改动，先比较本地已改文件和远端新增变更文件是否重叠；没有重叠时才可执行 `git merge --ff-only @{u}`，存在重叠则停止并告知用户。
    - 如果当前分支同时 ahead 和 behind，不自动 merge、不自动 rebase，停止执行并告知用户需要人工决定同步方式。
  - Agent 不主动执行普通 `git pull`，因为普通 `git pull` 可能隐式 merge 或 rebase，导致超出用户预期的历史变化。
- 如果发现当前分支、worktree、目录位置或任务基准不符合用户本次明确指定的工作目标，必须按上述规则处理，不得自行猜测目标上下文。
- 阅读用户本次原始 prompt。
- 阅读当前目录适用的 `AGENTS.md`、`README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 中的日志。日志应优先读取由当前 Agent / 对话创建的最新日志；无法可靠判断时，阅读最近 3 条或最近 7 天内的日志。
- 检查 `REQUIREMENTS.md`，确认用户本次需求是否匹配已有需求、子需求、验收项或已标记的阻塞项。
- 如果仓库内有父级与子级 `AGENTS.md`，从父到子依次阅读；更具体目录的规则优先，但不得违反父级标准内容和用户明确要求。

### 2. 每次任务执行中

- 为每次任务执行创建一条新的执行日志，放在当前适用目录的 `agent-log/`。
- 如果本次任务没有修改任何仓库文件，且只是解释、咨询、排查思路或一次性问答，可以不创建执行日志；但如果用户明确要求记录，或本次对话形成了新的需求、设计决策、技术约束，则仍应更新对应文档或日志。
- 日志命名规则：`YYYYMMDD-HHMMSS-utcpN-username-modelname.md` 或 `YYYYMMDD-HHMMSS-utcnN-username-modelname.md`。
- `utcpN` 表示 UTC 正偏移，`utcnN` 表示 UTC 负偏移；不要在文件名中使用 `+` 或 `-`，以确保不同系统和工具链的适配性。
- `username` 使用当前执行者或系统用户名称。
- `modelname` 使用本次执行实际可获得的最具体模型标识；如果环境只暴露模型家族名，应在日志正文说明原因。
- 使用任务完成时间作为日志文件名中的时间；如果任务开始时先创建临时日志，交付前按完成时间重命名。
- 一次任务执行从 Agent 开始处理用户请求算起，到交付、提交、阻塞或明确暂停为止。
- 如果用户在同一次执行中补充或修正要求，把补充 prompt 原文和时间追加到同一条日志。
- 每条日志开头必须包含用户原始 prompt、模型版本、启动运行时的分支和版本、任务开始时间、任务结束时间以及任务结束时是否执行了提交。
- 每条日志还应包含已阅读上下文、对话与行动记录、完成工作、更新的需求 ID、更新的 README 或 DESIGN 章节、验证方式和备注。
- 日志模板文件只保留演示内容；日志命名、必填字段和撰写规则以本 `AGENTS.md` 为准。
- 日志中的对话与行动记录应保留完整时间线，不能只记录最终代码摘要而省略导致决策的对话、行动结果、测试结果和未解决问题。
- 归档前把对话内容归属到 `REQUIREMENTS.md` 中最具体的稳定需求 ID；日志不能替代 `AGENTS.md`，`AGENTS.md` 也不能替代完整时间线。
- 交付前检查“对话 → 需求 ID → 文档 / 日志”链路是否完整。

### 3. REQUIREMENTS.md 的维护标准

- `REQUIREMENTS.md` 使用 Obsidian 原生友好的 Markdown 格式：标题层级、缩进任务列表、稳定 ID、少量标签。
- 每条需求的描述文字必须是自然、直白、清晰的完整句子；技术标识符可以保留在反引号中，但连接标识符的必须是正常句子。
- 标记 `#cut`、`#deferred`、`#blocked` 时，要把完整的前因后果写成一句连贯的话。
- 需求中引入简称或代号时，第一次出现必须顺带说明它具体如何运作。
- 不使用复杂表格，不使用 YAML 字段。
- 通过标题层级拆分 Phase、branch/worktree 和 feature；Phase 命名、三级标题格式和 task ID 结构遵循本节规则。
- 更频繁地通过缩进 checkbox 表达父子任务、子任务、验收项和检查点关系。
- 每个可执行需求必须有稳定 ID。稳定 ID 不因排序、插入或移动而改变；拆分任务时保留原 ID，并新增子 ID。
- 不静默删除需求；取消的需求保留并标记 `#cut`，附简短原因。
- 每次任务开始前检查 `REQUIREMENTS.md` 中是否已有匹配需求；每次任务完成后，根据实际结果更新已经完成的需求、子需求或验收项。
- 如果任务改变范围、状态、验收标准、优先级或阻塞条件，必须同步更新 `REQUIREMENTS.md`。
- 具体需求、验收标准、任务拆分、优先级、阻塞状态和完成状态只写入 `REQUIREMENTS.md`，不要写入 `README.md` 或 `DESIGN.md`。
- 纯内部工程事务不单独伪装成用户需求；工程卫生基础设施可以登记为用户可间接感知的顶层条目，测试用例作为所属功能任务的子任务记录。
- 修改 `REQUIREMENTS.md` 时使用精准的局部修改；只有用户明确要求整理需求文档时，才进行本次这种结构重排。
- 除非用户明确要求重构需求文档，否则不得删除、合并、重编号或改写已有稳定 ID。
- 当用户反馈或新增需求需要进入核心实现时，应先整理为一条 requirement，再开始实现；新增三级 feature 标题若会影响 branch/worktree 规划、项目范围或 Phase 结构，必须先征询用户确认。
- 二级标题使用 `## Phase - v0.1.0 - xxx` 格式；三级标题使用 `### branch-name: feature description` 格式，其中 `branch-name` 使用 `a/b` 两段式命名，并描述该 branch 下用户可感知的完整 feature 或工作主题。
- 三级标题以下不再继续拆分标题；具体事项使用带稳定 ID 的 task。已有项目需求若使用其他稳定 ID 格式，保留原 ID，不因格式迁移而重编号。

### 4. README.md 的维护纪律

- `README.md` 是项目对外的第一印象，目标读者是第一次看到这个项目的人。
- README 应聚焦“是什么 / 解决什么问题 / 当前状态 / 关键设计 / 入口文件 / 文档指针”，不要把所有信息塞进同一份文档。
- 仓库结构、协作流程、视觉规范、任务清单、完整命令和 API 参考应放入专门文件；README 最多用一两句话提及并附 Markdown 链接。
- README 适合指向而不是详述；每段尽量用 1–3 句话概括核心。
- README 的语气应对外、对读者友好，避免堆砌只对内部维护者有意义的术语。
- 当项目范围、关键设计、入口文件、当前状态或用户入口发生变化时，同步更新 README。
- 不要把具体待办、验收项、目录结构、协作规范、任务状态和参考资料写进 README。

### 5. DESIGN.md 的维护纪律

- `DESIGN.md` 不是系统整体设计文档，而是视觉规范和界面风格文档。
- `DESIGN.md` 用 Markdown 描述 AI 和开发者可执行的视觉设计系统，包括颜色、字体、间距、布局、组件样式、视觉语气、响应式规则和可访问性约束。
- `DESIGN.md` 不记录系统架构、数据模型、产品路线图或任务列表。
- 当品牌视觉、UI 风格、设计 token、组件外观、布局原则或可访问性规则变化时，同步更新 `DESIGN.md`。
- 如果项目没有 UI 或视觉界面，`DESIGN.md` 可只记录“不适用”和原因。
- 如果项目的设计风格发生大幅、颠覆性的改变，应将老版本保存到根目录 `archive/design/DESIGN-yyyymmddhhmmss.md`。

### 6. 父子文档关系

- 如果仓库内有明显的多个子功能、子应用、工具包或独立模块，应在根目录和每一层子功能根目录创建一套 `AGENTS.md`、`README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/`。
- 根目录 README 描述全局目标、共享约束、目录索引和跨子功能关系；子功能 README 只描述其独有用途、入口、命令和边界。
- 父级 `AGENTS.md` 必须索引子功能目录，并说明每个子功能的文档入口。
- 当任务只影响某个子功能时，优先更新该子功能文档；如影响全局规则或跨子功能关系，再同步父级文档。
- `reference/`、`references/`、`third_party/`、`vendor/`、`examples/`、`project/` 等外部参考目录不默认视为项目代码，也不自动纳入项目文档范围。

### 7. 工程默认规则

- 优先遵循仓库已有技术栈、目录结构、命名和风格。
- 保持改动聚焦在用户请求范围内；不覆盖用户改动，不回滚无关文件。
- 行为、共享逻辑或用户可见流程发生变化时，补充或更新测试。
- 交付前运行相关验证命令；无法运行时说明原因并记录剩余风险。
- 搜索优先使用 `rg`，手工编辑文件优先使用补丁方式，避免无关格式化。
- 未经当前环境实际运行的验证，不得在文档或需求中标记为“已通过”。不同验证维度必须分别执行和说明。
- 提交按需求边界划分；纯文档重组、纯参数调优与行为变更尽量分开提交。
- 默认只创建本地提交，不自动执行 push、submit 等发布动作，除非用户明确要求。
- 静态分析无法确认的运行时行为、数据状态必须标注为推断。
- 注释解释设计意图而不是复述行为；默认值、公式或安全上限变更时同步更新注释。
- 重命名、移动或编号类改动后，必须全局检查相关引用、链接、脚本参数和文档示例。
- 复杂流程按阶段执行，每阶段定义显式退出条件，核对通过后才进入下一阶段。

### 8. 目录命名规则

- 顶层目录优先按照交付物或职责命名，而不是按照技术栈命名。
- 客户端形态按交付平台或使用场景命名，例如 `ios/`、`macos/` 和真正的 `web/`；官网使用 `site/`，管理后台使用 `admin/`。
- 同一交付物同时包含前端和后端时，在交付物目录下继续拆分 `frontend/` 和 `backend/`。
- 目录名保持小写，使用连字符 `-` 分隔单词，避免重复项目名和低信息量的 `project`。
- 本节规则只约束新建内容；已有历史文件不因本节规则自动迁移、改名或重构，结构调整视为独立需求，需用户明确要求。
- 文件与目录名应兼容 Git 与跨平台文件系统；目录按需创建，不预建空目录。

### 9. Worktree 工作目录模式

- 对于使用 Git worktree 的项目，推荐采用“项目容器目录不直接开发，`main` 有独立工作区，其他分支与 `main` 平级”的结构：

```text
<project-name>/              ← 项目容器目录，只收纳工作区，不作为任何分支的开发工作区
├── main/                    ← main 分支工作区，也是工具默认打开目录
│   ├── .git/                ← Git 元数据
│   ├── AGENTS.md
│   ├── README.md
│   ├── REQUIREMENTS.md
│   ├── DESIGN.md
└── <deliverable-dir>/       ← 例如 macos/、site/、ios/、web/、admin/
├── <branch-worktree-name>/  ← 其他分支工作区
└── _builds/                 ← 本地打包产物，不进 Git
```

- `<project-name>/` 只负责收纳 `main/` 和其他 branch worktree，不直接作为任何分支的开发工作区。
- `main/` 默认对应仓库默认主分支工作区；其他 branch worktree 与 `main/` 平级。
- branch 名称中的 `/` 等不适合作为目录名的字符，在本地 worktree 目录名中替换为 `-` 或项目约定的安全分隔符。
- branch/worktree 名称推荐保持 `a/b` 两段式格式；如果 `b` 暂不明确，使用 `main`，例如 `sub/main`。
- 每个 worktree 应对应一个明确的 Git branch，不在多个 worktree 中复用同一个 branch 作为长期开发工作区。
- 如果 branch 名称发生变更，关联的 worktree 本地目录名也应同步调整，以保持检索、定位和文档记录一致。
- 上述示例是目录组织方式；`<project-name>`、`<branch-worktree-name>` 和 `_builds/` 只是占位符，不是强制命名规范。
- 如果用户已经明确指定 feature、branch 或 worktree，Agent 可以按项目规则优先进入已有 worktree；如确需创建，应确保不会覆盖现有路径并在执行前说明。
- 如果用户没有明确指定目标分支或 feature，Agent 不得自行猜测并切换分支、创建分支或创建 worktree。
- 禁止在未获得用户明确授权的情况下执行 `git worktree remove`、`git worktree move` 等会破坏或重定位 worktree 的命令。

### 10. 内容与系统任务日志拆分

- 针对同时存在内容和系统的复杂项目，应在 `agent-log/` 下创建 `agent-log/system/` 和 `agent-log/content/`。
- 每次实际执行任务时，根据任务性质将日志记录到对应目录；一次同时涉及两类改动时，记录在主要改动对应目录并说明另一类改动范围。

### 11. 版本管理纪律

- 版本号只认一个权威来源，由项目指定单一文件承载；脚本与 CI 统一从该来源读取，不在多处平行维护。
- 产生新的可交付改动时按语义化规则递增版本号；无法明确判断时默认递增，并在日志中说明依据。
- 递增后检查所有对外版本展示，不允许遗留与权威来源不一致的硬编码版本。

## 项目专用内容

### 项目概况

- 项目名称：GitTogether。
- 产品简介：基于 GitButler 代码库构建的本地优先 Git 分支、worktree 和多仓库工作台客户端。
- 主要用户：需要在多个 Git 仓库、分支、worktree 和 Agent 任务之间协作的开发者与维护者。
- 当前阶段：开发中，保留 GitButler 现有能力作为基础，逐步建立 GitTogether 的本地工作流。

### GitTogether 的 Requirement / Feature 模型

- `REQUIREMENTS.md` 是 Feature 清单和产品契约，不是实现任务列表。
- 每个 `R-xxx` 都表示一个用户可感知的 Feature；条目记录 Feature 名称、产品范围、当前状态、已有能力和完成边界。
- 当前产品路线使用四条 minor version line：`0.0.x` GitButler fork 基线、`0.1.x` 移除不需要的 GitButler 本地 workflow、`0.2.x` 增加 Local GitTogether Feature、`0.3.x` Git Presence Server 心跳；每条 version line 下可以继续拆分多个合理的 Phase。
- Phase、branch/worktree 只用于说明 Feature 的产品阶段和上下文，不表示 Agent 要执行的步骤。
- 不在 `REQUIREMENTS.md` 中放逐文件修改计划、命令清单、Agent 分工、临时 checkbox 或“下一步要做什么”；这些内容放在 `agent-log/`、专门计划或用户明确指定的 issue 文档中。
- `Work Session` 是 GitTogether 的产品能力和自动化状态单位，不等于一个 implementation task；用户自己决定任务如何组织，GitTogether 负责隔离 worktree、记录影响范围、snapshot、Presence 检查和安全合并判断。
- 整理需求格式时保留既有 Feature ID，不将 Feature 拆成 task，也不因为状态变化而重编号。

### 技术栈与命令

- 技术栈：Rust workspace；Tauri/Svelte/TypeScript desktop；Svelte web；Electron/React/TypeScript lite；共享 TypeScript packages；Playwright、WebdriverIO 和 blackbox e2e。
- 统一入口：优先使用根目录 `package.json`、`pnpm-workspace.yaml` 和 `Makefile`。
- 安装依赖：`pnpm install`。
- 开发命令：`pnpm dev:desktop`、`pnpm dev:web`、`pnpm dev:lite`。
- 前端检查：`pnpm check`、`pnpm lint`、`pnpm build`。
- Rust 检查：`make check`、`make fmt-check`、`make clippy`。
- 测试命令：`pnpm test`、`pnpm test:e2e`、`make test`。
- 打包命令：`pnpm package`、`pnpm build:test`；实际发布前还必须核对 GitTogether 的 identifiers、updater policy 和 signing configuration。

### 文档入口

- 项目说明：`README.md`
- 协作规范：`AGENTS.md`
- 需求追踪：`REQUIREMENTS.md`
- 视觉规范：`DESIGN.md`
- 执行日志：`agent-log/`

### 目录索引

- 当前仓库保留既有 GitButler 源码目录；本项目不因模板的交付物命名规则自动把历史目录移动到 `ios/`、`macos/`、`web/` 或 `site/`。
- `apps/desktop/`：Tauri desktop 应用，使用 Svelte 和 TypeScript。
- `apps/web/`：Svelte web 应用。
- `apps/lite/`：Electron/React lite 应用；适用规则见 `apps/lite/AGENTS.md`。
- `crates/`：Rust crates；适用规则见 `crates/AGENTS.md`，更具体的 crate 规则继续向下覆盖。
- `packages/`：共享 TypeScript packages，包括 SDK 和 UI。
- `e2e/`：Playwright、WebdriverIO 和 blackbox 端到端测试。
- `scripts/`：开发、构建和验证脚本。
- `.github/workflows/`：CI、PR check 和 release automation。
- `.agents/skills/`：仓库内共享 Agent skills；`.codex/` 和 `.claude/` 的本地状态不入 Git。
- `agent-log/system/`：本次及后续系统、工程和协作规范任务日志。

### 子功能文档入口

- `apps/desktop/`、`apps/web/`、`apps/lite/`、`crates/`、`packages/` 和 `e2e/` 已有的 README 或 AGENTS 文件继续作为子目录入口。
- 只有在某个子功能实际需要独立需求、视觉规范或执行日志时，才新增该子目录自己的 `REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/`；不为历史目录批量预建空文档。

### Git 与远程边界

- `origin`：个人 fork `DDonlien/git-together`。
- `upstream`：来源仓库 `gitbutlerapp/gitbutler`。
- 当前默认分支和开发分支：`git-together/main`。
- `upstream/master` 是来源仓库同步基线；不向 `upstream` 推送，除非用户明确指定并确认目标。
- `upstream` 的 fetch refspec 只允许跟踪 `refs/heads/master`；日常开发始终留在 `git-together/main`，不得为了参考来源仓库而新增、切换或保留其他 upstream branch 或 remote-tracking ref，除非用户另行明确授权。
- 个人 fork 不保留 `master` 和多余的 `origin/origin/master`；删除远程分支前必须核对完整 ref 和默认分支状态。
- 从 upstream 获取代码时优先保留既有源码路径，先做只读差异和路径冲突分析；不要为了套用模板而移动 `apps/`、`crates/`、`packages/` 或 `e2e/`。

### App 类型补充约束

- 本地优先的数据策略：用户凭证、token、订阅状态、本地缓存以本地存储为准；不得把用户私密数据上传到与项目无关的外部服务器。
- 第三方 Provider / SDK 集成前，在 `REQUIREMENTS.md` 中增加需求条目；任何对外请求需记录在 `agent-log/` 的验证方式中。
- 凭证与日志安全：浏览器 Cookie、Keychain、CLI 日志和本地配置文件只读访问；日志和控制台输出不得包含 token、cookie、API key 或完整个人账号标识。
- 引用 `reference/` 或外部参考项目中的实现时保留来源说明；外部参考项目不默认纳入本项目代码范围。

### 维护提示

- 修改本文件的标准内容时，必须同步更新模板来源 `/Users/taobe/Projects/GitHub/Personal/agent-template/app-agent-template/AGENTS.md`，并在日志中说明；通常只在项目专用内容下补充或调整。
- 本项目本次只迁移协作规则和治理文档，不移动已有源码目录，因此未来从 GitButler upstream 合并时仍使用原始路径。
