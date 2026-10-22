# 自动 Fetch、同步角标与 Pull 进度

- 用户原始 prompt（2026-10-22，UTC+8）：「2 个问题：1. 我们明明有 AUTO FETCH 功能但事实上并没有生效，在 push 的时候才提示需要 fetch，并且直到 pull 了，pull 的角标都并没有正确显示数字（没显示角标）2. pull 没有进度，完全不知道执行到哪了」。附图为 Gitea ball-maze/main 的 Pull 运行弹窗。
- 具体模型：环境只提供 GPT-6 家族标识，未提供可核实的更具体版本；文件名使用可获得的最具体名称 gpt-6。
- 启动分支/版本：main，d6ef8412f6，0.37.2；同步预检 fetch origin 成功，HEAD 与 upstream 为 0/0。
- 开始时间：2026-10-22 08:11:44 UTC+8。
- 结束时间：2026-10-22 08:39:25 UTC+8（本任务代码与验证完成）。
- 是否提交：未提交；当前请求未要求提交、推送或打包。

## 上下文与边界

已读根 AGENTS.md、macos/AGENTS.md、REQUIREMENTS.md、Desktop 来源边界和当前运行链；公共 AGENTS 模板与仓库共同部分一致。轻量记忆检索用于区分旧 Rust 刷新与当前固定 GitHub Desktop 3.6.7 行为，结论以当前源码验证为准。

工作区另有远端文件分页修改，涉及 REQUIREMENTS.md、presence-host.ts、remote_control.rs、RemoteControlProjects.tsx、remote-control-model.ts、remote-control.css、新增 remote-file-pages.ts 与对应测试/日志；全部保留。当前任务不操作用户安装版、真实 ball-maze 仓库、凭据或账号。

## 发现与行动记录

- 原版 AppStore.startBackgroundFetching 和 BackgroundFetcher.start 在没有 gitHubRepository 时返回。选中的 Gitea 仓库同时被原版仓库列表刷新排除。
- 展示层 fetchRepository 仅返回缓存时间，从未请求 Fetch。已有优先级刷新入口可以为原版未覆盖的平台调用原版 Dispatcher，避免增加第二套 Git 执行或新的定时器。
- 本地工作区 DTO 丢弃 getStatus 的实际 upstream/ahead/behind；角标靠最多 100 条图谱历史判断，截断或分叉时会漏报。
- 原版 RepositoryState.pushPullFetchProgress 已提供 Pull 进度；自定义弹窗只显示“正在执行”，未读取该状态。
- 已先记录需求 DESKTOP-01-auto-fetch-signals、DESKTOP-01-pull-progress。

## 验证与完成状态

已实现原版未覆盖平台的 Fetch 入口、共享对象库去重与冷却、实际跟踪分支计数，以及原版 Pull 进度经私有端口推送。Git 明确报告阶段百分比才展示百分比；其余阶段显示不定进度、当前目录、已用时间和等待说明。收起后继续处理原任务，终态区分完成与失败，合并冲突保留原版处理入口。

