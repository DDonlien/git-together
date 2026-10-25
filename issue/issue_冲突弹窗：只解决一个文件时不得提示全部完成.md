---
status: in_review
type: FE
priority: high
model: gpt-6.1-sol
reasoning_effort: max
depends_on: []
execution_state: implemented
handoff_ready: true
execution_thread_id: 01a1699b-ba7d-74c1-8f30-9e6a7277d6ca
execution_thread_title: 修正部分冲突解决后的全部完成误报
title: 冲突弹窗：只解决一个文件时不得提示全部完成
updated-time: '2026-10-24T16:31:09+00:00'
legacy-source: issues/issue-00a60f15-8716-418c-85be-2fd23551c0de.md
legacy-id: issue-00a60f15-8716-418c-85be-2fd23551c0de
---

# Description

复现场景：合并有多个冲突文件（用户截图为 7 个），在其中一个文件的菜单选择本地或远端版本后，出现类似“all has been done / 全部已完成”的错误提示。查明实际触发点（横幅、冲突计数或完成提示），按所有剩余文件的真实未解决状态显示。单个文件解决只反馈该文件或已解决数量；只有全部文件解决才能显示全部完成，并与继续合并按钮状态一致。

验收：隔离的多文件冲突仓库中依次选择第 1 个、中间、最后 1 个文件；前两步保留剩余冲突、弹窗及禁用继续合并，最后一步才反馈全部解决；撤销选择和重新读取状态也准确。

#### 当前实现与交接（2026-10-24）

- [x] 展示层统一按当前冲突文件逐项计算已解决与剩余数量；显式手动选择或已知标记数为 0 才显示为已解决。未知标记数继续显示冲突待确认。
- [x] 部分解决显示“已解决 N 个文件，仍有 M 个文件存在冲突”；只有 M=0 才显示全部解决。单文件提示明确限定为“此文件的冲突已解决”。
- [x] 保留手动选择的撤销入口；已暂存文件离开冲突列表时不再误报全部撤销。
- [x] 新增 5 项局部回归（含隔离真实七文件 Git 合并的第一/中间/最后选择、撤销、原版状态重读、外部编辑、部分暂存和全部暂存）；Node 22 下通过。39 项相关原版状态测试通过；desktop TypeScript 与所改文件格式检查通过。
- [ ] 布局 chat 统一更新来源锁与校验白名单并执行最终组合校验；本 chat 未修改公共锁或校验脚本。
- [ ] 用户在原报告场景验收；未执行 GUI、安装包或安装版验收。

交接入口：`desktop/app/src/ui/gittogether/conflict-progress.ts` 的 `getConflictProgress(workingDirectory, manualResolutions)` 返回 `unmergedFiles`、`conflictedFiles`、`resolvedFilesCount`；横幅、列表和现有继续按钮计数都使用该快照。继续按钮原生禁用/键盘保护由 issue-ca6ad7a1-2e60-4c68-be78-7cdc8b0f2151 继续实施，footer/AI 布局归 issue-9e6c06ef-5430-4058-94eb-eb2602116981。

证据边界：普通真实七文件状态没有复现原版 Store 在选择一个文件后全局计数提前归零；已确认并修正的是单文件提示范围不明、未知计数被旧展示判定当作已解决，以及部分或全部暂存后误报撤销。原版 Git、lib/status.ts、Store 与 Dispatcher 未由本项改写；用户原现场是否另有状态读取故障仍待原场景验收。

# Comments

## 20261023-163610_Codex_GPT-6.1-Sol

原记录标题：2026-10-23T16:36:10.604Z · Codex · gpt-6.1-sol

2026-10-24：已开始定位。原版 manualResolutions 以 path 为键，单次选择仅更新该文件；ConflictsDialog.renderBanner 的部分完成分支原文为“1 conflicted file has been resolved.”，文件行“ No conflicts remaining”未说明是该文件范围。尚无证据确认真实七文件场景的全局计数曾归零，不能将用户概述直接当作已复现的 Store 故障。将通过隔离多文件 Git 夹具验证首/中/末选择、撤销和状态重读；把部分解决明确显示为已解决数量与剩余数量，并统一横幅、摘要和文件行的展示判定，未知标记数不能当作零。只调整展示层，不改原版 lib/status.ts、Git、Store 或 Dispatcher 执行；footer/AI/菜单/编辑器归其他 issue。Node 26 下原版 Git 测试入口遇到 jsdom localStorage 初始化错误，24 项纯状态检查通过、2 个 Git suite 未启动；正在使用项目支持的 Node 22 重新执行。共享来源锁与白名单保留给布局 chat 最后汇总。

原执行会话深度链接未记录，未补造。

## 20261023-164239_Codex_GPT-6.1-Sol

原记录标题：2026-10-23T16:42:39.030Z · Codex · gpt-6.1-sol

2026-10-24：本项实现和局部检查完成，可交接，状态设为 in_review / implemented / handoff_ready=true，用户验收保持待处理。

