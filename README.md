# GitTogether

GitTogether 是一个本地优先的 Git 工作台，用来同时管理多个 repository、真实 branch、worktree、Work Session，以及与这些工作上下文绑定的任务和对话。它以普通 Git 心智模型为默认入口，不要求用户先采用 Virtual Branch。

当前产品版本为 `0.2.5`，权威版本号位于 [`VERSION`](VERSION)。桌面端使用 Tauri、Svelte 和 Rust，现阶段主要支持 macOS 本地工作流。

## 已有能力

- 在首页总览多个本地 repository，并展示真实 branch、worktree、dirty、ahead/behind 和远端状态。
- 对多个 repository 分别执行 fetch、commit、push，并保留每项操作的独立结果。
- 预检并安全执行 Get Latest；本地修改、分叉历史或缺失 upstream 时不会覆盖工作区。
- 创建真实 Git worktree 形式的 Protected Work Session，记录 base、修改范围和 snapshot commit。
- 在同一桌面工作台组合 Repository、Threads/Tasks、Chat 与 Files/Diff/Preview/Terminal/Git Graph/Git Details。
- 通过 macOS Keychain 保存自托管 HTTPS Git 服务器的 password 或 PAT，配置文件只保存非敏感元数据。

## 开发入口

- 安装依赖：`pnpm install`
- 桌面开发：`pnpm dev:desktop`
- 前端检查：`pnpm check`
- Rust 检查：`make check`
- 本地 macOS 打包：`scripts/package-gittogether-local.sh`

## 项目文档

- [`AGENTS.md`](AGENTS.md)：协作规范、Git 边界和目录索引
- [`REQUIREMENTS.md`](REQUIREMENTS.md)：Feature 范围、状态和完成边界
- [`DESIGN.md`](DESIGN.md)：视觉与界面约束
- [`agent-log/`](agent-log/)：执行日志

## 上游与许可证

GitTogether 基于 [GitButler](https://github.com/gitbutlerapp/gitbutler) 源码构建，并保留原始源码目录和内部兼容名称，以便继续从 `upstream/master` 获取修复。GitButler 来源代码及其后续修改继续受仓库内现有许可证约束；GitTogether 的产品身份、配置和本地工作流不会冒充上游官方发行版。
