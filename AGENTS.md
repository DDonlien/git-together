---
target-repo-type: app
language: zh-CN
version: "v2.0.3-261024-162917"
source: "https://github.com/DDonlien/agent-template/blob/main/app-agent-template/AGENTS.md"
---

# 通用规则

本部分适用于项目维护；技术栈规则只在涉及对应技术时生效，项目专用规则按实际情况填写。用户最新明确要求优先于模板和历史资料。

## 任务开始与事实来源

1. 先确认用户指定的项目、当前目录、适用规则和已有改动，再定位目标文件。父子 `AGENTS.md` 从父到子阅读；子规则补充局部约束，不重复通用规则。
2. 按任务需要阅读相关 Issue、实现契约、调用关系、架构、Schema 和设计文档，不全量阅读仓库或历史记录。`reference/`、外部仓库、示例和归档默认只作参考，不纳入修改范围。
3. 当前事实以用户最新要求、有效 Issue 和实际文件为依据；历史 Comments 与档案用于追溯。区分已确认事实、推断和待验证项，不凭猜测补齐未知信息；冲突和取舍要明确说明。
4. 普通任务不检查远端模板版本、不自动同步或升级模板。只有用户明确要求维护协作规范或同步模板时才处理 `source`；同步保留项目专用规则和已有改动。
5. 缺少文档不构成普通任务的阻塞。只在任务需要时创建有实际内容的文档，不为目录整齐补空的 `AGENTS.md`、`README.md`、`DESIGN.md` 或独立任务系统。

## 代码与改动范围

1. 只实现当前问题所需的最小改动，遵循现有技术栈、架构、目录和命名，优先复用已有机制。不添加推测性功能、预留扩展点、无需求的兼容分支或额外状态来源。
2. 清理限于当前任务涉及的死代码、重复逻辑、无效分支和冗余状态；不借重构扩大范围，不改写无关模块或用户已有改动。
3. 信任已明确的内部契约与框架保证，只在真实边界和已确认故障模式下做必要校验。不为假想场景重复添加回退、防御和空值检查。
4. 不吞掉错误，不用宽泛 `catch`、`rescue nil` 或静默默认值掩盖失败；无法恢复时保留定位上下文并明确失败。
5. 一次性操作不单独引入抽象；只有实际复用、稳定边界或能降低当前复杂度时才增加辅助层。注释解释意图；参数默认值、公式或上限变化时同步其效果和范围说明。
6. 重命名、移动和结构调整后，用 `rg` 等检查受影响的引用、链接、脚本参数和示例。只更新本任务影响到的文档，不为每次任务刷新全部文档。

## Headless、工具与检查边界

1. 优先通过文件、CLI、静态分析和其他 Headless 渠道工作，保证用户继续使用系统。不得为后台任务抢焦点、弹窗或擅自操作用户正在使用的应用。
2. 只检查本次实际操作所需的工具和权限；无关工具不可用不阻塞独立工作。Blender 与 UE Blueprint 按以下例外执行：
   - Blender 相关任务始终要求 Blender MCP 可用；不可用时停止依赖它的工作并报告，不自行换成其他渠道。
   - UE Blueprint 任务要求可操作目标 Blueprint 的 UE 编辑器 MCP 可用；操作前确认连接及所需读写能力。UE 非 Blueprint 的代码、配置和文档任务不一律要求 MCP。
   - Rider MCP 始终按任务需要调用，例如处理断点继续、读取断点上下文、编译或 build 信息；不作为所有 UE 或其他任务的固定前置条件。
   - Godot 优先直接修改代码并使用项目支持的 Headless 命令；不预设 MCP 必需，遇到具体限制再处理。
3. 先定义本次改动的成功标准。AI 主要检查代码、配置、数据和引用是否正确，按风险运行必要的已有测试、编译或静态检查；可逆、低影响改动不为形式新增测试，不重复执行无新信息的检查。
4. 视觉效果、交互体验、Playtest 和大量自动化验收默认由用户负责。未经当前任务明确要求，不使用 GUI / Computer Use 做视觉验收，不自行扩展为大批自动化验收，不为验收生成临时资产或发布包。
5. 实现、静态检查、测试、编译、运行时验证和用户验收分别记录。只有实际执行并取得结果的检查才能写为通过；编译或结构读回不代表视觉、交互或用户验收通过。
6. 工具不可用或权限受限时，报告具体动作、目标、原因、已完成范围，以及动作未执行、被拒绝、待处理或结果不明的状态；继续独立工作，不绕过权限。结果不明时先核实，不盲目重试。

## 版本管理与混合仓库

