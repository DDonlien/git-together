---
uid: '00007'
title: GitTogether 精简试用版
type: FE
status: done
importance: p0
emergency: p1
created-time: '2026-11-01T23:15:53+08:00'
updated-time: '2026-11-03T19:02:03+08:00'
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

- [ ] 将当前精简功能作为 GitTogether 0.38.12 正式版发布：沿用正式应用标识、原账号与目录关联及签名更新源；macOS Apple Silicon、Windows x86 和 x64 的安装包、签名、公证与公开更新源待核验。

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
- [x] Commit 弹窗的 AI 生成按钮与关闭、Commit 位于同一底部操作行并靠左。
- [x] 提交清单支持右键忽略文件，并安全处理已跟踪文件及提交范围。
- [x] 设置页支持展开、搜索近期日志，较长记录继续保存在日志文件中。
- [x] Presence 设置按服务器展示账号与地址，页内添加、逐台重新登录与退出。
- [x] Update 按上游状态选择 Fetch、Pull 或 Push；Pull / Push 支持分叉后的普通 Git 合并。

试用应用使用独立标识、存储和账号登录，稳定版不会被替换。此版沿用 Tauri/Rust 实现标准 Git 语义；历史 GitHub Desktop/Electron 参考源码不进入运行包。真实账号授权、Presence 插件连接、视觉与交互体验仍由用户试用确认；源码检查与隔离测试不代表这些验收已通过。

# Comments

## 20261103-190203_Codex_GPT-6.1-TERRA-MAX-UNKNOWN

按用户要求准备 GitTogether 0.38.12 正式版：移除产品名称及版本中的 Lite 后缀，恢复正式应用标识、原数据目录和签名更新源。以公开的 0.38.11 为上一版本；现有精简功能和分支下载目录调整保留。

前端类型检查、生产构建、52 项基础前端测试、19 项精简功能测试和 67 项 Rust 测试通过，更新公钥与既有发布配置一致。正式安装包、Apple 公证及公开更新源仍待完成和核验。

