---
target-repo-type: app
language: zh-CN
version: "v1.4.0-260817-103337"
source: "https://github.com/DDonlien/agent-template/blob/main/app-agent-template/AGENTS.md"
---

# 通用规则

本模板将协作约束分为通用规则、技术栈专用规则和项目专用规则。复制到实际项目后，保留通用规则，按实际技术栈和项目内容填写后两部分。

## 代码清洁规则

1. 优先遵循仓库已有技术栈、目录结构、命名和风格。
2. 保持改动聚焦在用户请求范围内。
3. 不覆盖用户改动，不回滚无关文件。
4. 行为、共享逻辑或用户可见流程发生变化时，补充或更新测试。
5. 交付前运行相关验证命令；如果无法运行，说明原因并记录剩余风险。
6. 搜索优先使用 `rg`。
7. 手工编辑文件优先使用补丁方式，避免产生无关格式化或大范围重写。
8. 未经当前环境实际运行的验证（编辑器、Playtest、打包、真实浏览器交互等），不得在文档或需求中标记为「已通过」。
9. 编译通过、公式复算、物理收敛、回归断言等属于不同验证维度，需分别执行并分别说明，不能以其中一项替代其他；CI 或自动化检查通过不能替代本地实际验证。
10. 提交按需求边界划分：一个需求完成并通过对应验证后独立提交，commit message 携带该需求的稳定 ID；不得在一个长期未提交的工作区中并行堆积多个需求，导致改动无法按需求边界回溯或回滚。
11. 纯文档重组、纯参数调优与行为变更尽量分开提交。
12. 默认只创建本地提交，不自动执行 push、submit 等发布动作，除非用户明确要求。
13. 静态分析无法确认的内容（如运行时行为、数据状态）必须标注为推断，不得作为精确事实输出。
14. 注释应解释设计意图（WHY）而非单纯复述行为（WHAT）；可调参数的注释必须写清默认值的实际效果和调整范围；修改默认值、公式或安全上限时，必须同步更新注释。
15. 重命名、移动或编号类改动后，必须全局检查相关引用、链接、脚本参数和文档示例，不留失效引用；涉及编号的条目检查跳号、重复与顺序一致性。
16. 复杂流程按阶段执行，每阶段定义显式的「退出条件」，核对通过后才进入下一阶段。

## 目录与文件命名规则

1. 顶层目录应优先按照"交付物 / 职责"命名，而不是按照技术栈命名。目录名应该先回答"这个目录是什么用途"，而不是"它使用什么语言或框架"。
2. 客户端形态应按交付平台或使用场景命名，例如：
	1. Swift 原生 iOS 应用命名为 `ios/`。
	2. macOS 原生应用命名为 `macos/`。
	3. `web/` 仅用于真正的 Web App，并与 `ios/`、`macos/` 等客户端形态并列。
3. 官网、宣传页、落地页应命名为 `site/`；管理后台应命名为 `admin/`；不要因为它们使用 TypeScript 就命名为 `ts/` 或 `ts-web/`。
4. 如果某个交付物内部同时包含前端和后端，应在该目录下继续做二级拆分，例如 `site/frontend/` 与 `site/backend/`，而不是在顶层直接按技术栈或服务类型拆散。
5. 只有当目录职责本身无法清楚表达，或者同一职责下存在多个技术实现时，才允许在名称中补充技术栈信息。
6. 目录名应保持小写，使用连字符 `-` 分隔单词，避免重复项目名，也避免使用 `project` 这类信息量较低的泛称。
7. 本节规则只约束新建内容；已有历史文件不因本节规则自动迁移、改名或重构，结构调整视为独立需求，需用户明确要求。
8. 文件与目录名应兼容 Git 与跨平台文件系统：不使用空格、中文路径名、大小写混合或特殊符号；目录按需创建，不预建空目录。

## 仓库规范化

