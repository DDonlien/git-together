---
uid: '00002'
type: UI
status: in_review
importance: p1
emergency: p1
priority: high
updated-time: 2026-10-28T17:07:07+08:00
created-time: 2026-10-28T17:03:06+08:00
start-time: 2026-10-28T17:03:06+08:00
closed-time:
created-version:
closed-version:
estimated-workhour:
actual-workhour:
commit-related: []
tags: [Pull, Clean]
---

# Description

当 Pull / Get Latest / Clean 的安全检查发现工作目录内有嵌套独立 Git 仓库，或目标分支包含子模块时，保留现有阻止替换与保护原目录的行为，并在提示中列出每个对应位置，帮助用户定位阻断原因。路径应对应实际检测到的嵌套仓库根目录或子模块路径；存在多个时全部显示。

- [x] 本地嵌套仓库提示列出每个嵌套仓库根目录的完整路径。
- [x] 远端子模块提示列出每个子模块在目标目录中的路径。
- [x] 提示通过现有 Git 操作对话显示，并保留阻止清理 / 替换的保护行为。
- [x] `cargo check --locked --manifest-path macos/src-tauri/Cargo.toml` 通过；未运行测试。
- [ ] 用户确认实际提示可读；未进行 GUI 验收。

# Comments

## 20261028-170707_Codex_GPT-UNKNOWN-UNKNOWN-UNKNOWN-UNKNOWN

Pull / Get Latest / Clean 的本地目录检查现在会列出所有检测到的嵌套仓库绝对路径；发现后仍跳过仓库内部及文件内容读取，并中止快照替换。远端子模块检查改为读取 NUL 分隔的 Git tree 项目并列出各子模块在目标目录中的位置。现有 Pull 对话会显示这条后端错误文案。

`cargo check --locked --manifest-path macos/src-tauri/Cargo.toml` 通过。没有运行测试或 GUI。`cargo fmt --check` 未通过，报告当前工作区多个已有未提交 Rust 改动的格式差异；本次新增代码段没有格式差异。模型确切版本、型号档位、推理级别和加速选择无法从会话元数据核实，按未知记录。

> [本次对话](codex://threads/01a181ae-1327-70b0-b5b9-54e4f96c284e)
