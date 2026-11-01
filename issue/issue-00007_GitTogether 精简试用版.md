---
uid: '00007'
title: GitTogether 精简试用版
type: FE
status: done
importance: p0
emergency: p1
created-time: '2026-11-01T23:15:53+08:00'
updated-time: '2026-11-02T00:51:07+08:00'
start-time: '2026-11-01T23:15:53+08:00'
closed-time: '2026-11-01T23:42:29+08:00'
created-version: 0.38.11
closed-version: 0.38.11-lite.1
created-by: github.com/DDonlien
updated-by: github.com/DDonlien
assignees:
  - github.com/DDonlien
tags:
  - desktop-lite
---

# Description

用户要求减少错误与功能复杂度，仅保留 Tauri 的 GitHub Desktop 日常 Git 工作流、全套更新后的 GUI、绑定账号的全部仓库侧栏、Dashboard 多仓库/多分支及隐藏排序、非 GitHub 仓库的 Codex CLI 提交说明和 Presence 插件兼容。

- [x] 创建独立分支 `DDonlien/main/desktop-lite`，原工作区未提交改动保留。
- [x] 保留标准 Git 操作、GUI、账号、Dashboard、手动隐藏/排序与 Presence 协议。
- [x] 移除自定义同步清理、组合 Submit、AI 提交拆分/整合、文件管理写入、远端控制、权限巡检和贡献自动隐藏的有效入口。
- [x] Dashboard 背景读取仅获取分支元数据，历史与文件树在打开仓库后读取。
- [x] 类型/Rust检查、核心 Git 隔离验证与试用包签名公证核对。
- [x] 独立 macOS Apple Silicon 试用包交付，签名、公证与解压校验通过。
- [x] 提醒使用对称内边距和可关闭样式，悬停、键盘聚焦及触屏均可找到关闭 X。
- [x] 账号设置移除逐仓库的“本地 Git 认证”展开列表，现有认证方式继续保留。
- [x] Lite 不读取旧版 GitHub 授权应用配置，配置缺失或不可读时自动使用设备验证码登录。

试用应用使用独立标识、存储和账号登录，稳定版不会被替换。此版沿用 Tauri/Rust 实现标准 Git 语义；历史 GitHub Desktop/Electron 参考源码不进入运行包。真实账号授权、Presence 插件连接、视觉与交互体验仍由用户试用确认；源码检查与隔离测试不代表这些验收已通过。

# Comments

## 20261102-005107_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

根据添加 GitHub 账号时的加密存储报错定位并修正登录流程。此机 Lite 自己的 GitHub 授权应用配置不存在，旧版授权目录存在；旧流程会转去读旧版配置，钥匙串读取失败后直接中止，没有进入设备验证码授权。未读取密钥、令牌或加密文件内容，也未调用钥匙串来诊断。

Lite 现在只读取自己的开发者应用配置，缺失时不再读取或迁移旧版目录。GitHub 配置缺失、不可读或无效时使用已有设备验证码授权；有效自身配置继续支持网页登录，其他平台维持原流程。切换到设备授权会记录不含凭据的诊断事件。更新设备授权禁用响应的错误说明，并移除界面中把所有备用登录都归因于“本机回调不可用”的提示。

21 项 Rust 隔离测试通过，包含新增的 4 项 OAuth 选择/响应检查和 1 项 Lite 不读取旧版配置检查；Rust lib/bins、TypeScript、4 项现有精简界面检查、前端生产构建和差异检查通过。另以公开 Client ID 验证 GitHub 设备码启动接口返回 HTTP 200，确认该应用已启用设备授权；未打开网页、未代替用户同意、未取得账号令牌，验证码未保存或输出。

账号配置文件与系统钥匙串项未修改。本次修正保留在精简分支源码，尚未重新生成试用包，真实账号授权与保存后的连接仍待用户完成。

> [GitHub 官方设备授权说明](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)
>
> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-004202_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

按试用反馈移除设置页账号卡片中的“本地 Git 认证”展开列表，以及对应组件、刷新状态和专用样式；账号信息、连接、编辑和正常仓库访问入口保留。同步删除错误提示里指向已移除认证选择器的说明。

读取现有路径确认认证行为不变：已有账号/系统认证记录继续保存和使用；导入本地目录默认使用系统 Git/SSH，首次从应用下载仓库默认使用绑定账号，已有仓库继续沿用其原模式。Fetch、Pull、Push 和账号登录均不依赖这个展开面板。

TypeScript、前端生产构建、Rust 编译检查和差异检查通过。修改保留在精简分支源码，尚未重新打包，未变更用户账号、仓库配置或安装版应用。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-003315_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