1. 默认只在项目专用规则中补充或调整；只有用户明确要求修改协作规范时，才修改通用规则。
2. 如果当前仓库或当前子功能根目录没有 `AGENTS.md`，先阅读 `agent-template/AGENTS.md`，并在当前适用目录创建属于该目录自己的 `AGENTS.md`。
3. 如果没有 `REQUIREMENTS.md`，先阅读 `agent-template/REQUIREMENTS.md`，并在当前适用目录创建属于该目录自己的 `REQUIREMENTS.md`。
4. 如果没有 `DESIGN.md`，先阅读 `agent-template/DESIGN.md`，并在当前适用目录创建属于该目录自己的 `DESIGN.md`。
5. 如果没有 `README.md`，先阅读 `agent-template/README.md`，并在当前适用目录创建属于该目录自己的 `README.md`。
6. 如果仓库内已有内容，或已经与当前 Agent 进行过对话，基于仓库内的内容和对话的实际情况，填写上述文件，填写规则会在下文中写明。
7. `AGENTS.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `README.md` 默认使用中文书写；除非用户特别说明，或术语、代码符号、专有名词本身应使用英文。
8. `agent-template/` 中的 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 日志模板只保留演示内容；具体撰写规则统一以本 `AGENTS.md` 为准，阅读时需要注意分辨规则和示例的差异。
9. 上述创建的文件名必须全大写；其中 `AGENTS.md` 和 `REQUIREMENTS.md` 必须使用复数形式。即使用户临时写成小写或单数，也应遵循该统一标准，除非用户明确要求修改。
10. 由于本 template 本身也由 Git 管理，复制到实际仓库使用前，应先删除 `agent-template/` 中的 `.git` 等 Git 相关资产，移除其仓库特征，避免影响上层仓库管理。同时清理 `agent-log/` 中除日志模板文件 `yyyymmdd-hhmmss-utcpn-username-modelname.md` 以外的历史日志，避免把模板仓库的执行上下文带入新项目。
11. 如果当前要初始化的是 Game 项目，必须改用 `game-agent-template/`，并在新项目仓库中默认启用 Git LFS；模板自带的 `.gitattributes` 必须一并复制到项目根目录，不得删改为普通 Git 跟踪，除非用户明确要求调整。
12. Game 项目初始化时还必须一并复制模板自带的 `.gitignore`；`.gitignore` 负责忽略引擎缓存、构建产物、中间文件和其他不应入库的派生内容，规则应与资产管线、引擎和 `.gitattributes` 的跟踪边界保持一致。

## Agent Template 更新规则

1. 本节只约束 agent-template 元模板及其 app/game 子模板文件本身的维护，不替代复制到实际项目后的项目专用规则；各规则按模块适用性判断，不因标题或条目顺序而默认执行。
2. `source` 元数据必须指向对应模板文件的 canonical GitHub 链接，并作为检查模板更新的来源。
3. 修改任一子模板的通用规则时，必须同步更新 app-agent-template/AGENTS.md 与 game-agent-template/AGENTS.md 的对应通用章节；仅适用于单一技术栈的规则留在对应模板。
4. 每次修改 AGENTS.md 的模板结构、规则或元数据时，必须递增语义版本号，并将时间戳更新为本次修改完成时间。
5. 每次任务开始时，应检查 `source` 指向的模板文件是否有更新；如果 source 的模板版本或通用内容更新，先按以下规则同步通用部分，再重新阅读更新后的 AGENTS.md 和相关文档：
	1. 只同步 source 中的通用规则，保留当前项目的技术栈专用规则、项目专用规则和用户已有改动。
	2. 如果本地通用规则也有未提交改动并与 source 冲突，不静默覆盖；保留本地改动，记录冲突并请求用户决定合并方式。
	3. source 无法访问时，记录无法检查的原因和剩余风险，不得声称已经确认 source 没有更新。
6. 两份模板的元数据只保留 target-repo-type、language、version 和 source；同步 source 后，按 source 的模板版本更新本地 version 和 source。
7. 模板文件的结构调整必须保留原规则语义、稳定引用和适用范围；完成后检查章节、链接、条目编号和两份通用内容的一致性。
8. 修改项目专用内容占位时，示例必须清晰、可替换，不得把某个实际项目的路径、凭证、分支状态或运行结果写入模板。
9. 新增模板类型时，必须参照现有子模板补齐 AGENTS.md、README.md、REQUIREMENTS.md、DESIGN.md 和 agent-log/，并在顶层索引中登记。
10. 修改 game-agent-template/universe/ 时，先阅读 universe/AGENTS.md，并同步更新 Game 模板中的子功能索引。
11. 模板仓库的 agent-log/ 保留完整演进历史；复制到实际项目时只保留日志模板占位文件，并按仓库规范化规则清理模板仓库痕迹。

## 每次任务开始前

1. 确认当前工作目录、分支和 worktree 是否符合用户本次明确指定的工作目标。
2. 如果用户已经明确指定 feature、branch 或 worktree，且当前目录不匹配，Agent 可以按项目规则为用户进入已有 worktree，或创建对应 branch/worktree 后再执行任务。
3. 如果用户没有明确指定目标分支或 feature，Agent 不得自行猜测并切换分支、创建分支或创建 worktree；应在当前分支继续，或停止并询问用户。
4. 如果当前工作区存在未提交改动，Agent 不得切换分支、移动 worktree 或创建会覆盖现有路径的 worktree；必须先告知用户当前状态。
5. 在 Git worktree 模式下，优先通过"进入已有 worktree"或"创建新的 worktree"来切换工作上下文，而不是在已有 worktree 内执行 `git checkout` / `git switch`。
6. Agent 严禁在未获得用户明确授权的情况下执行 `git reset --hard`、`git clean`、`git branch -D`、`git worktree remove`、`git worktree move` 等破坏性命令。
7. Git 同步预检规则：
	1. `git fetch --prune`、`git merge --ff-only` 等同步操作需要直接访问远端仓库，**不应在断网或沙箱环境中静默执行**；如果当前执行环境默认禁止联网，应提示用户切换到允许网络访问的模式，否则无法完成同步预检。
	2. 如果当前目录属于 Git 仓库，任务开始前先执行 `git fetch --prune`，只更新远端追踪信息，不直接修改本地工作区。
	3. 然后检查当前分支是否设置了 upstream；如果没有 upstream，只记录当前分支状态，不执行 pull、merge 或 rebase。
	4. 检查当前分支相对 upstream 的 ahead / behind 状态：
		1. 如果没有落后远端，继续执行任务。
		2. 如果本地没有未提交改动，且当前分支只落后远端，则执行 `git merge --ff-only @{u}`，只允许快进更新。
		3. 如果本地存在未提交改动，先比较"本地已改文件"和"远端新增变更文件"是否重叠：
			1. 如果没有重叠，可以执行 `git merge --ff-only @{u}`。
			2. 如果存在重叠，停止执行并告知用户哪些文件同时被本地和远端修改。
		4. 如果当前分支同时 ahead 和 behind，不自动 merge、不自动 rebase，停止执行并告知用户需要人工决定同步方式。
	5. Agent 不主动执行普通 `git pull`，因为普通 `git pull` 可能隐式 merge 或 rebase，导致超出用户预期的历史变化。
8. 如果发现当前分支、worktree、目录位置或任务基准不符合用户本次明确指定的工作目标，必须按上述规则处理，不得自行猜测目标上下文。
9. 阅读用户本次原始 prompt。
10. 读取当前适用的 `AGENTS.md`（若缺失，先按“仓库规范化”创建）及其 `source` 元数据，检查 source 指向的模板文件是否有更新；检查和同步必须遵循 Agent Template 更新规则。
	1. 如果 source 的模板版本或通用内容更新，先同步通用规则，并保留当前项目的技术栈专用规则、项目专用规则和用户已有改动。
	2. 如果本地通用规则与 source 存在未提交冲突，不静默覆盖；记录冲突并请求用户决定合并方式。
	3. 完成同步或确认没有可用更新后，再阅读更新后的 `AGENTS.md`、`README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 中的相关日志，然后执行用户任务。
	4. 如果 source 无法访问，记录原因和剩余风险，不得把未完成的检查当作已确认无更新。
	5. 阅读日志的规则如下：
		1. 找到由当前 Agent / 对话创建的最新日志。
		2. 如果有任何日志比该日志更新，阅读所有更新。
		3. 如果没有，则不阅读任何日志。
		4. 如果无法可靠判断"当前 Agent / 对话创建的最新日志"，则阅读最近 3 条日志，或阅读最近 7 天内的日志，并由 Agent 根据任务相关性取舍。
