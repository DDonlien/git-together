---
status: in_review
type: FE
priority: high
model: gpt-6.1-sol
reasoning_effort: max
depends_on:
- '[[issue-00a60f15-8716-418c-85be-2fd23551c0de]]'
execution_thread_id: 01a1699b-f2fb-7211-b4b7-c30a02662151
execution_thread_title: 未解决冲突时禁用继续合并
execution_state: implemented
handoff_ready: true
user_acceptance: pending
title: 冲突弹窗：存在未解决冲突时禁用继续合并
updated-time: '2026-10-24T16:31:09+00:00'
legacy-source: issues/issue-ca6ad7a1-2e60-4c68-be78-7cdc8b0f2151.md
legacy-id: issue-ca6ad7a1-2e60-4c68-be78-7cdc8b0f2151
---

# Description

用户截图里仍有 7 个冲突文件时“继续合并”看起来可点击。核对真实 disabled 属性、Material 样式和提交入口：只要尚有未解决冲突，继续合并必须灰置且无法由点击或 Enter 触发；全部冲突解决后才允许继续。处理中也应防止重复提交。复用 GitHub Desktop 原版冲突与合并执行语义，不实现第二套 Git 判断。

验收：0/部分/全部文件解决三个状态，禁用外观与实际交互一致；未解决时不能提交。

# Comments

## 20261023-163448_Codex_Unknown

原记录标题：2026-10-23T16:34:48.820Z · Codex · unknown

#### 2026-10-24 只读定位与依赖等待
已读取当前 v2.0 AGENTS 和完整 Issue。按本批明确约定仅使用 issues/，不迁移到 issue/，不提交、推送或操作安装版。当前宿主未给出可核验的完整实际模型标识，actor 如实记为 unknown。

依赖 issue-00a60f15-8716-418c-85be-2fd23551c0de 尚未 handoff_ready=true，本项保留 todo / execution_state=waiting_for_dependency，暂不修改重叠文件。已确认继续按钮使用原版 getConflictedFiles 计数；Button 适配目前只输出 aria-disabled，而 Material 禁用样式只匹配 :disabled，导致视觉不一致。ConflictsDialog.onSubmit 当前也没有未解决冲突或处理中入口守卫。后续将仅修改提交/禁用行为，冲突计数和横幅由依赖任务负责。

原执行会话深度链接未记录，未补造。

## 20261023-164622_Codex_Unknown

原记录标题：2026-10-23T16:46:22.129Z · Codex · unknown

#### 2026-10-24 实现与组合检查进展
依赖在 00:42 标记 handoff_ready=true 后，本项已开始并完成最小代码修改：Button 仅对 type=submit 的 disabled 控件补原生 disabled；Material 同时识别 aria-disabled 与 :disabled，冲突弹窗禁用的提交按钮用灰色表面，禁用态不响应悬停/按下样式；ConflictsDialog.onSubmit 复用 getConflictProgress 阻止剩余冲突（含未知标记数），并用同步动作锁防止 React 状态刷新前的重复提交、重复中止及两者竞争。处理中保留 fieldset 禁用和失败后重试。未更改 Git、Store、Dispatcher 执行实现。

Node 22 下新增 5 项提交行为与现有 7 项按钮原语检查通过；desktop TypeScript --noEmit 通过；Material SCSS 编译通过。测试验证的是原生 disabled 属性、DOM 点击与表单提交入口；jsdom 不会从按键自动合成表单提交，因此不把它写成真实 Enter/视觉验收。

本次联合运行依赖的 conflicts-dialog-progress-test 时，真实七文件 Git 场景在部分暂存/状态重读阶段有一项 0 !== 5 失败（其余 4 项通过）；依赖已重新改为 in_progress / verifying_partial_staging / handoff_ready=false，本项保留自身改动，不修改依赖负责的计数/横幅/测试，等待它重新就绪后再核对组合状态。

已实际运行 verify-upstream，当前因本批未汇总差异失败。本项需最终布局 chat 汇总的上游文件是 app/src/ui/lib/button.tsx 和 app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx；ui/gittogether/presentation.scss 为扩展目录。未更改共享来源锁/白名单/校验脚本。