1. 按目标文件确认版本管理归属。一个项目可以同时使用 Git、Perforce 或更多系统；不能因发现 `.git` 就把所有文件当成 Git 管理，也不能因使用 Perforce 就忽略 Git 状态。同一文件受多个系统管理时，分别检查相关约束。
2. 检查限于当前工作副本、本任务目标路径及必要依赖，不递归检查其他 worktree、参考仓库或其他项目，不扫描整个 Perforce 服务端。遇到归属不明、冲突或锁定时先定位相关文件。
3. Git 只做必要的本地检查：确认仓库、当前分支 / worktree，以及目标文件的工作区和暂存改动；保留用户和其他任务的改动。普通任务不自动 fetch、pull、merge、rebase、切换分支或同步远端；确需远端基准时说明需要，并按用户授权执行。
   同步边界：仅处理任务规定的版本管理对象与资产范围；混合 Git / Perforce 不联动无关系统。Git 仅在任务需要且授权范围内同步当前工作分支与其已配置 upstream，不顺带 fetch 全部分支，不切换、同步或合并 main / mainline 或其他分支，未配置 upstream 时不猜测。Git 提交整合是分支级操作，不按单文件执行 pull；同步若会涉及任务范围外内容或本地未提交改动，先报告影响并按实际需要确认，不擅自覆盖、stash 或 reset。用户另行明确要求跨分支同步时按该授权执行；普通任务不因此新增先 pull / fetch 的前置步骤。
4. 未经明确授权，不创建 branch 或 worktree，不切换当前 checkout 的分支，不移动、删除或重定位 worktree。用户指定目标名称、feature 或目录不等于授权创建；已有目标可在用户指定范围内通过进入其现有目录使用，不存在时先说明。
5. 不擅自执行 `reset --hard`、`clean`、`restore`、覆盖式 checkout、强删分支或其他覆盖 / 回滚操作。结构示例只是布局说明，不授权创建、迁移或重命名实际工作区。
6. 只有目标文件涉及 Perforce 时，才确认对应连接、用户、client、Root / Stream 与文件映射，并对目标路径检查 opened、锁定和 pending change。未确认归属前不修改文件，也不重归类其他任务已 opened 的文件。
7. 需要修改 Perforce 文件时，按既有项目规则创建或复用本任务独立的 pending change；description 说明目的、范围和检查状态。同一任务复用该 change，结束时仅检查相关文件与 change，不把无关文件收入其中。
8. 默认不执行 Git commit、push、tag、PR 创建或 Perforce submit、shelve 等交付动作；当前任务必须有对应明确授权。单独的全局每日 commit 或用户手动 commit 流程不构成本任务提交授权。
9. 用户授权提交时，只纳入本任务范围并检查相应 diff / opened；commit、push、submit、发布分别报告，不能互相代替。授权 push 不得扩展为改写历史或操作其他远端。
10. 已获授权的远端操作复用当前配置与安全凭证，不静默修改 remote、认证或传输方式，不在命令、文档、Comments 或输出中暴露 token、cookie、API key 等敏感信息。

## Issue 维护标准