11. 检查 `REQUIREMENTS.md`，确认用户本次需求是否匹配已有需求、子需求、验收项或已标记的阻塞项。
12. 如果仓库内有父级与子级 `AGENTS.md`，从父到子依次阅读；更具体目录的规则优先，但不得违反父级通用规则和用户明确要求。

## 每次任务执行中

1. 为每次任务执行创建一条新的执行日志，放在当前适用目录的 `agent-log/`。
2. 如果本次任务没有修改任何仓库文件，且只是解释、咨询、排查思路或一次性问答，可以不创建执行日志；但如果用户明确要求记录，或本次对话形成了新的需求、设计决策、技术约束，则仍应更新对应文档或日志。
3. 日志命名规则：`YYYYMMDD-HHMMSS-utcpN-username-modelname.md` 或 `YYYYMMDD-HHMMSS-utcnN-username-modelname.md`。
4. `utcpN` 表示 UTC 正偏移，`utcnN` 表示 UTC 负偏移；不要在文件名中使用 `+` 或 `-`，以确保不同系统和工具链的适配性，N 由实际数字代替。
5. `username` 使用当前执行者或系统用户名称。
6. `modelname` 必须使用本次执行实际使用的模型名称，且必须精确到具体的模型版本标识（例如 `claude-fable-5`、`gpt-5-6`），不得只写产品线或家族名（例如 `claude`、`gpt-5`），不得使用占位符、假设值或与其他模型混淆的名称；空格、斜杠、冒号、小数点等不适合作为文件名的字符统一替换为连字符 `-`。
7. 如果运行环境只暴露家族名，应先确认实际模型版本；确实无法获得更具体版本时，使用能获取到的最具体标识，并在日志正文说明原因。
8. 示例（仅说明格式，`<modelname>` 应替换为真实模型名）：`20260530-174209-utcp8-taobe-<modelname>.md`。
9. 使用任务完成时间作为日志文件名中的时间；如果任务开始时先创建临时日志，交付前按完成时间重命名。
10. 一次任务执行从 Agent 开始处理用户请求算起，到交付、提交、阻塞或明确暂停为止。
11. 如果用户在同一次执行中补充或修正要求、引导对话，把补充 prompt 原文和时间追加到同一条日志。
12. 如果上一次执行已经交付，用户提出新任务时创建新日志。
13. 每条日志记录一次任务执行中的对话、行动和总结；中间过程可由 Agent 自行概括，但要足够支持后续接手。
14. 每条日志开头必须包含：
	1. 用户原始 prompt
	2. 执行本次任务的具体模型版本，与文件名中的 `modelname` 一致
	3. 启动运行时的分支和版本，也就是 Git 同步预检后实际所在分支与提交版本
	4. 任务开始时间
	5. 任务结束时间
	6. 任务结束时是否执行了提交
