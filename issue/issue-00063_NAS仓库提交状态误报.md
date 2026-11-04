---
uid: "00063"
title: NAS仓库提交状态误报
type: BE
status: in_review
importance:
emergency:
created-time: '2026-11-04T16:03:10+08:00'
updated-time: '2026-11-04T16:03:10+08:00'
start-time: '2026-11-04T16:03:10+08:00'
closed-time:
created-version: 0.38.12
closed-version:
estimated-workhour:
actual-workhour:
commit-related: []
created-by: github.com/DDonlien
updated-by: github.com/DDonlien
assignees:
  - github.com/DDonlien
tags:
  - git
  - NAS
---

# Description

NAS 上的仓库在生成 AI 提交说明或提交时，可能因文件元数据时间变化而提示“分支、提交或文件更改已变化”，即使文件内容未变。截图发生于已安装的 GitTogether 0.38.12；同一 NAS 的隔离目录已复现只读内存映射改变 ctime 的现象。

- [x] 以文件内容、类型和权限，以及分支、Git 状态与暂存内容判断更改；仅时间变化不会使相同内容被当成新改动。
- [x] 读取时发现文件变化则停止；执行提交、生成说明或其他写操作的核对强制重读内容，不依赖可能过期的后台缓存。
- [x] 保持未选文件的暂存版本和工作文件；实际并发编辑时拒绝继续提交。
- [ ] 安装更新后的 GitTogether 并由用户在实际仓库验证界面与操作体验。

首次扫描以及实际执行时需要读取发生更改的文件；后台扫描对元数据未变化的文件复用内容摘要。大型文件在实际 NAS 上的耗时尚未测量。

# Comments

## 20261104-160310_Codex_OpenAI-GPT-6.1-TERRA-MAX-UNKNOWN

将原先直接包含 ctime 的状态值改为基于工作文件内容及相关 Git 状态的摘要；内容读取使用分块方式，读取前后检查文件状态，后台可复用未变化文件的摘要，操作核对强制重新读取。文件链接与权限变化仍参与判断；未选文件使用原有暂存保留流程。

76 项 Rust 测试和 Rust 所有目标的编译检查通过；在同一 NAS 的隔离仓库中，AI 提交说明准备、选中文件提交、Git LFS 文件提交和提交期间并发编辑检查通过，未选文件的暂存版与工作文件均保留。初次扩大检查时，NAS 自动生成的 `._*` 文件使干净分支测试失败；按目标仓库已有的排除规则在隔离测试中排除后，5 项检查全部通过，目标仓库规则未修改。

未在真实仓库创建提交或运行安装版验收；修复尚未打包、推送或发布。加速模式选择未能从会话信息确认。

> [本次执行对话](codex://threads/01a1a551-0f82-7373-b404-17a2f1671bb4)