1. 活动需求、任务、检查与交接统一写入当前工作副本的 `issue/`。标准路径为 `project-name/worktree(如有)/issue/issue_任务描述.md`；没有 worktree 时为 `project-name/issue/...`。`worktree(如有)` 表示已有实际工作区，不要求目录字面名为 `worktree`。
2. 属性统一使用兼容 Obsidian 的 YAML frontmatter，可在模板默认属性上扩展。旧稳定 ID、类型和拆分关联保留在属性中，不进入文件名；改名不重编号或丢失追溯信息，不为命名建立新的编号体系。
3. 文件名只用原语言的具体任务描述；类型只在 frontmatter 中记录，不加任何版本编号后缀。具体命名与版本记录见下文“Issue 文件命名与版本关联”。
4. `issue/issue_template.md` 是唯一模板文件，`type: template` 表示模板身份。实际 Issue 填写对应类型与属性；正文仅有 `# Description` 和 `# Comments` 两个一级标题，不为格式补空内容。
5. 开始实现前先搜索已有匹配 Issue。用户提出的核心行为、数据、界面、内容或可感知工程能力应落入最具体的 Issue；一次性解释或咨询不强制创建。归入已有任务或记录已授权的新任务不需要额外确认，也不意味着授权创建分支或 worktree。
6. `Description` 维护具体对象、目标行为、范围、当前事实与阻塞；属性记在 frontmatter。可使用 Markdown 原生语法、子标题、列表、checkbox 和行内图片；子分组只作为 Description 内容渲染，不新增 myIssue 专用分组。实现、检查与用户验收按实际需要表达。
7. `# Comments` 只追加。每条 Comment 用二级标题 `## YYYYMMDD-HHMMSS_Name_Model-Detail`，人类记录省略 Model-Detail；AI 的 Name 是实际执行 Agent，模型详情使用 Train-Case。每次任务执行完成后记录，标题时间为实际记录时间；涉及执行对话时在该条最后一行附标准会话链接。Git commit hash / P4 changelist 记在对应 Comment 内容里，同一 Issue 可涉及多个 change；行内图片使用 `issue/attachment`。Description 随最新结论更新，不通过重写旧 Comment 抹掉历史，不回显敏感输入。历史时间、具体 Agent、模型或原会话无法追溯时保留原始信息并说明缺失，不补造；每条实际执行 Comment 末尾使用有来源依据的对应会话深度链接，不照抄模板示例，也不把文档迁移会话冒充历史业务执行会话。历史时间、具体 Agent、模型或原会话无法追溯时保留原始信息并说明缺失，不补造；每条实际执行 Comment 末尾使用有来源依据的对应会话深度链接，不照抄模板示例，也不把文档迁移会话冒充历史业务执行会话。
8. `- [ ]` 为未完成，`- [x]` 仅表示该条明确范围已完成；实现、检查、用户验收分别列项。部分子项完成不能勾完父项；待用户验收时应明确保留该状态，不因实现或编译通过而标为整项完成。
9. 阻塞、延后、取消使用 `#blocked`、`#deferred`、`#cut` 并写清原因；取消条目保留，不静默删除。未执行的检查保持未完成，确实不适用时说明理由。
10. 具体测试是所属功能 Issue 的子项，可沿用 `<parent>-test` ID。QA 仍是有效类型；不要只为宣布阶段完成而制造独立 QA、验证或完成定义 Issue。Phase、工作线和父子关系按实际需要记录，不再依赖 branch 标题组织任务。
11. 更新 Issue 时精准修改相关 Description、属性和对应 Comments，不为整理格式批量改写无关历史、删除或重编号既有 ID；不额外维护一套平行需求文件或执行日志。
12. 旧活动 `REQUIREMENTS.md` 与 `agent-log/` 在任务和有效证据迁入 Issue 后移除，不维护两套工作制度。保留旧 ID / 来源，完整历史可由已核实 Git 历史追溯；未跟踪或未提交的独有内容必须先保全到本次版本化来源副本。明确停用的模板档案继续只作历史，不把其中示例迁成真实任务。

## Issue 文件命名与版本关联

1. 活动文件采用 `issue_任务描述.md`，不带任何版本编号后缀。任务描述按源语言如实、连贯记录，中文不翻译，英文词用连字符；说明具体对象与动作 / 目标，不能只写 search、storage 等主题桶。文件名不放类型或旧 A-001 等编号；类型和旧稳定 ID 只留在 frontmatter，类型沿用下节 16 类含义。
2. 同一文件混装多个可独立实施 / 交付的目标时，按实际任务拆分并保留原 ID、来源、历史与真实状态。属于同一目标的实现细节、依赖和验收子项留在该任务内，不机械地逐 checkbox、逐日志创建文件。语义重名时用具体对象、范围或动作消歧，不恢复无意义编号。
3. 对应执行涉及的 Git commit hash 或 P4 changelist 记录在该条 Comment 内容里，可涉及多个 change，不设 `controlled-version` 等全局编号属性，也不写入文件名。只记录有依据的关联，不拿当前 HEAD、需求快照或文档整理提交冒充业务实施提交。
4. `recorded-version` 是可选属性，记录实际与该 Issue 有关的内容发布版本，不是 Git / P4 编号，不保证存在，也不写入文件名。
5. 没有相关 Git / P4 编号或内容发布版本时无需填占位；不为补值额外提交、fetch、切分支或扩大检查范围，不为记录文件自身 hash 连续提交或改写历史。
6. `issue/issue_template.md` 保持模板文件名与模板身份；实际 Issue 使用模板的 frontmatter、两个一级正文标题及 Comment 二级标题格式。命名与记录方式调整不改变实现、检查和用户验收的真实完成度。

## Issue 类型

类型继承旧 REQUIREMENTS 规范的含义，现由本文件定义；新增类型须经用户明确同意。