> [本次执行对话](codex://threads/01a1a0f2-4304-7e90-a497-5050df038618)

---

## 20261102-112201_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

已重新打包 GitTogether Lite macOS Apple Silicon 试用版，包含当前 Update、Pull / Push 自动合并、Presence 设置和前述试用反馈。产物：[GitTogether Lite 试用包](../../_builds/gittogether-lite-0.38.11-lite.1-macos-arm64-yEheQd/GitTogether-Lite-0.38.11-lite.1-macOS-arm64.zip)。版本 0.38.11-lite.1，大小 6,529,706 字节，SHA-256 `1d2dd1e69f1296522e2e1e23d6b5e7676bb199a9f2680e5d67de787611426955`。

从 `DDonlien/main/desktop-lite` 的 `ce5c24020eac59b6b46c7142026a7f5cccf948c4` 与未提交工作区生成，源码摘要 `a5fb24fca4873446fe16a5c910e70b54a30a70677cea080d48dede906f10783a`；独立重算与记录一致。Tauri 2 / Rust、arm64、独立应用标识和数据目录已核对。Developer ID 签名、Apple 公证 Accepted、staple/validate 与 ZIP 独立解压后的签名和票据核验通过；包内前端资源包含 Update 与自动合并提示。解压副本首次票据复验遇 TLS 连接失败，同配置重试通过。spctl 显示 accepted 且标识 Notarized Developer ID，但该机器同时显示 security disabled，不能据此宣称安全检查启用时的启动验收。

未安装、启动或覆盖用户现有应用，也未提交、推送或发布稳定版；真实账号、Presence、仓库交互和界面体验待用户试用。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-111029_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

在 Dashboard 仓库行、关联分支行及仓库页增加 Update：状态已同步或未知时获取远端；落后时 Pull；仅领先时 Push。两边都有新提交时先 Pull，完成后再按最新状态显示 Push；点击 Update 直接开始对应操作，独立 Pull / Push 仍保留确认。多个工作目录按各自上游状态选择目标，不把其他目录加入本次写入。

Pull 和针对当前 HEAD 的 Push 遇到分叉时尝试正常 Git 合并；合并说明使用不含地址和 AI 的固定分支模板。Push 只整合实际推送目标，合并后核对新的提交与远端；用户选择历史提交时不会扩大推送范围。不使用强推、自动 stash 或 reset。Git 拒绝会覆盖的本地改动时保留原内容；合并冲突保留现场并列出路径，需在外部解决后继续或中止。普通 Commit 暂不能完成合并冲突。

远端 Push 回读失败不报确定成功；合并后 LFS 不完整时分别保留推送结果和提示，批次后续失败或重试不会丢失已推送目录的提示或重复推送。分叉预览不伪造合并文件清单。远端操作结果无法确认时需刷新核对。

67 项 Rust 测试、19 项精简界面测试、51 项现有前端测试、TypeScript、前端构建和差异检查通过；另外 4 项隔离 DOM 测试覆盖 Strict Mode 自动启动、失败不重试、混合目录及 Push 警告。临时 Git 仓库和本机进程管道验证合并、冲突、历史范围、推送目标、远端竞态及本地文件保护；使用真实 Git LFS 在临时仓库验证大文件暂存与工作区内容保留。未操作用户仓库或真实账号，未重新打包，实际 GUI 与真实服务仍待用户试用。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-102314_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

按截图调整 Presence 设置：标题说明上移对齐；未登录先显示添加入口，点击后在页内展开；已登录服务器各占一行，名称下显示地址，右侧提供重新登录和退出登录，列表下方继续提供添加。登录失败保留当前表单；切换账号时错误与密码不会带入另一表单，保留创建账号入口和键盘焦点。

Presence 账号和凭据按服务器保存。重新登录或退出只清理目标服务器凭据及设备授权；旧版共享身份连接保留原账号归属，不能因归属服务器更换身份而自动切换。旧配置读取或迁移失败时禁止写回，保留原文件；本机保存或远端撤销失败时分别反馈。账号变动会使其他服务器的连接短暂重新建立，其他服务器的已保存凭据不会被清除。

54 项 Rust 测试、12 项精简界面测试、51 项现有前端测试、TypeScript 和前端构建通过；新增 Presence 设置隔离 DOM 交互测试与身份显示测试通过。使用模拟服务与临时数据检查账号隔离、迁移、过期、保存失败和设备撤销；未访问真实 Presence 账号或系统钥匙串。未重新打包或操作已安装应用，真实服务器连接和 GUI 观感仍待用户试用。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-095032_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

在设置页日志区增加“查看日志 / 收起日志”。展开时读取近期记录，支持关键词搜索、手动刷新、逐条展开安全字段和查看更新时间；读取失败保留上次结果。界面最多返回 500 条且响应不超过 256 KiB，搜索范围限定为当前读取的记录；读取受文件数量和每个文件尾部大小限制时明确提示可能只显示部分近期记录。

日志文件继续保存在原日志文件夹。保留目标从 24 小时 / 128 MiB 调整为 7 天 / 512 MiB，优先清理超出期限或容量的较早文件；按小时保留边界文件，不重写其内容。容量清理预留新记录空间，保护当前小时可能仍在使用的文件；若无法安全腾出空间则暂停写入并提示，已有文件仍可查看、打开和复制。界面分别提示实际清理和暂停写入，不把暂停误报成已删除。旧版已清理的记录不会因扩容自动恢复。

42 项 Rust 测试、Rust lib/bins 检查、12 项精简界面/选择测试、TypeScript、前端构建及差异检查通过。新增隔离测试覆盖多文件时间顺序、读取上限、字段筛选、目录链接、文件保留、容量预留和暂停状态；DOM 交互测试覆盖按需展开、搜索、刷新、收起、保留范围提示和暂停时打开/复制按钮。未读取用户实际日志正文，未重新打包试用版，实际 GUI 观感待用户确认。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-093209_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

按截图在 Commit 文件清单增加右键“忽略此文件”；行内文字、复选框及键盘菜单均支持操作。为选中文件向根目录 .gitignore 追加精确路径规则；已跟踪的普通文件会停止跟踪并保留本地副本，菜单和结果明确说明该删除提交后会从仓库移除。已有该文件暂存改动时拒绝操作，避免丢失暂存版本。

操作结束后刷新工作目录状态，保留原有草稿与其他文件的选择；新出现的 .gitignore 和已跟踪文件的删除可进入提交。修复提交基于 HEAD 重建暂存区时误把已忽略文件重新加入的问题，并保护未选中的暂存与工作区内容。忽略规则被覆盖或写入发生异常时，不发布暂存区；可能已追加的 .gitignore 内容保留并提示检查，避免并发回滚覆盖外部修改。

32 项 Rust 测试、Rust lib/bins 检查、12 项精简界面/选择测试、类型检查、前端构建和差异检查通过。另使用隔离 DOM 执行右键、复选框右键、Shift+F10 与禁用状态交互检查；真实临时 Git 仓库覆盖忽略后提交、已暂存内容、特殊路径、规则覆盖和并发保护。未修改用户仓库、未启动 Codex CLI，也未重新打包试用版；实际 GUI 体验待用户确认。

> [Git 官方忽略规则说明](https://git-scm.com/docs/gitignore)
>
> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

## 20261102-092020_Codex_OpenAI-GPT-6.1-TERRA-ULTRA-UNKNOWN

按用户纠正将 Commit 弹窗的“Codex 生成提交说明”移到固定底部操作行左侧，关闭和 Commit 保持同一行靠右；文件清单滚动时按钮继续可见。此项取代上一条将按钮放在工作目录标题右侧的布局。

多个工作目录共用一个按钮，按顺序为允许 AI、未完成且已选文件的目录生成空白字段；已有填写内容保留，完整草稿、GitHub 和 GitHub Enterprise 不参与。取消会停止后续生成并保留已完成结果；失败保留已完成草稿并提示错误，不自动提交或推送。

10 项精简界面及生成流程检查、TypeScript 和前端生产构建通过，覆盖混合平台、工作目录顺序、选择范围、保留草稿、取消与中途失败。未启动真实 Codex CLI 或操作用户仓库，尚未重新打包；界面实际观感待用户确认。

> [本次执行聊天](codex://threads/01a19799-0ad1-76f3-b428-8ead9b6d7cff)

---

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
