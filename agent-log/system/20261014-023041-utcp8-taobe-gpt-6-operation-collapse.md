# 仓库操作弹窗收起与独立任务

- 用户原始prompt：「处理中的任务 pop 应该可以折叠，折叠回对应的按钮，从而不用独占页面；再次点击打开；期间应该可以处理其他任务」。附件为Submit正在准备提交内容的弹窗。
- 模型：gpt-6；当前环境暴露的最具体标识。
- 开始：客户端2026-10-14 013839 UTC+8；结束：2026-10-14 02:30:41 UTC+8。
- 共享codex-standalone-ts/main HEAD00959e0188有其他任务大量WIP，fetch/prune后的main涉及同名源码/文档，未快进或重置共享工作树。复用此聊天既有独立main副本release-main-branch-created-9kf67r35，干净快进至edbdbb408d8cf09817cdbef0610335f41295cf6b，只提交本任务改动。
- 已读根/macOS AGENTS、相关实现、README/REQUIREMENTS/DESIGN/ARCHITECTURE；官方模板v1.9.1-260916-010202未更新。不自动更改规则、跑旧后台套件、操作安装版或解锁。
- 需求：IMPORT-14-operation-collapse。新要求允许处理期间回到其他任务；保留真实确认、固定任务/文件/HEAD范围及Git安全队列。
- 成功标准：处理时可收起，后台不中断，原按钮恢复且不重发；跨仓库/任务操作与页面切换不丢进度；异步完成/失败不抢占另一弹窗；结果可查看、错误可按既有幂等方式重试；同目录避免重复，共享对象库串行；类型、Rust/构建和生产React验证分别记录。

## 实现与验证

以下为实际实现、验证和交付结果。

- 新增后台收起/恢复及独立操作能力，按版本规则从0.30.10递增minor至0.31.0；四份清单同步。共享工作区0.32.x及其他任务不改。
- 共享操作宿主独立于路由，冻结打开时的确认范围；隐藏只关闭Portal与焦点锁，不卸载异步工作。完成和失败留在原按钮；恢复不创建新请求。客户端写锁改为具体task，仍汇总仓库忙碌并保护目录变更；Rust原有common-dir队列继续串行真实Git。Push反馈保留同仓库多个batch，避免后来任务覆盖先前任务。

- 验证通过：npm run check、cargo check --locked和npm run build。构建仅有原有chunk体积提示。未运行旧后台测试。
- 生产构建React通过CUA与隔离RPC样例验证：alpha/main与alpha/feature各1次生成，收起/切页/恢复无取消或新增请求；编辑Description在后台生成后保留；两个工作目录Commit/Push独立，完成其中一个仍显示另一个推送；后台成功/失败均不抢当前弹窗；原按钮在更改数归零后仍可回看完成结果。
- failure目录首次Push失败后从Submit恢复，仅重试Push，同一个operationId/commitId，Commit总次数1；手填Summary确认取消未完成的AI生成，沿用原契约。beta中栏Submit切页后保留手填Summary及1/2文件选择；Commit只提交选中src/main.ts；中栏Push执行/恢复/完成也不重复请求。Clean准备/执行各1次，收起不discard，后台完成后原按钮保留结果；Pull/Get Latest准备过程也可收起和恢复。截图覆盖亮暗色与原按钮。
- 隔离样例明确不执行真实Git/AI/账号写入；这里只证明真实生产React生命周期/交互与RPC次数，不冒称安装版或真实原生Git验收。Rust common-dir队列未改，编译通过。
- React best-practices复核：根会话宿主避免路由卸载；稳定生命周期回调与memo context避免重新启动effects；进度只按自身操作id回写，已删除任务迟到状态忽略；可访问收起名称及焦点恢复保留，直接Phosphor图标导入，无新业务API/存储。

## 交付结果

- 独立main副本的远端合并保留Presence设备名称/远程卡片更新，版本冲突只保留本需求minor 0.31.0，文档追加段同时保留。最终行为commit 398a6358fdbf9e487695d9d64d25c91677ea869c已普通推送并read-back确认origin/main。合入后类型、Rust编译和构建全部通过。
- 共享工作树仅同步本需求的18个源码/文档文件，新操作宿主追加；已检查原未修改文件与开始备份一致才复制，其余按唯一内容片段合入，保留共享HEAD00959e0188、原暂存区、其他WIP以及0.32.2清单。共享npm run check也通过。
- 最后生产构建UI核对：收起后modal数0、body overflow为空、焦点回到原按钮；亮暗色标题栏收起位置正确。Pull/Get Latest显式关闭确实discard自身预览，收起不discard。临时浏览器与隔离服务已结束，没有真实Git/账号写入。
- 已运行官方npm run package:desktop，但全局发布锁由PRESENCE-05-remote-actions持有（版本0.30.12，source f935173c4d），脚本按原规则拒绝启动；未删除或抢占锁。只读notarytool history在默认钥匙串及明确login.keychain-db下均返回code69：No Keychain password item found for profile: gittogether-notary。只包含login的用户钥匙串/default结果已核实；未更改凭据、解锁或创建替代配置。
- 本任务0.31.0没有tag、正式安装包或公共更新清单发布；代码交付完成，签名/公证/三平台发布受上述外部状态阻塞。不把已推送源码、隔离UI或build称作安装版验收。
- 截图：/Users/taobe/.codex/visualizations/2026/10/09/01a1214e-32cb-7e51-866b-953305f8e8f3/operation-collapse-header.png（最终亮色收起入口）；operation-collapse-result.png（暗色后台完成）；operation-collapse-page.png（最终收起后的按钮与页面）。