- DOC：文档、说明、协作规范、需求整理、知识库维护。
- PM：产品目标、范围定义、路线图、优先级、验收标准。
- UX：用户体验、信息架构、用户路径、交互流程、可用性。
- UI：界面视觉、设计系统、组件外观、响应式与可访问性。
- FE：前端应用、客户端界面、状态管理、前端工程化。
- BE：后端服务、业务逻辑、服务端接口、任务调度。
- API：对外或内部接口契约、协议、Schema、SDK 集成边界。
- DB：数据库、数据模型、迁移脚本、索引、查询与持久化。
- DATA：内容数据、配置数据、导入导出、数据清洗、数据质量。
- CONTENT：文案、素材、关卡、数值、运营内容等非代码内容资产。
- QA：测试策略、自动化测试、人工验收、质量检查、回归验证。
- OPS：部署、运维、监控、日志、告警、备份与恢复。
- CI：持续集成、构建流水线、发布流程、版本管理自动化。
- SEC：安全、权限、隐私、合规、密钥与敏感信息处理。
- ARCH：系统架构、技术选型、模块边界、跨模块约束。
- TOOL：开发工具、脚本、CLI、代码生成器、内部效率工具。

## 目录、文档与工作区

1. 新目录优先按交付物 / 职责命名，使用小写和连字符，按需创建，不预建空目录。既有路径不因模板自动迁移；约定文档名与 Issue 稳定 ID / 类型允许保留其规定大小写。
2. App 交付物可用 `ios/`、`macos/`、`web/`；官网用 `site/`，管理后台用 `admin/`。同一交付物的前后端可在其内部细分。Game 交付物见项目专用规则。
3. 使用既有 worktree 时，Issue 放在所操作工作区自己的根目录。可采用以下布局；它不要求项目启用 worktree，也不授权改动现有布局：
   ```text
   project-name/
     issue/                     # 不使用 worktree 时
       issue_任务描述.md
   project-name/
     existing-workspace/        # 使用 worktree 时，名称遵循现有约定
       AGENTS.md
       issue/
         issue_任务描述.md
       <deliverable>/
   ```
4. 初始化项目时选择 App 或 Game 子模板，按实际需要复制，包含适用的隐藏配置；不带入模板仓库的 `.git`、历史档案或个人 IDE 配置，不误删项目自身的 Git / CI 配置。初始化不隐含创建分支、worktree 或启用新的版本管理系统。
5. `AGENTS.md` 放协作约束、目录索引与命令；`README.md` 放对外用途、当前能力和入口；`DESIGN.md` 放视觉规范；`issue/` 放具体任务和当前状态。默认中文，术语、代码标识符和既有文件名按实际需要保留。
6. 子功能只在有独立维护需要时补充局部文档；父级索引已有入口，子级继承公共说明。任务默认共用当前工作副本的 `issue/`，用路径和关联 ID 表达子功能范围，不为每层目录另建任务系统。

## README.md 维护纪律

1. 面向第一次看到项目的读者，说明是什么、解决什么问题、当前能力、运行入口和文档指针。每段简明，不复制详细文档。
2. 协作与结构规则指向 `AGENTS.md`，任务指向 `issue/`，视觉指向 `DESIGN.md`，架构 / API / 配置参考指向对应专门文档。只链接实际存在的文件。
3. 项目用途、范围、状态或用户入口变化时更新；不把内部待办、验收细项和完整目录清单塞入 README。

## DESIGN.md 维护纪律

1. `DESIGN.md` 记录视觉设计系统：颜色、字体、间距、布局、组件、动效、响应式和可访问性约束，不承载系统架构或具体任务。
2. 视觉规则变化时按实际内容更新；没有 UI 或本次不涉及视觉规范时，不强制创建或补齐。已有“不适用”说明可保留。
3. 大幅改变设计方向且需保留旧稿时，归档到 `archive/design/` 并更新引用；不为普通样式修正批量创建历史文件。

## 版本、构建与周期维护

1. 项目版本以指定的单一权威来源为准，脚本和 CI 从该来源读取。版本递增遵循项目发布约定；没有既定要求的普通任务不自行发版或递增版本。递增时同步相关展示并在 Issue 说明依据。
2. 默认不额外生成安装包、引擎导出、压缩包或其他发布产物。用户本次要求生成时，用既有构建工具从权威源生成，不把派生产物当成第二份手工维护源。
3. 只有明确授权的周期维护才跨仓库同步、整理或提交；每个仓库独立处理，不覆盖正在变化或归属不明的内容，不 force push 或改写历史。
4. 周期复盘只读取授权时间窗内可访问的记录，区分用户习惯、通用纠正、任务纠正和推断。仅把重复、可执行、可验证且已去重的规则提炼到标准模板，并须有修改规范的授权。