原执行会话深度链接未记录，未补造。

## 20261023-165011_Codex_Unknown

原记录标题：2026-10-23T16:50:11.375Z · Codex · unknown

#### 2026-10-24 完成与交接
本项实现完成，可交接；用户验收与本批统一来源校验保持待处理。此前依赖复核的失败已修复，依赖恢复 handoff_ready=true 后重新联合检查通过。本项仅维护本 Issue，保留其他 chat 的计数、横幅、菜单和编辑器改动。

本项改动文件：
- desktop/app/src/ui/lib/button.tsx：type=submit 的 disabled 控件同时输出 HTML 原生 disabled；其他 Button 保留原有 aria-disabled 交互契约。
- desktop/app/src/ui/gittogether/presentation.scss：禁用按钮的视觉同时识别 :disabled / aria-disabled；禁用态不响应悬停与按下样式；冲突弹窗禁用的继续按钮使用灰色表面与弱化文字。
- desktop/app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx：只改提交/禁用和同步动作锁。每次提交复用依赖的 getConflictProgress 检查剩余冲突（包括未知标记数）；有剩余、正在继续或中止时拒绝提交。React 更新 disabled 前的重复触发也被同步拦截；中止与继续互斥，失败后允许重试。保留原 onSubmit/onAbort 回调及异常报告，不改实际 Git / Store / Dispatcher 执行。
- desktop/app/test/unit/ui/conflicts-dialog-submission-test.tsx：新增 5 项提交行为检查，已适配并行菜单新增的 operationKind 参数。

最终实际检查：
1. PATH=/opt/homebrew/opt/node@22/bin:$PATH 下，在 desktop/ 执行 node script/test.mjs app/test/unit/ui/conflicts-dialog-submission-test.tsx app/test/unit/ui/control-primitives-test.tsx app/test/unit/ui/conflicts-dialog-progress-test.tsx：17/17 通过。包含本项 5 项、原有按钮原语 7 项、依赖进度 5 项；覆盖七文件 0/部分/全部解决、未知计数、DOM 点击/表单提交、React 状态尚未更新时的重复提交、失败重试、处理中互斥，以及依赖的七文件真实 Git/部分暂存/撤销/重读。旧版 React 的 awaitable act 兼容警告不影响退出结果，未升级依赖。
2. 最新 desktop TypeScript --noEmit：通过。期间并行菜单新增必填参数造成短暂类型错误；本项测试夹具及共享进度测试夹具补齐后，已重新执行通过，不沿用旧快照结果。
3. Material SCSS 只读编译：通过；本项新增测试及 conflicts-dialog.tsx 的 Prettier 检查通过；本项 tracked diff 空白检查通过。
4. verify-upstream 已实际运行，当前共享来源锁尚未统一登记，结果失败；本项未改锁、白名单或校验脚本。最终布局 chat 需纳入 app/src/ui/lib/button.tsx 与 app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx 的精确展示差异；后者包含本项 onSubmit/onAbort 的 UI 入口守卫及其他 chat 改动，不能声称所有事件体仍与上游相同。ui/gittogether/presentation.scss 位于既有扩展目录。

验收边界：检查确认原生 disabled 属性、禁用 CSS、DOM 点击和 Enter 共用的表单提交入口；jsdom 不会由键盘自动合成提交，因此真实 Enter、视觉效果和用户原现场仍待用户验收。未执行 GUI、完整构建、打包、安装版、公开发布验收；未提交、推送、升版本或操作用户安装的 GitTogether。修改前两项现有弹窗测试曾因中文删除文案/标题图标差异失败，本项未为此修改无关测试，也未声称全量测试通过。

原执行会话深度链接未记录，未补造。

## 20261024-163109_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

源属性保留了执行会话入口（各历史 Comment 的具体归属未另行核实）：[原任务执行会话](codex://threads/01a1699b-f2fb-7211-b4b7-c30a02662151)。

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
