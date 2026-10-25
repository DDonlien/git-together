---
title: 在NAS部署独立GitPresence服务并验证Bridge通信
id: PRESENCE-03-nas
原聚合 ID: '`PRESENCE-01-plugin`。'
type: DOC
status: 进行中（原文同时包含已完成与未完成项）。
版本管理: Git。
来源: '`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：任务清单 / Phase - v0.23.0 - Presence 插件与首个服务器 / presence/main: 接入真实团队协作状态。'
拆分前原稳定 ID: '`PRESENCE-01-plugin`, `PRESENCE-02-state`, `PRESENCE-03-nas`, `PRESENCE-04-release`；不改写或重编号这些既有 ID。'
拆分前标题: 'presence/main: 接入真实团队协作状态。'
原稳定 ID: '`x`、`PRESENCE-03-nas`；保留既有编号与完成状态。'
拆分状态说明: 状态 property 沿用原聚合记录；本文件各 checkbox 为该目标的真实状态，未重新验收。
updated-time: '2026-10-24T16:22:34+00:00'
---

# Description

## 当前需求与范围
- [x] \[PRESENCE-03-nas] NAS 部署独立 GitPresence Docker 服务，复用现有 HTTPS 的 /presence/ 路径、按仓库授权和只读非 root 容器；健康、真实 Bridge/观察者通信与相邻服务已核对。GitPresence 0.2.0 的已推送 ff242f4 源码精确部署，GitTogether 接入源码 d84730f 已推送；桌面更新交付单独跟踪下一项。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。


## 拆分关联

本次从同一旧迁移 Issue 按独立交付目标整理；同一目标的实现、依赖与验收子项保留在一起。

- [通过Presence插件订阅并展示真实团队协作状态](issue_%E9%80%9A%E8%BF%87Presence%E6%8F%92%E4%BB%B6%E8%AE%A2%E9%98%85%E5%B9%B6%E5%B1%95%E7%A4%BA%E7%9C%9F%E5%AE%9E%E5%9B%A2%E9%98%9F%E5%8D%8F%E4%BD%9C%E7%8A%B6%E6%80%81.md)
- [在NAS部署独立GitPresence服务并验证Bridge通信](issue_%E5%9C%A8NAS%E9%83%A8%E7%BD%B2%E7%8B%AC%E7%AB%8BGitPresence%E6%9C%8D%E5%8A%A1%E5%B9%B6%E9%AA%8C%E8%AF%81Bridge%E9%80%9A%E4%BF%A1.md)
- [发布包含Presence的GitTogether桌面更新并保留跨平台要求](issue_%E5%8F%91%E5%B8%83%E5%8C%85%E5%90%ABPresence%E7%9A%84GitTogether%E6%A1%8C%E9%9D%A2%E6%9B%B4%E6%96%B0%E5%B9%B6%E4%BF%9D%E7%95%99%E8%B7%A8%E5%B9%B3%E5%8F%B0%E8%A6%81%E6%B1%82.md)

原文件的共用上下文及完整既有 Comments 仅保留在[首个任务](issue_%E9%80%9A%E8%BF%87Presence%E6%8F%92%E4%BB%B6%E8%AE%A2%E9%98%85%E5%B9%B6%E5%B1%95%E7%A4%BA%E7%9C%9F%E5%AE%9E%E5%9B%A2%E9%98%9F%E5%8D%8F%E4%BD%9C%E7%8A%B6%E6%80%81.md)，来源与历史没有删去。

# Comments

## 20261024-070820_Agent

原记录标题：2026-10-24 07:08:20 UTC — Agent（纠正迁移命名）

按任务原语言改为 `issue_在NAS部署独立GitPresence服务并验证Bridge通信.md`；类型、旧 ID、来源、历史与原状态保留。实施提交未核实，省略版本后缀；本轮仅核对文档内容与直接引用。 本文件承接原聚合目标中的相关范围；全部拆分目标见“拆分关联”，完整既有 Comments 保存在首个任务。

原记录未提供完整 Agent / 模型详情及原执行会话链接，未补造。

## 20261024-162234_Codex

按用户最新手写模板迁移属性和正文结构，保留任务语义、来源、原始状态及历史内容；本次未重新执行业务验收。

原版本关联记录（照录来源，不将本次文档迁移提交当作业务实施提交）：
- 实施提交：未核实（未取得与本文件具体范围直接对应且已核实的实施提交；来源快照、当前 HEAD 与迁移提交不替代业务实施版本，故省略文件名版本后缀）。

本次执行环境未提供具体模型标识，未补造 Model-Detail。

[本次文档迁移对话](codex://threads/01a157b3-610c-73b4-ae06-163c0f8490d3)