# 技术栈专用规则

## Bento H5 PPT

涉及 Bento 幻灯片时，使用当前环境可用的 `bento-slides` skill 和项目约定；仅在需要该操作时检查工具，不为普通任务自动安装或更新全局 skill。

## TypeScript

1. 以仓库实际 `tsconfig`、包管理器和 scripts 为准，不猜测版本或命令。
2. 保持类型边界明确；`unknown` 先收窄，只有说明原因时才使用 `any`、`@ts-ignore` 或等价逃逸。
3. 类型检查、测试、构建和真实交互分别记录，按本次改动选择必要项目脚本。



# 项目专用规则

<!-- local-agent-template-rollout:v2.0.1-261023-173015 -->
> 通用规则来源于本地 `DDonlien/agent-template` `v2.0.1-261023-173015`。项目自己的范围、命令和技术契约继续有效；旧模板中要求 REQUIREMENTS / agent-log 双写、例行远端同步与提交的通用制度已停用。
>
> 项目任务以当前工作副本根 `issue/` 为唯一工作入口，正文维护当前事实，Comments 追加历史。旧工作文档在有可追溯迁移映射和 Git 历史 / 版本化来源副本后移除；未把历史日志机械创建为新任务。Issue 使用 Obsidian YAML frontmatter 和 Description / Comments 两个一级标题；文件名仅为 issue_原语言任务描述.md。真实 Git / P4 编号写入对应 Comment，recorded-version 仅记录可选内容发布版本。
<!-- /local-agent-template-rollout -->


## 项目概况

- 项目名称：GitTogether Standalone。
- 当前工作区：`codex-standalone-ts/`；分支：`main`，跟踪`origin/main`。2026-10-10用户指定main为后续开发和更新包来源；2026-10-12按用户要求清理本地及origin的非main分支。历史目录名仍作为命名例外保留，`main/`与`desktop-overview-split/`保存旧实现的原提交及文件，现为detached HEAD。后续从真实main工作区继续，不将旧快照目录当作最新源码。
- 以用户提供的 Wireframes v0.1 为产品范围。用户 2026-10-02 明确要求从头实现，不继承 GitButler 代码、组件、工作流或产品限制。
- 此版已接入真实账号、远端和关联worktree只读浏览，并支持用户明确请求的未关联分支下载。Commit 已按用户 2026-10-10 请求接通当前关联工作目录的真实本地提交，AI 说明使用本机已登录 Codex CLI；其余六项行尾Git动作与在线协作仍未接入执行；不能将模拟成功显示为真实Git、Push、AI服务或Presence结果。
- 用户要求 TS 与 macOS Liquid Glass。视觉参照 Apple 当前材料规范；本机 macOS 26.6.2，不能将本地运行称为已验证 macOS 27。

## 技术栈与命令

- React / TypeScript / Vite；Tauri 2桌面外壳与Rust后台；Phosphor 图标；Material 3 主题、Roboto 本地字体和 `open-glass-ui` 公共 classic/CSS 交互原语。不加载 electron-liquid-glass，不混装第二套组件库；OpenGlass 只承接可访问交互契约，不延续玻璃视觉。
- `macos/` 是同一客户端的开发与浏览器预览入口；界面状态在 `macos/src/`；桌面桥在 `macos/src/native-bridge.ts`，后台在 `macos/src-tauri/src/`。
- `npm run dev` 启动React与Rust预览；`npm run desktop` 启动Tauri开发窗口；两者择一，不能同时占用4173。`npm run check`、`npm run check:rust`、`npm run build` 分别检查当前类型、Rust编译与构建。旧后台测试只作历史参考，本轮不运行。
- 页面应有真实的内部状态变化，失败保留输入，可取消异步动作，各 worktree 状态与表单隔离，刷新后本地保存可恢复。
- 2026-10-10交付授权（2026-10-15更新AI说明规则）：检查最近需求，补齐Pull / Get Latest / Clean及后台实际Git fetch后推送main、签名、公证并发布更新。后台只fetch引用/对象，不合并或改工作文件；写动作固定用户打开时的筛选/任务范围，具体覆盖/删除/历史整理必须先预览并由应用内确认。Commit仅本地提交，Submit确认后Commit再Push；AI沿用本机CLI登录，在可用模型中优先选择最新Luna并使用最低推理档位low（无Luna时回退CLI推荐模型），只生成可编辑说明。说明生成须覆盖全部选中文件清单，聚焦明示的改动对象和内容；可用限量且相关的agent-log、issues和memory书面记录补充上下文，不推测未修改文件的影响或作冗长效果分析。保护未推送提交、其他分支、共享worktree和当前LFS，Get Latest回收须有真实磁盘证据，失败不删除原目录。Presence不属于此次范围。
- 没有明确提交/推送请求时，不执行代码commit或push。当前稳定分支为main，不再按初始orphan/unborn状态操作。

