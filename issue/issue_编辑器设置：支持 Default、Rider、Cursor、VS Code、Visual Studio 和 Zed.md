---
status: in_review
type: FE
priority: normal
model: gpt-6-luna
reasoning_effort: max
depends_on: []
execution_thread_id: 01a1699b-d281-7b41-be60-440370f76cd5
execution_thread_title: 添加默认应用与编辑器选择设置
handoff_ready: true
execution_state: implemented
title: 编辑器设置：支持 Default、Rider、Cursor、VS Code、Visual Studio 和 Zed
updated-time: '2026-10-24T16:31:09+00:00'
legacy-source: issues/issue-5d42052f-be80-43ce-8c05-ff5c63aa2000.md
legacy-id: issue-5d42052f-be80-43ce-8c05-ff5c63aa2000
---

# Description

冲突文件的打开入口使用 Default（系统默认应用）是正确默认行为；用户需要能在设置菜单选择 Rider、Cursor、VS Code、Visual Studio 和 Zed。检查现有 GitHub Desktop 编辑器发现、选择保存和打开入口，补齐 Material 设置界面并连接原版执行回调，保留系统默认选项。按平台实际安装情况展示可用编辑器，不伪造某平台不存在的应用。

验收：设置可选已安装的上述编辑器或系统默认；重启/重新读取设置仍保留选择；冲突文件打开与设置一致；缺失编辑器有明确反馈。

# Comments

## 20261023-164333_Codex_GPT-6-Luna

原记录标题：2026-10-23T16:43:33.214Z · Codex · gpt-6-luna

#### 实现与局部检查（2026-10-24）

- Integrations 偏好设置现在提供 Default（系统默认应用）和实际检测到的外部编辑器；移除首次读取时自动选择/保存第一个编辑器的行为。选择 Default 会清除旧的命名编辑器偏好，打开文件时交给 Electron 的系统默认应用处理。
- 保留已有平台检测与编辑器启动路径；Windows 增加通过 Visual Studio Installer 的 vswhere 定位已安装实例，并确认其中存在 devenv.exe 后才列出 Visual Studio。缺失的旧偏好会明确显示未安装；仍沿用现有打开失败反馈。
- 冲突文件在 Default 设置下显示“使用系统默认应用打开”，并调用同一偏好状态下的打开回调。macOS 设置入口已接到原有 Preferences/Integrations 页面，无需额外状态桥接。
- 改动涉及 desktop/app/src/ui/preferences/integrations.tsx、desktop/app/src/ui/preferences/preferences.tsx、desktop/app/src/ui/dispatcher/dispatcher.ts、desktop/app/src/lib/stores/app-store.ts、desktop/app/src/lib/editors/win32.ts，以及 desktop/app/src/ui/lib/conflicts/unmerged-file.tsx 的打开按钮文案/提示。

局部检查通过：desktop TypeScript 检查、macOS TypeScript 检查、六个改动文件的 Prettier 检查和定向 diff 空白检查。未做 Windows 实机检测、重启/设置持久化运行验收、冲突文件 GUI 验收或安装包验证；用户验收仍待完成。未运行会改动共享上游源码锁/allowlist 的完整校验；该共享校验由布局任务负责。源码检查不代表运行时、打包或发布验收。

原执行会话深度链接未记录，未补造。

## 20261024-163109_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

源属性保留了执行会话入口（各历史 Comment 的具体归属未另行核实）：[原任务执行会话](codex://threads/01a1699b-d281-7b41-be60-440370f76cd5)。

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