15. 每条日志还应包含：
	1. 已阅读上下文
	2. 对话与行动记录
	3. 完成工作
	4. 更新的需求 ID
	5. 更新的 README 或 DESIGN 章节
	6. 验证方式
	7. 备注
16. 日志模板文件只保留演示内容；日志命名、必填字段、撰写规则以本 `AGENTS.md` 为准。
17. 日志中的对话与行动记录应保留完整时间线：用户原始 prompt、补充与纠正、对结果的质疑、双方形成的判断与设计决策、行动结果、测试结果和未解决问题；不能只记录最终代码摘要而省略导致决策的对话。
18. 归档前把对话内容归属到 `REQUIREMENTS.md` 中最具体的稳定需求 ID；日志不能替代 `AGENTS.md`，`AGENTS.md` 也不能替代完整时间线。
19. 交付前检查「对话 → 需求 ID → 文档 / 日志」链路是否完整。

## REQUIREMENTS.md 维护标准

1. `REQUIREMENTS.md` 使用 Obsidian 原生友好的 Markdown 格式：标题层级、缩进任务列表、稳定 ID、少量标签。
2. 每条需求的描述文字必须是自然、直白、清晰、能顺畅读下去的完整句子，读者不需要反复回读或拆解缩写才能看懂；技术标识符（类名、方法名、参数名、数值）可以保留在反引号中，但连接标识符的必须是正常的中文句子，不是电报体或堆砌的短语。
3. 标记 `#cut`、`#deferred`、`#blocked` 时，要把完整的前因后果写成一句连贯的话，不要截取一小段原文单独打标签。
4. 需求中引入简称或代号时，第一次出现必须顺带说明它具体如何运作，不要只写代号本身；宁可稍微啰嗦，也不要让读者需要额外解码专有名词才能理解需求。
5. 不使用复杂表格。
6. 不使用 YAML 字段。
7. 通过标题分级拆分 Phase、branch/worktree 和 feature；Phase 命名、三级标题格式和 task ID 结构应遵循后文规则。
8. 更频繁地通过缩进 checkbox 表达父子任务、子任务、验收项和检查点关系。
9. 每个可执行需求必须有稳定 ID。
10. 任务状态使用原生 Markdown checkbox：
	1. `- [ ]` 表示未完成。
	2. `- [x]` 表示已完成。
	3. 阻塞、延后、取消在任务后追加 `#blocked`、`#deferred` 或 `#cut`。
	4. 如果条目本身不适合涵盖已完成、未完成的信息，但确实需要被记录，则checkbox视作是否已读。
	5. 如果条目本身既不适合记录是否已读、也不适合记录完成状态，但确实需要记录，则酌情使用有序、无序列表。
