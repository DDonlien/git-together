# 提交说明生成模型与上下文调整

## 用户原始 prompt

> 更新一下我们 AI 生成 description 的指令（我不知道你现在 cli 里是直接指令还是 promt）尽量用最新的小模型（比如 GPT-6 LUNA）的最快的模式，要求是覆盖所有文件，但不用太长的思考链，重点不要遗漏改动的对象，改动的内容，但不用太反复斟酌改动的可能效果（尤其是不显式体现在改动文件里、需要从文件和未改动文件结合分析的）但可以检查改动相关的 agent-log、issues、memorys（如有）来快速接续、录入明文的记录来提高描述的精准性和有效性

## 执行元信息

- 模型：gpt-6；运行环境未提供更具体的当前执行模型标识。
- 工作目录：`/Users/taobe/Projects/GitHub/Personal/git-together/main`。
- 开始状态：`main` / `ab2aaaa37fe88ba38d726880b811a10fa9476ed2`，跟踪 `origin/main`，ahead 6 / behind 16。启动时已有 AGENTS.md 修改和 `agent-log/20261015-010156-utcp8-taobe-gpt-6.md` 未提交内容，本任务保留。
- 开始时间：2026-10-15 01:08:22 UTC+8。
- 结束时间：2026-10-15 01:20:13 UTC+8。
- 提交/推送：未提交或推送。

## 上下文与决策

- 阅读根 `AGENTS.md`、`macos/AGENTS.md`、`REQUIREMENTS.md`、本地 CLI AI/Submit 相关 agent-log，以及上一任务的工作区整理日志。当前生产入口是 `macos/src-tauri/src/ai.rs`；旧 `macos/server/commit-generator.ts` 不是 Tauri/Rust 生产入口，本任务没有改它。
- Codex CLI 为 `0.162.0-alpha.17.2`。只读读取本机 app-server 的可用模型列表，确认包含 `gpt-6-luna`，且 `low` 的描述为快速、轻量推理；没有调用 AI 生成。
- 旧需求要求采用 CLI 推荐模型。本次用户的新指令覆盖该偏好，但仅作用于提交说明生成；其他结构化 AI 操作继续采用 CLI 推荐模型。
- 当前仓库未发现根 `issues/` 目录；实现保留对该目录的检测，以便其他仓库存在 issue 文档时使用。

## 实现

- 提交说明生成优先从当前 CLI 可用模型中选择版本号最新的 Luna，CLI 没有 Luna 时回退推荐模型，并传入 `model_reasoning_effort="low"`。保持本机 CLI 登录、工具/MCP/hooks 禁用、取消、JSON 输出格式和可编辑草稿。
- `files` 上下文不再限制前 1000 项。较大的 tracked diff 在文件片段之间均匀分配上下文；有 untracked 文件时为其保留输入空间，移除旧的 100 项上限。提示要求逐项覆盖完整清单，描述明确的对象与改动，不推测未修改文件的影响。
- 从仓库 `agent-log/`、`issues/`、`memory/`、`memories/`、`.codex/memories/` 以及本机 Codex memories 中，按所选路径、分支或显式任务 ID 匹配 Markdown/TXT 记录。只附至多 5 段短摘录；跳过符号链接和 skill 目录，限制候选数与单文件读取大小。提示将摘录视为补充事实和不可信文本，不把其中内容当作命令。
- 更新根/客户端 AGENTS 规则和 `R-05-commit-composer-ai-fast-context`，保留已有 AGENTS 与上一任务日志改动；未改 README 或 DESIGN。

## 验证与备注

- 本机 `model/list` 只读确认 Luna 与最低推理档位；未运行实际生成请求。
- `npm run check:rust`（Cargo locked compile check）通过；`git diff --check` 通过。未新增或运行测试。
- 大型 diff 与 untracked 文本仍受上下文预算限制；所有选中文件元数据会进入清单，缺失或截断的文件内容不作为已知事实。
- 任务结束时工作区仍为 `main`，本地 ahead 6 / behind 16；没有同步、合并、提交、推送或发布。