改动文件：
- desktop/app/src/ui/gittogether/conflict-progress.ts：纯展示判定与同一快照的统计入口。
- desktop/app/src/ui/multi-commit-operation/dialog/conflicts-dialog.tsx：部分解决/全解决/撤销横幅和剩余数量统一取值，不改 footer、AI 按钮或原版事件处理。
- desktop/app/src/ui/lib/conflicts/render-functions.tsx：剩余文件摘要和全部解决文案。
- desktop/app/src/ui/lib/conflicts/unmerged-file.tsx：行状态与统一判定一致，未知计数显示待确认，明确单文件已解决，按实际 manualResolution 保留撤销；没有改菜单项目、分支选择或编辑器文案。
- desktop/app/test/unit/ui/conflicts-dialog-progress-test.tsx：5 项回归，包含临时七文件真实 Git 合并；真实仓库操作仅在系统临时目录，隔离 Git 全局/系统配置。

实际检查：
1. PATH=/opt/homebrew/opt/node@22/bin:$PATH 下，在 desktop/ 执行 node script/test.mjs app/test/unit/ui/conflicts-dialog-progress-test.tsx：5/5 通过。逐项选择为已解决 1→7 / 剩余 6→0；撤销一个为 6/1，全部撤销为 0/7；每步用原版 getStatus 重读；另外逐个实际编辑去除冲突标记并暂存，确认未误报撤销。还覆盖 unknown/null/NaN/负数计数、混合手动冲突和过期手动选择。
2. 相关原版 node script/test.mjs app/test/unit/git/diff-check-test.ts app/test/unit/git/status-test.ts app/test/unit/status-utils-test.ts app/test/unit/stores/updates/update-conflict-state-test.ts：Node 22 下 39/39 通过。Node 26 的初始化失败已由改用仓库支持的 Node 22 排除，没有修改公共测试入口。
3. desktop/node_modules/typescript/bin/tsc --noEmit：通过；本项 5 个代码/测试文件的 Prettier 检查通过；本项 tracked diff 空白检查通过。
4. 与 HEAD 做 AST/控制器比对：ConflictsDialog 原事件与生命周期体一致，5 个原版冲突菜单/撤销回调体一致。
5. node scripts/verify-upstream.mjs 已实际执行，当前失败是本批共享工作区的未登记来源差异，不能称整仓通过。本项待布局 chat 登记的上游展示文件只有 conflicts-dialog.tsx、conflicts/render-functions.tsx、conflicts/unmerged-file.tsx；ui/gittogether/conflict-progress.ts 位于允许的扩展目录。未改 docs/github-desktop-upstream.json 或任何公共校验脚本；其他并行编辑器/Store/Dispatcher 差异不由本项认领或回滚。

交接给继续按钮 issue：可直接使用 getConflictProgress 的 conflictedFiles.length；本项测试当前确认计数及原有 aria-disabled 状态，不把它当成 HTML 原生 disabled、键盘/隐式提交保护已修复。原生禁用归 issue-ca6ad7a1-2e60-4c68-be78-7cdc8b0f2151。

限制：普通真实七文件选择路径未重现 Store 全局提前归零；严格未知计数用受控状态夹具验证。未运行 GUI、用户原现场、安装包或安装版验收；未提交、推送、升版本、打包或发布。

原执行会话深度链接未记录，未补造。

## 20261023-164518_Codex_GPT-6.1-Sol

原记录标题：2026-10-23T16:45:18.088Z · Codex · gpt-6.1-sol

2026-10-24 交接复核补充：发现“仅部分已解决文件被暂存后离开列表”同样会令可见 resolvedFilesCount 降为 0，而其余冲突仍在；这不能推断用户已撤销全部选择。因此零个可见已解决文件的横幅改为只报告“仍有 N 个文件存在冲突，请继续处理”，不推测撤销原因。七文件真实 Git 回归已增加实际暂存第一个已解决文件、保持 MERGE_HEAD=true、重读其余六个冲突并禁止全部完成/撤销误报，随后逐个解决余下文件并全部暂存。仍为 5 项回归，修正后 5/5 再次通过；desktop TypeScript、所改文件格式、tracked diff 空白检查也再次通过。此前 ready 在复核期间短暂撤回，现已恢复 in_review / implemented / handoff_ready=true；getConflictProgress 的交接接口与文件清单不变。继续按钮 chat 的并行守卫变更已出现于同一文件，本项精确补丁保留其修改；先前记录的事件体一致性对应本项初次交接时的快照，不代表后续组合工作区所有事件体仍与 HEAD 相同。其余来源校验与用户验收边界同上。

原执行会话深度链接未记录，未补造。

## 20261024-163109_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

源属性保留了执行会话入口（各历史 Comment 的具体归属未另行核实）：[原任务执行会话](codex://threads/01a1699b-ba7d-74c1-8f30-9e6a7277d6ca)。

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