11. 稳定 ID 不因排序、插入或移动而改变。
12. 拆分任务时保留原 ID，并新增子 ID。
13. 不静默删除需求；取消的需求保留并标记 `#cut`，附简短原因。
14. 每次任务开始前，先检查 `REQUIREMENTS.md` 中是否已有匹配需求。
15. 每次任务完成后，再根据本次记忆或重新检查 `REQUIREMENTS.md`，把已经完成的需求、子需求或验收项勾选为完成。
16. 如果任务改变范围、状态、验收标准、优先级或阻塞条件，必须同步更新 `REQUIREMENTS.md`。
17. 具体需求、验收标准、任务拆分、优先级、阻塞状态和完成状态只写入 `REQUIREMENTS.md`，不要写入 `README.md` 或 `DESIGN.md`。
18. 需求文档只收录用户可直接或间接感知的条目：功能、UI、可观察行为、面向用户的文档与质量门槛；纯内部工程事务（清理警告、内部重构、目录整理等）不单独收录为需求，由具体功能任务的完成定义或独立的清理任务处理。
19. 工程卫生基础设施（CI、linter、formatter、开发入口、测试基建等）属于用户可间接感知，可登记为顶层条目；但具体测试用例作为所属功能任务的子任务记录，ID 形如 `<parent>-test`（例如 `[0.4.0-DATA-A-001-test]`），完整验收由功能任务、测试子任务与完成定义共同组成。
20. 不设 QA、完成定义、验证类顶层条目；「阶段是否完成」性质的区块不进 `REQUIREMENTS.md`，阶段收尾状态由功能任务及其完成定义表达。
21. 修改 `REQUIREMENTS.md` 时，必须使用精准的局部修改，例如 patch、特定行替换或围绕目标 task 的小范围编辑。
22. 严禁为了整理格式、重新排序或"优化表达"而单次大范围重写未涉及的 Phase、feature 或 task 历史。
23. 除非用户明确要求重构需求文档，否则不得删除、合并、重编号或改写已有稳定 ID。
24. 当用户通过对话反馈或新增需求，且该需求需要进入核心实现（例如应用代码、业务逻辑、数据结构或界面流程）时，应先将其整理为一条 requirement，再开始执行。新增 requirement 应优先归入现有 Phase；如果适合挂在已有 feature 或已有任务下，应由 Agent 自行判断并归入，不需要额外确认。若需要新建 Phase，或新增三级 feature 标题会影响 branch/worktree 规划、项目范围或 Phase 结构，必须先征询用户确认；如果只是把用户已经明确提出的需求归入一个自然的新 feature，且不涉及实际创建分支或 worktree，可以先记录，并在日志中说明原因。
25. 条目的命名规则严格按照如下描述：
	1. # 一级标题总是用于区分大的段落，例如哪部份是真的任务，哪部份是示例；真正的任务记录内容总是在第一个一级标题 #任务清单 下
		1. 对于非任务清单下的内容，暂时不做特别约束，以项目为标准自行设计
	2. ## 二级标题总是以 Phase 为单位区分，格式形如 `## Phase - v0.1.0 - xxx`；其中 `xxx` 可以按照实际情况填写该 Phase 的核心内容。
	3. ### 三级标题总是以 feature 为单位区分，格式形如：`### branch-name: feature description`。
		2. `branch-name` 同时表示该 feature 对应的 branch/worktree 名称，应保持 `a/b` 的两段式格式。
		3. `a` 表示较稳定的大类、子系统、业务域或工作线；`b` 表示该大类下的具体分支名。
		4. 如果暂时无法明确 `b`，使用 `main`，例如 `sub/main`；这样可以保留后续扩展为 `sub/xxx` 的空间。
		5. 标题中的分隔符统一使用半角冒号加空格 `: `，不要使用中文全角冒号。
		6. 冒号后的 `feature description` 描述该 branch 大类下一个用户可感知的完整 feature 或工作主题，例如 `添加 codex 订阅支持`。
		7. feature 应描述用户、使用者或维护者能够感知到的能力、流程、页面、接口、内容包或交付物；不要用 `docs/main`、`qa/main` 这类任务分类替代 feature，除非项目本身的用户可感知功能就是文档、日志、测试报告等内容。
		8. 一个 branch/worktree 下可以包含多个 feature，因此同一 Phase 内可以出现多个相同 `branch-name` 的三级标题，但冒号后的 feature description 必须不同。
		9. 如果新增三级 feature 标题会影响 branch/worktree 规划、项目范围或 Phase 结构，必须先征询用户确认；如果只是把用户已经明确提出的需求归入一个自然的新 feature，且不涉及实际创建分支或 worktree，可以先记录，并在日志中说明原因。将新 task 归入已有 feature 时，由 Agent 根据语义自行判断即可。
		10. 示例：
			1. `### sub/main: 添加 codex 订阅支持`
			2. `### sub/main: 整理订阅状态展示`
			3. `### ui/profile: 重构用户页信息架构`
	4. 三级标题以下不再继续拆分标题；所有具体事项都以 task 形式记录。每条 task 必须使用稳定 ID，并保持如下结构：
		11. `[ ] \[0.1.0-DOC-A-001] 整理需求文档`
	5. task ID 中的 `DOC-A`、`FE-A` 等表示具体任务分类，不属于 feature name；一个 feature 下可以包含多个分类、多个 task。
		12. 分类前缀用于表达 task 的工作类型；字母后缀用于区分同一 feature 下相同分类的多组 task。
		13. 同一 feature 内，同一分类的字母后缀按出现顺序递增；不同 feature 可重新从 `A` 开始。即使某类 task 只有一组，也默认使用 `A` 后缀。
		14. 除非必要，否则不新增分类前缀；如果需要创建，咨询用户。可用分类前缀如下：
			4. DOC：文档、说明、协作规范、需求整理、知识库维护。
			5. PM：产品目标、范围定义、路线图、优先级、验收标准。
			6. UX：用户体验、信息架构、用户路径、交互流程、可用性。
			7. UI：界面视觉、设计系统、组件外观、响应式与可访问性。
			8. FE：前端应用、客户端界面、状态管理、前端工程化。
			9. BE：后端服务、业务逻辑、服务端接口、任务调度。
			10. API：对外或内部接口契约、协议、Schema、SDK 集成边界。
			11. DB：数据库、数据模型、迁移脚本、索引、查询与持久化。
			12. DATA：内容数据、配置数据、导入导出、数据清洗、数据质量。
			13. CONTENT：文案、素材、关卡、数值、运营内容等非代码内容资产。
			14. QA：测试策略、自动化测试、人工验收、质量检查、回归验证。
			15. OPS：部署、运维、监控、日志、告警、备份与恢复。
			16. CI：持续集成、构建流水线、发布流程、版本管理自动化。
			17. SEC：安全、权限、隐私、合规、密钥与敏感信息处理。
			18. ARCH：系统架构、技术选型、模块边界、跨模块约束。
			19. TOOL：开发工具、脚本、CLI、代码生成器、内部效率工具。