## 文档入口与范围

- `ios/` 是独立 SwiftUI 原生远端客户端；子功能说明、需求、视觉、协作和执行记录分别见 `ios/README.md`、`issue/issue_明确原生远端客户端阶段的交付范围.md`、`ios/DESIGN.md`、`ios/AGENTS.md` 与 `issue/README.md`。iOS不执行本地Git，桌面既有执行基础继续生效。

- `README.md`：产品与本地运行入口。
- `issue/issue_以固定版本GitHub Desktop原始代码替换Git与授权执行基础.md`：D-01 至 D-03、R-01 至 R-04 的功能追踪和状态。
- `DESIGN.md`：Material 3 色彩与卡片层级、字体、布局、可访问性。
- `ARCHITECTURE.md`：数据与界面边界。
- `reference/GitTogether_Wireframes/`：用户的只读设计来源。
- `issue/README.md`：本次实现与验证记录。
- 根目录是此独立客户端的唯一需求/设计维护范围，`macos/AGENTS.md` 只补充运行规则。

## 自动发布与验收范围（2026-10-10 用户持续授权）

- 用户原文：「以后推送打包发布你自动完成，公证配置要复用，校验安装包和更新源就行，不用再操作我已安装的应用或让我解锁。」后续要求交付更新时，Agent自动完成main提交/推送、打包、Developer ID签名、Apple公证、正式发布及校验，不逐步重复索要确认。这是发布流程的持续授权，不触发无关任务或仅文档修改的新安装包发布。
- 复用已保存的`gittogether-notary` profile及既有签名/GitHub发布配置，不每次重新配置或索要凭据。确有读取或授权故障时先做不泄露凭据的诊断并报告实际阻塞；不使用明文降级或绕过系统安全设置。
- 发布完成以最终安装包及公共更新源校验为准：核对已推送main/tag来源、版本、Developer ID签名、Accepted公证及staple/validate、资产完整性、大小/摘要，以及公开latest、Atom和更新清单与完整下载包的一致性。
- 不启动、操作、更新、替换或重启用户已安装的GitTogether；不要求用户解锁Mac，也不把安装版界面检查列为发布前提或完成条件。用户自行选择安装与重启。这条最新约定取代旧发布要求中的安装版操作和解锁验收步骤，保留此前实际观察的历史记录。

## 测试环境自动就绪（2026-10-07 用户持续授权）

- 用户明确要求：每次更改需要重启就重启，需要恢复就恢复，交付测试时确保全部依赖就绪。本项目的本地预览、账号服务和 GitHub 授权助手可按任务需要自动启动、恢复或重启，无需逐次询问；此规则覆盖旧条目中逐次重启许可的限制，但不扩张原功能范围。
- 不为前端热更新无故清空账号会话；确需服务更新时先说明影响，再执行必要重启。完成后核对页面、账号 API、授权助手、当前版本/实例与配置状态，保留服务运行，不能只确认页面 HTTP 200 就交付。服务缺失或不匹配由 Agent 排查、恢复，不能把启动工作转交用户。
- GitHub App 注册、公开 Client ID、回调和安全应用配置属于开发者一次性配置，不是普通用户的账号操作。使用稳定的系统加密配置自动恢复；不得为重启再次要求用户注册应用、重填回调或提交已安全保存的密钥。缺失、损坏、系统加密不可用或凭据被撤销时明确说明原因，由用户直接处理必要的敏感输入，禁止明文降级、聊天密钥重放或自动绕过权限。
- 普通 GitHub/Gitea 账号登录、GitHub 最终同意及组织审批仍由用户完成。浏览器账号目前是服务会话状态，重启需正常重连，不与应用开发配置混淆。不得把配置已恢复说成用户账号已授权。
- 授权/回调页面的等待、取消和故障测试使用隔离服务与虚构凭据；用户正在主页面授权时，不用取消其流程、重放其回调或代替同意来验证。页面HTTP可用、配置恢复、隔离页面成功与真实用户账号/仓库导入分别记录，不能相互替代。
- 只管理本项目已确认的 loopback 服务；不停止未知占用端口的进程，不修改系统代理/TLS，不建立系统开机自启动或新计划任务。原生打包、生产授权部署、Git 写操作和提交/推送仍需对应明确请求。

## 用户确认的视觉约定

