# 远端终端控制方案讨论

- 用户原始prompt：
  > 开始开发远端仓库控制功能
  >
  > 先跟我讨论一下实现吧。我最大的痛点是我自己。
  >
  > 比如有 3 台设备，有时候其中一台设备上有一些更改，我本地也有一些更改。当我要用这些东西的时候，可能想使用或者废弃远端的更改，但我操作不了另一台设备。
  >
  > 更多的情况是在团队协作中，可能会有别人在改东西，但他刚好不在电脑边（比如休假了）。这个时候，我需要一个方案，可以让我在远端要求另一个使用 Get Together 的终端，把那些仓库行为执行掉，不管是 abort、commit 还是 submit。
  >
  > 也就是说：
  > 1. 个人场景：如果有两个仓库登录了同一个账号，那这两个仓库中任意一个 Get Together，应该可以操作另一个 Get Together 去执行这些行为。
  > 2. 团队场景：在权限满足的情况下，团队中更高级别的权限，要能控制更低级别的权限去执行这些行为。
  >
  > 这里涉及两个问题，首先我们要怎么判断对方是能够控制的 Get Together 对象？创建一套账号系统吗？因为仓库这个东西谁都可以用 Get Together 打开，所以不可能用仓库本身的权限做管理。
  >
  > 那第二个问题是，这种触发要如何实现呢？依赖于我们的 Presence 服务器吗？还是依赖于另一套方案？基于 Presence 服务器也行，我也能接受，你可以看一下。
- 模型：gpt-6；本环境仅暴露此版本标识。执行者：taobe。
- 开始：2026-10-12 00:24:28 UTC+8（本轮首次可追溯时点）；结束记录：2026-10-12 00:32:14 UTC+8。
- 工作区：codex-standalone-ts/main。同步预检后HEAD为329cbe2eaf66f2a05c8f569a187ea9144506fc06，upstream ahead/behind为0/0。工作区另有需求、Rust Git与提交反馈界面的进行中改动，均保留。本轮只增加本需求条目及日志，没有功能代码改动、提交、推送或发布。
- 需求：COLLAB-01-remote-control及personal/team/identity/dispatch子项。归入既有工作台feature，不创建或切换分支/worktree。

## 已阅读上下文与事实

- 当前GitTogether AGENTS、README/REQUIREMENTS/DESIGN与本对话此前更新安装日志；GitPresence根与server/bridge/protocol AGENTS、README、协议、运行说明及实际源码。两个仓库通用AGENTS前338行与远端模板一致，模板版本仍为v1.9.1-260916-010202。
- 轻量记忆只用于定位独立GitPresence工作区与既有事实边界。实际检查目录为git-presence/main，不将其实现等同于GitTogether已经接入。
- Presence当前使用Node/TypeScript WebSocket服务；身份取自配置中tokenHash对应grant的userId，repository列表限定可见状态。deviceId由客户端提供，session/world保存在进程内存中，没有账户登录、团队角色、设备凭证绑定或持久化远端命令。
- Local Bridge独立于App运行，支持本机refresh/add/commit/revert/delete/history/revision，远端连接只收发状态；没有fetch/push/远端执行接口。现有Bridge提交禁用hooks，与GitTogether保留正常hooks/签名的生产契约不同，不能直接作为远端Submit执行器。
- 当前GitTogether读取平台/user接口后为本机账号生成UUID，以provider/host/login查重；平台用户数字ID未保存在账号对象中。因此跨设备共同用户身份需要新的服务端绑定，不能直接比较本机accountId或同名用户名。
- 当前生产执行器为同进程Rust Service；Git写入按git-common-dir串行，提交预览绑定任务和工作区内容。Presence网络客户端及App退出后常驻控制执行器尚未接通。
- GitHub官方Users API确认账号数字ID可持久识别用户，login可以改变。Git官方merge文档区分abort当前merge与丢弃本地修改；OAuth原生客户端规范建议外部浏览器授权和PKCE。此处仅查阅文档，没有操作用户账号或设备。

## 本轮建议（尚未由用户确认）

- 复用Presence部署和认证连接，在同一服务内增加用户/设备/团队授权及持久化命令和审计。控制请求独立于易失的状态广播。Git平台登录作为身份入口，无需先新增密码注册；服务端验证平台、主机和用户ID，并登记独立可撤销的设备凭证。
- 个人设备绑定共同所有者；团队另有控制角色和仓库/worktree范围，建议首次设备纳管时明确哪些项目与动作允许团队控制，后续授权内操作不要求目标成员逐次在场。
- 目标端使用共享Rust执行器，固定设备/worktree及有限动作，重新验证授权与工作区快照。命令有唯一ID、期限、接收/执行/完成状态；断线查询实际结果，提交已完成但推送失败时只重试推送。
- Remote Submit延续每分支独立AI草稿：由目标已有AI配置生成Summary/Description，控制方编辑并确认文件清单后，目标执行commit然后push。Git凭证、钩子和签名继续由目标本地流程处理。查看diff需显式鉴权请求，文件取回走Git/LFS。
- App退出后执行需要常驻Rust后台；设备睡眠/离线时不可立即执行。开发时必须统一App与常驻进程的Git执行权，避免各持有一套锁。现有Node Bridge的可常驻能力不等于Rust App已有此能力。
- 将终止当前操作/abort merge或rebase与丢弃更改分开。丢弃前预览具体范围并建立可恢复备份；编辑器未保存内容独立显示，Git提交不能将其当成已收集。
- 取回另设备工作可串联远端Submit、本机Fetch和比较/合并；保留本机工作与冲突处理，不能把远端Commit单独当成文件已到本机。

## 剩余讨论与验证边界

- 待明确团队控制纳管范围，以及用户所说abort的具体含义；所有方案目前是建议，未登记为已确认架构。
- 本轮验证仅为当前源码/协议阅读、远端模板比较、Git只读同步预检与官方文档查阅。没有运行测试、构建、部署或多设备控制；未连接或确认任何线上Presence实例，不操作用户安装版。
- README/DESIGN未修改；需求条目只记录用户需求及待讨论部分。下一轮先承接用户讨论结论，再更新执行契约并开展用户确认范围的开发。