## README.md 维护纪律

1. `README.md` 是项目对外的第一印象；它的目标读者是**第一次看到这个项目的人**，因此要让人愿意继续读下去。
2. `README.md` 应聚焦"是什么 / 解决什么问题 / 当前状态 / 关键设计 / 入口文件 / 文档指针"这五到六件事，按读者关心的顺序组织；不要把所有信息塞进同一份文档。
3. `README.md` 不应承担以下内容的承载职责；这些内容应放入**专门文件**，README 最多用一两句话提及并附 Markdown 链接：
	1. 仓库结构、目录索引、文件清单 → `AGENTS.md` 的"项目专用规则"或专门的 `STRUCTURE.md`
	2. 工作台、维护规则、协作流程、agent 角色 → `AGENTS.md`
	3. 详细案例、章节速览、剧情梗概、关卡结构 → `canon/` `writing/outline/` 或 `wiki/`
	4. 创作参考、对位作品、风格定位、参考作品 → `reference/`
	5. 视觉规范、组件外观、UI 样式、设计 token → `DESIGN.md`
	6. 任务清单、需求追踪、验收项、阻塞状态 → `REQUIREMENTS.md`
	7. 完整命令清单、API 参考、配置项 → 专门的 `docs/` 或代码注释
4. README 适合**指向**而不是**详述**。每段尽量用 1–3 句话概括核心，然后用 Markdown 链接指向详细文件；不要把详细文件的内容复制粘贴到 README。
5. README 的语气**对外、对读者友好**；避免堆砌结构图、技术细节、内部术语和只对自己人有意义的缩写。第一次出现术语时，附简短说明。
6. 当项目范围、关键设计、入口文件、当前状态或用户入口发生变化时，同步更新 `README.md`。
7. 不要把具体待办、验收项、目录结构、协作规范、任务状态、案例速览、创作参考写进 `README.md`；这些内容写入其他专门文件。
8. 当你不确定一段内容应该放在 README 还是其他文件时，问自己："这是给第一次看这个项目的人看的吗？" 如果不是，放到专门文件里。