- 2026-10-09（最新反馈）：收起/展开、Dashboard和设置共用悬停、按下、动效和键盘焦点样式，当前页面选中态独立保留；设置版本号在窗口右下角独立底部区域，不随内容滚动，上方内容独立滚动且不被页脚覆盖。保留原尺寸、间距、状态和账号数据；源代码修改不等于安装包更新。
- 2026-10-09（最新细节）：侧栏32px开关与首页/仓库页首卡片顶边对齐，展开时右侧显示GitTogether名称；开关到Dashboard图标框固定8px，两态纵向位置不变。普通内容卡片亮暗色均无投影，用色调与细边缘区分；菜单/弹窗保留独立层级。保留既有图标尺寸、红绿灯、可访问性与挂载状态；取代顶部无品牌/60px留白方向。
- 2026-10-09（最新）：实际客户端采用已认可的 Material 3（非 Expressive）样稿，覆盖浏览器与桌面应用。侧栏透明、融入共享画布，没有独立悬浮卡片；首页、仓库页和设置语义分组轻微浮起，表格/文件行不各自套卡。统一亮暗色、Roboto/中文系统回退、Material 控件、菜单和弹窗；不透明表面不提供无作用的减少透明度开关。此条取代2026-10-03的悬浮侧栏及后续Ring回滚/H5-only材质方向。保留真实数据、外置系统红绿灯、32px导航框、56px收起列、三栏独立开关、12px内容内缩、隐藏滚动条与所有选择/草稿/安全边界；原生包另行打包。
 


## 历史：Tauri与Rust迁移方向（2026-10-11）

- 用户明确要求后台也使用Rust。当前桌面入口为macos/src-tauri，React通过有限Tauri命令调用同进程Rust；浏览器开发也使用Rust服务。生产禁止Electron或Node业务sidecar。旧electron/server源码及旧后台测试仅保留历史参考，不能进入生产包或冒称Rust回归。
- 沿用Material 3、原bundle ID、Developer ID、数据目录及账号/目录关联；兼容旧加密文件和固定偏好键，不将真实用户升级等同于源码编译。Git CLI与Git LFS从Rust调用，保留正常钩子、签名及用户配置。
- 正式main打包继续完整签名、公证、发布和公共回读；同时提供旧Electron过渡ZIP/清单与Tauri最终tar/签名/清单。更新私钥仅存仓库外，不输出或打包，未来版本继续匹配内置公钥。开发版不安装更新。
- 延续发布持续授权和安装版不操作约定；本次不新增或运行测试，执行类型/Cargo检查、生产构建及包和公开更新源校验。

## Windows 双架构发布（2026-10-12，最新用户要求）

- 用户原文：「下一个版本开始一并打包 Windows 的 x86 和 x64 版本」。从下一次正式版本发布起，macOS Apple Silicon、Windows x86（32位）和Windows x64（64位）属于同一次交付，使用相同产品版本和已推送main源码提交/tag；不因当前客户端目录名为macos而遗漏Windows。
- Windows沿用同一React/Tauri/Rust客户端，分别使用i686-pc-windows-msvc与x86_64-pc-windows-msvc构建真实的32位/64位应用，优先在Windows原生构建环境生成NSIS安装包。发布资产明确标识Windows-x86与Windows-x64，并与macOS资产归入同一个GitHub Release。
- 下一次发布前补齐Windows系统加密存储、用户数据路径、Git/Codex工具查找、文件权限/链接、子进程取消及系统打开等当前macOS/Unix专用实现；编译成功不能替代安装包架构、内容和真实功能核对。不把仅添加构建参数或记录规则称为Windows支持已经完成。
- 正式发布验收同时覆盖两种Windows架构：源码/版本一致、实际主程序架构、完整安装包大小与摘要、更新签名，以及latest.json中windows-i686和windows-x86_64的公开下载/签名。复用仓库外更新签名配置，保留macOS既有Developer ID、公证及过渡更新资产；缺少任一Windows包或校验失败，不能把该次完整发布标为完成，须报告具体缺口。
- 延续自动提交/推送/发布的持续授权和不操作用户已安装GitTogether的约定。本次只更新未来发布范围，不为规则变更单独递增版本或发布安装包；实际Windows适配与打包验收跟踪RUN-01-windows-packaging。

## Presence商业与身份方向（2026-10-12，用户要求）

