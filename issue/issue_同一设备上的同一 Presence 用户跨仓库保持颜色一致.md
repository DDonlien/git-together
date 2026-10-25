---
title: 同一设备上的同一 Presence 用户跨仓库保持颜色一致
id: issue-5f7241d9-9ccd-4b01-9e2f-118d60d3a5be
type: UI
status: 待用户验收
范围 / 关联: '`macos/src/presence-model.ts`、`macos/src/PresenceAvatars.tsx`、`macos/src/presence.css`；来源 MyIssue：`git-together/issues/issue-5f7241d9-9ccd-4b01-9e2f-118d60d3a5be.md`'
updated-time: '2026-10-24T16:29:17+00:00'
---

# Description

## 目标与当前事实

同一台设备显示不同仓库中的同一个 Presence 用户对象时，头像和标识使用同一种颜色。颜色可在当前设备本地生成，不要求不同设备之间统一。用户/设备身份决定颜色，仓库和组织不参与颜色派生。

## 实现

- [x] 按 Presence 服务器、账号身份（identity ID，缺省时 user ID）和设备 ID 派生头像颜色，并让仓库列表与弹窗头像共用该颜色。
- [x] 更新 `docs/presence.md` 中的颜色行为说明。

## 检查

- [x] `npm run check` 通过：上游 3895 个文件和 68 项展示/身份差异校验、Desktop 与 macOS TypeScript 检查、Presence Cargo 检查均成功。
- [x] `git diff --check` 通过。

未运行测试、启动界面或打包应用；这些不属于已通过的检查结果。

## 用户验收

- [ ] 确认不同仓库和分支中的同一用户/设备头像颜色一致；不同设备不要求颜色一致。

# Comments

## 20261023-162821_Codex_Unknown

原记录标题：2026-10-23T16:28:21.768Z · Codex · unknown

##### 实现记录

- 头像环颜色现在按 Presence 服务器、账号身份（identity ID，缺省时 user ID）和设备 ID 派生；仓库与组织范围不参与。同一用户/设备在仓库头像和弹窗头像中使用相同颜色，不同设备可不同。
- 更新了 `docs/presence.md` 与 `REQUIREMENTS.md`，将旧的按仓库区分颜色规则标记为被本需求取代。

##### 检查范围

- `npm run check` 通过：上游 3895 个文件和 68 项展示/身份差异校验、Desktop 与 macOS TypeScript 检查、Presence Cargo 检查均成功。
- `git diff --check` 通过。未运行测试、启动界面或打包应用；未提交或推送。
- 当前宿主只暴露 GPT-6 家族标识，未提供完整变体，因此按 myIssue 约定记录 actor 为 `unknown`。

原执行会话深度链接未记录，未补造。

## 20261023-163041_Codex_Unknown

原记录标题：2026-10-23T16:30:41.527Z · Codex · unknown

##### 需求记录调整

运行中的项目协作规则同步到 v2.0.0 后，不再强制把活动需求重复写入 `REQUIREMENTS.md` 和执行日志。我已移除本任务新增的 `REQUIREMENTS.md` 子项；实现与检查状态保留在此 MyIssue，受影响的用户说明仍更新于 `docs/presence.md`。同步出现的 `AGENTS.md`、`macos/AGENTS.md` 与 `issue/` 模板均保持原样。

宿主未提供 GPT-6 的完整变体标识，因此本评论 actor 仍按 MyIssue 约定记录为 `unknown`。

原执行会话深度链接未记录，未补造。

## 20261023-170743_Codex_Unknown

原记录标题：2026-10-23T17:07:43Z · Codex · unknown

按用户纠正，将本 Issue 与 `issue-ccec8842-e096-4a84-9064-ea16534cb548` 一并登记到 GitTogether 当前工作副本的 `issue/`，并保留原稳定 ID、来源记录和截图。原 MyIssue 看板记录保留为来源。

原执行会话深度链接未记录，未补造。

## 20261024-162917_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

原版本关联记录（照录来源，不将本次文档迁移提交当作业务实施提交）：
- 版本管理标识：`versioncontrolid`

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