## DESIGN 维护纪律

1. `DESIGN.md` 不是系统整体设计文档；它是视觉规范和界面风格文档。
2. `DESIGN.md` 参考 Google Stitch / DESIGN.md 的语义：用 Markdown 描述 AI 和开发者可执行的视觉设计系统，包括颜色、字体、间距、布局、组件样式、视觉语气、响应式规则和可访问性约束。
3. 如果该文件在首次创建时仓库中已有内容、或者已有 Agent 对话记录，则应该根据已有内容总结并创建符合实际情况的文件。
4. `DESIGN.md` 用于让 AI 在实现 UI 时不猜测视觉风格；它不记录系统架构、数据模型、产品路线图或任务列表。
5. 当品牌视觉、UI 风格、设计 token、组件外观、布局原则或可访问性规则变化时，同步更新 `DESIGN.md`。
6. 如果项目没有 UI 或视觉界面，`DESIGN.md` 可只记录"不适用"和原因。
7. 如果仓库中已有旧名 `DESIGNS.md` 且内容其实是系统/架构说明，后续整理时应迁移：系统/仓库/应用说明进入 `README.md`，视觉规范进入 `DESIGN.md`，具体需求进入 `REQUIREMENTS.md`。
8. 如果项目的设计风格发生了大幅度、颠覆性的改变，应该将老版本的内容创建为一个 `DESIGN-yyyymmddhhmmss.md` 的文件，保存到根目录 `archive/design/`；如果该地址不存在，则创建。

## 父子文档关系

1. 如果仓库内有明显的多个子功能、子应用、子游戏、工具包或独立模块，应在根目录和每一层子功能根目录创建一套文档：
	1. `AGENTS.md`
	2. `README.md`
	3. `REQUIREMENTS.md`
	4. `DESIGN.md`
	5. `agent-log/`