根据 Gitea Commit 弹窗截图定位 AI 生成入口：平台判断和生成回调均正常，按钮位于每个工作目录的完整文件清单后；53 个文件使它落在初始可视区域之外。已将按钮移到工作目录标题右侧、Summary 上方，标签统一为“AI 生成提交说明”。长仓库/分支名省略并保留完整名称提示，按钮固定显示在标题行，不受文件清单长度影响。

保留选中文件范围、生成取消和草稿编辑逻辑；GitHub / GitHub Enterprise 继续按精简范围不提供此入口。TypeScript、4 项现有精简界面检查、前端生产构建及差异检查通过。本次只修正源码布局，未调用用户真实 Codex 生成或提交代码，也未重新生成试用安装包。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-002640_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

根据精简试用版截图修正提醒间距：Dashboard 提醒原先叠加了布局 gap 与自身上边距，已取消额外上边距；Presence 的独立 6px 内边距覆盖已移除，共享提醒上下均为 10px。更新和 Presence 反馈容器不再与子提醒叠加留白，空反馈容器会收起。

所有共享提醒默认带最右侧关闭 X：鼠标悬停或键盘聚焦时显示，触屏直接显示，按钮独立占位且不会提交表单。关闭仅隐藏提示；持续读取的相同消息不会因 JSX 重建而再次出现，消息内容变化或出现新的提醒时可重新显示。

同时检查并统一文件树、历史图、提交/推送结果、仓库和账号错误、Presence、复制、日志及更新结果等提醒。保留原有重试按钮与业务错误状态；读取、下载、安装进度及空状态继续作为状态界面显示。

TypeScript、51 项原有测试、4 项精简界面检查和前端生产构建通过；额外核对成功/警告/错误/信息四种提醒在未提供关闭回调时均渲染带可访问标签的非提交关闭按钮。本次是 `desktop-lite` 的源码修正，未重新生成试用安装包，用户安装版未操作。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261101-234229_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

已完成六项范围的精简试用版：保留现有 Material GUI、账号仓库侧栏、Dashboard 多分支/隐藏/排序、标准 Commit/Fetch/Pull/Push、非 GitHub 的 Codex CLI 提交说明及 Presence 观察协议。删除自定义同步清理、组合 Submit、AI 拆分/整合、文件管理写入、远端控制、权限巡检和贡献自动隐藏的运行入口；旧的创建额外工作目录接口也已删除。

Dashboard 后台使用分支摘要，本地只读取状态与最近一条提交元数据；进入仓库后再加载完整历史和文件树。Pull 使用实际配置的上游分支，只执行快进；脏工作区或分叉会保留现场并拒绝自动合并。

最终检查通过：16 项 Rust 隔离测试、51 项原有前端/发布规则测试、4 项精简界面测试、TypeScript 与生产构建。0.38.11-lite.1 Apple Silicon ZIP 已使用 Developer ID 签名，Apple 公证 Accepted（d008ad7c-b151-4e56-98e5-ed50bffc50be）；原应用与解压后的 ZIP 应用均通过严格签名和公证票据检查。包内仅保留主程序。

[试用 ZIP](</Users/taobe/Projects/GitHub/Personal/git-together/_builds/gittogether-lite-0.38.11-lite.1-macos-arm64-73AOpg/GitTogether-Lite-0.38.11-lite.1-macOS-arm64.zip>)（6,469,959 字节），[构建来源](</Users/taobe/Projects/GitHub/Personal/git-together/_builds/gittogether-lite-0.38.11-lite.1-macos-arm64-73AOpg/build-info.json>)与[解压核对结果](</Users/taobe/Projects/GitHub/Personal/git-together/_builds/gittogether-lite-0.38.11-lite.1-macos-arm64-73AOpg/verification.json>)随包保存。ZIP SHA-256：`7f6ea8bcb633b90110121d5b74012dc1301bc2444be2bee9e1eb8a16cc75cd1d`；源码 SHA-256：`98c2b217843bb94551d68fb2ab2bc3d55971a0e806c034cbafacf33244d91171`。

试用应用使用独立标识、数据目录与钥匙串，需要正常重新绑定账号。源码改动保留在 `DDonlien/main/desktop-lite` 独立工作区，尚未提交或推送；原 main 未提交改动保留，未发布稳定更新。未启动用户安装版，真实账号、Presence 连接和 GUI 体验待用户试用。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261101-231553_Codex_OpenAI-GPT-6.1-SOL-ULTRA-UNKNOWN

已从 main 的已提交源码创建独立工作区与试用分支。原 main 上未提交的权限修复和规则改动继续保留；本轮六项范围和试用包要求已记入 Description。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)