- 本任务开始后，Presence 并行功能已将共用、尚未发布的权威版本递增至 0.38.0，并同步原有 manifests。当前修复纳入同一开发版本，不覆盖并行版本修改，不生成 0.37.2 的重复交付。
- 第一轮：两层 TypeScript、Rust、3895 个上游文件及 72 项展示/身份差异校验、完整构建通过。根有效主测试集 50/50 通过，含本任务新增的 7 项同步反馈回归。
- 08:27 首次原生验收通过：不点击 Fetch/Push/Pull，现有刷新入口自动获取临时远端；HEAD、index 字节、已暂存差异及文件保持；改名远端 enterprise/main 与本地 local-main 的角标准确显示 2；原版 Pull 的阶段通过私有端口展示，收起/恢复执行次数仍为 1，成功后角标清零；真实落后 130 个提交时远端图谱仅返回 100 条，Git 状态仍准确报告 130。初版证据在 artifacts/sync-feedback/0.38.0/，构建摘要 6d5004d9e2b851c838a5318605e81e891d020f1b4f54d240d83df56c9856c7d9。
- 测试夹具的首次运行遇到 bundled Git 未创建 hooks 目录，已在夹具显式创建。另修正 Playwright 的异步 waitForFunction 可能提前返回问题，改为等待真实界面角标，避免把未发生的 Fetch 误判成功。两者均为隔离验证代码问题，不修改产品逻辑来迎合测试。
- 额外尝试旧 macos/tests/action-read-badges.test.ts 得到 5/7；两个失败分别是旧组件测试未包裹当前已必需的 RepositoryOperationProvider，以及断言旧 CSS 的 pointer-events:none。被测 RepositoryActions 与该 CSS 规则在本任务前就已变更，均不属于当前默认 Desktop 测试入口；未为通过旧断言修改现行产品行为。
- 之后并行 PresenceHost 代码继续更新，来源摘要保护正确拒绝旧构建的再次运行；在整理进度订阅及取消检查后，重新执行当前源码的类型与完整构建，并增加实际断网 Pull 的失败终态检查。最终结果待追加。

## 最终交付

- 本任务代码完成，需求 DESKTOP-01-auto-fetch-signals、DESKTOP-01-pull-progress 已勾选。当前未发布开发版本 0.38.0；本任务未提交、推送、打包、签名、公证或发布，也未操作用户安装版、ball-maze 或真实凭据。
- 最终验收的开发构建摘要为 9404146906b4a6305f46d52d37be3c21993af33c6d2ab05eaf92960e5b78ed64，HEAD 为 d6ef8412f6893106721cf8eb7ca89c0d71bb3337，包含任务相关和已存在的并行未提交改动。当前两层 TypeScript、Cargo、3895 文件/72 项允许差异的来源校验、50 项主测试通过。
- 此构建的 6 组真实同步场景全部通过：自动 Fetch、本地 HEAD/index/文件保护、改名跟踪分支的实际角标、Pull 进度跨私有端口与收起恢复且只执行一次、同步后清零、130 条提交与 100 条图谱截断、断网失败不冒充完成且保护本地数据。六组的详细断言及进度序列在 report.json。
- 同构建再次通过原有 12 项原生 Git/LFS/Presence 检查，覆盖 Commit、幂等、Push、Clear 的 HEAD/index 保护、Get Latest 深度 1、LFS 内容及 hooks 保留、过期预览拒绝、远端/分支改名，以及远程丢弃与恢复。新的同步执行期间避让自动 Fetch，避免 Clear/Get Latest 整理目录时争用路径。
- 过程中的一次测试与同一输出目录的构建重叠，构建替换 Git 文件导致夹具里的 ENOENT；已等完整构建结束后按顺序重跑两套原生检查，最终均成功。另一次在最后避让检查修改后开始的构建以来源变更失败结束；随后重新构建成功，未把中间失败当成成功。
- 最终原生检查之后，另一个远程文件任务于 08:36:54 再次修改共享 presence-host.ts，当前工作区完整摘要变为 88926c3fa4fca7592b19e2039fb5e0834a75385e286ef62a135b3e5eead3a699。因此最终 verification.json 明确区分已验收构建和最新共享源码；本任务全部产品文件均未在验收构建后修改，并记录逐文件 SHA-256。最新组合源码的类型检查通过，但不能把旧构建说成已覆盖那一处新的并行修改；该组合的后续完整构建属于统一交付阶段。
- 证据目录 artifacts/sync-feedback/0.38.0/ 保存 verification.json、report.json、original-report.json、tests.tap、check.log 及两张原生界面截图。README 当前能力说明和 docs/github-desktop-based.md 的运行边界已更新；保留原有 Material 视觉规范，不改设计系统。Windows运行、用户真实服务器及正式安装包留待对应交付验收。