2. 根目录 `README.md` 描述全局目标、共享约束、目录索引和跨子功能关系。
3. 子功能 `README.md` 只描述该子功能独有的用途、入口、命令和边界，避免复制父级已有内容。
4. 子功能 `DESIGN.md` 只描述该子功能独有视觉规范；如果沿用父级视觉规范，写明继承关系即可。
5. 父级 `AGENTS.md` 必须索引子功能目录，并说明每个子功能的文档入口。
6. 当一个任务只影响某个子功能时，优先更新该子功能的 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/`；如影响全局规则或跨子功能关系，再同步更新父级文档。
7. 如果仓库中存在 `reference/`、`references/`、`third_party/`、`vendor/`、`examples/`、`project/` 等目录，并且其中嵌套了外部 GitHub 仓库、参考项目、示例项目或只读资料，这些目录不需要创建本规范涉及的文档；更新 `README.md`、`REQUIREMENTS.md`、`DESIGN.md` 和 `agent-log/` 时也不把这些外部参考仓库纳入项目自身范围，除非用户明确要求整理或改造这些目录。

## Worktree 工作目录模式

1. 对于使用 Git worktree 的项目，推荐采用"项目容器目录不直接开发，`main` 有独立工作区，其他分支与 `main` 平级"的结构：
2. 代码片段：
	```text
	<project-name>/              ← 项目容器目录，只收纳工作区，不作为任何分支的开发工作区
	├── <project-name_branch-name-1>/
	│   ├── .git/                ← Git 元数据
	│   ├── AGENTS.md
	│   ├── README.md
	│   ├── REQUIREMENTS.md
	│   ├── DESIGN.md
	│   └── <deliverable-dir>/   ← 项目交付物目录
	│
	├── <project-name_branch-name-2>/  ← 其他分支工作区
	├── <project-name_branch-name-3>/
	└── _builds/                 ← 本地打包产物，不进 Git
	```
3. `<project-name>/` 是项目容器目录，只负责收纳 `main/` 和其他 branch worktree，不直接作为任何分支的开发工作区。
4. `main/` 默认对应仓库默认主分支工作区；GitHub Desktop、Codex、其他 AI Agent 和 IDE 应优先打开 `main/` 目录，以便识别 repo、读取根文档，并发现同层其他 branch worktree。
5. 其他 branch worktree 与 `main/` 平级，目录名应由用户或项目约定决定；当项目没有更具体规则时，推荐与 branch 名称保持一致。
6. branch 名称中的 `/` 等不适合作为目录名的字符，在本地 worktree 目录名中替换为 `-` 或项目约定的安全分隔符。
7. branch/worktree 名称推荐保持 `a/b` 的两段式格式；如果 `b` 暂不明确，使用 `main`，例如 `sub/main`，以保留后续扩展性。
8. 仓库默认主分支 `main` 是特殊稳定分支，默认对应 `main/` 工作区。
9. 每个 worktree 应对应一个明确的 Git branch；除非用户或项目规则另有说明，不在多个 worktree 中复用同一个 branch 作为长期开发工作区。
10. 如果 branch 名称发生变更，关联的 worktree 本地目录名也应同步调整；如果 worktree 本地目录名发生变更，关联 branch 名称也应同步调整，以保持检索、定位和文档记录的一致性。
11. 上述示例强调的是目录组织方式；`<project-name>`、`<branch-worktree-name>` 和 `_builds/` 只是占位符，不是强制命名规范。
12. 如果用户已经明确指定 feature、branch 或 worktree，且当前目录不匹配，Agent 可以按项目规则优先进入已有 worktree；如确需创建对应 branch/worktree，应确保不会覆盖现有路径，并在执行前说明将要创建的 branch/worktree。
13. 如果用户没有明确指定目标分支或 feature，Agent 不得自行猜测并切换分支、创建分支或创建 worktree；应在当前分支继续，或停止并询问用户。
14. 禁止在未获得用户明确授权的情况下执行 `git worktree remove`、`git worktree move` 等会破坏或重定位 worktree 的命令。

## 内容与系统任务日志拆分

1. 针对更复杂的、同时存在"内容"和"系统"的项目，应在 `agent-log/` 下再创建两个文件夹：`agent-log/system/` 和 `agent-log/content/`。
2. 每次实际执行任务时，应根据任务性质将日志记录到对应目录，而不是总是记录在同一个日志目录下。
3. 内容和系统改动任务的分类由 Agent 根据上下文判断；通常来说，Web 系统的数据、游戏的装备数值和技能等属于内容更新。
4. 如果一次任务同时涉及内容和系统，应优先记录在主要改动对应的目录，并在日志中说明另一类改动的范围。

## 版本管理纪律

1. 版本号只认一个权威来源：由项目指定单一文件（如根目录 `VERSION` 文件或 `package.json.version`）承载，脚本与 CI 统一从该来源读取，不在多处平行维护。
2. 产生新的可交付改动时，按语义化规则递增版本号：破坏性变更递增 major，向后兼容的新能力递增 minor，修复、文案、样式或依赖调整递增 patch。
3. 无法明确判断是否递增时，默认递增；漏递增导致版本重复的代价远大于多跳一位。
4. 递增后必须同步检查所有对外版本展示（README、界面显示、接口返回等），不允许遗留与权威来源不一致的硬编码版本。
5. 每次递增版本号，必须在当次执行日志中写明改了哪一位、依据什么判断。

# 技术栈专用规则

## TypeScript 规则

1. 本节适用于使用 TypeScript 的客户端、工具或服务端；其他项目忽略本节。
2. 以仓库现有 tsconfig、包管理器和 package.json scripts 为准，不自行猜测版本或命令。
3. 优先保持类型边界明确；使用 unknown 时先收窄，只有记录原因时才使用 any、@ts-ignore 或等价逃逸。
4. 类型检查、测试、构建和真实交互属于不同验证维度，按项目脚本分别运行；未实际运行的结果不得标记为「已通过」。

# 项目专用规则

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

- 修改本文件的通用规则时，必须同步更新模板来源 `/Users/taobe/Projects/GitHub/Personal/agent-template/app-agent-template/AGENTS.md`，并在日志中说明；通常只在项目专用规则下补充或调整。
- 本项目本次只迁移协作规则和治理文档，不移动已有源码目录，因此未来从 GitButler upstream 合并时仍使用原始路径。