- GitTogether继续公开客户端源码，开源许可证尚待选择；GitPresence源码仓库当前private。公共客户端只依赖公开协议，不要求用户能访问私有仓库。
- 个人Docker最多一个Presence账号，可绑定多个仓库/设备，不提供组织空间或跨账号管理；Git平台组织仓库有权限即可绑定，不等同Presence组织管理。组织付费服务计划部署NAS的独立Presence实例，用组织ID、成员关系和明确纳管项目隔离，不能只凭账号名称或同仓库推导权限。
- 本轮独立账号使用邮箱/密码，平台Git凭证留在目标设备；GitHub/Gitea直接登录Presence、官网Docker分发、组织邀请/计费/控制台和许可协议仍独立验收。用户提出未来商业模式不代表这些已发布，也不自动改变现有仓库可见性。

## Presence自动管理纠正（2026-10-12，COLLAB-03）

- 本轮用户八点纠正取代个人仓库勾选、客户端团队选择和单仓库单组织的旧说明。一个实例一个账号；全部当前Git身份可访问的仓库自动登记，匹配组织成员及完整仓库地址后自动使用组织范围。
- 账号归属登录服务，其他服务器明确配置受信任签发者并验证同一身份；不按邮箱合并，不转发归属密码/会话。组织、服务器、工作区和命令修订各自隔离。
- 组织所有者在Web维护成员/仓库；绑定同时要求Git仓库ownership，Git平台角色不自动变成Presence角色。同仓库多组织允许且不合并。密码修改也在Web；客户端只保留开关、唯一账号及服务器地址列表，托管信息归回Dashboard/详情。


## 历史：GitHub Desktop 执行方向（2026-10-18，已于2026-10-26取代）

- 用户指定分支 `github-desktop-based`，工作区与 main 平级；不得将本分支自行合并回 main。
- 本分支以 `desktop/` 中固定版本 GitHub Desktop 原版代码为运行基础，取代此前 Tauri/Rust 后台方向。所有标准 Git、授权、凭据和后台行为直接使用原版；扩展严格限于现有 UI、Submit、Clear、Get Latest 和 Presence。
- 保留 `macos/src/` 的 Material 界面；不把旧 server/electron/src-tauri 的 Git、账号和定时后台重新挂入启动、构建或发布链。
- 根 package.json 为版本来源；根 `npm run setup/check/build/dev` 为有效入口。`desktop/` 是有来源锁的上游副本；上游仅允许有来源锁的界面展示替换、产品身份和编译配置差异；Git、授权、凭据和后台执行代码不得改写。用 `npm run verify:upstream` 核对。
- 当前分支允许与替换相关的类型、构建、来源和隔离真实 Git/原生运行验证；旧文档对其他交付的“不新增/运行测试”不限制本次替换验收。测试不得写入用户仓库或代用户授权。
- 详细边界和命令见 docs/github-desktop-based.md；需求与执行证据统一在根 issue/，正文维护当前事实，Comments 追加历史。未要求提交、推送、合并或发布，不据历史持续授权发布此实验分支。
- 2026-10-18补充：全部原版视觉界面均须由 GitTogether Material 展示层替代，包括授权、安全确认、错误、冲突、设置、更新与崩溃恢复。原版业务控制器与执行回调保留；允许有来源校验的纯展示代码差异。禁止继续挂载原版主界面或以遮挡/隐藏旧弹窗冒充替换。
- 2026-10-21用户明确要求：main正式交付须补齐签名、公证、发布和自动更新，保证现有0.33.0可升级；以后“推送打包”均指完整正式发布，不得只交付开发包。沿用原版更新执行器，允许必要的产品更新源和平台打包配置差异；保留旧更新格式兼容，不恢复旧Git/授权后台，不操作用户安装版。

## Tauri 2-only production correction (2026-10-26, latest user request)

- This explicit instruction supersedes the 2026-10-18/10-21 GitHub Desktop runtime and legacy Electron update directions: production development, validation, packaging, releases, and in-app updates use Tauri 2 with the Rust backend only.
- Root npm entry points must route to `macos/`; `macos/package.json` must not depend on Electron tooling. Release assets contain the Tauri app archive and Tauri-signed packages, with `latest.json` as the updater manifest. Do not generate `latest-mac.yml`, Electron binaries, Squirrel packages, or Electron updater feeds.
- The old `desktop/` and `macos/electron/` trees may remain as historical source, but never enter setup/build/package/release commands. The macOS ZIP contains the same Tauri app as the signed updater tarball. Its established filename is retained for possible older-client discovery; do not claim automatic Electron-to-Tauri migration until it is accepted.
- Do not claim the installed 0.37.0 app is Tauri: local production logs identify it as Electron. Keep source changes, package acceptance, public release, and installed-app acceptance separate; do not operate the installed app.
