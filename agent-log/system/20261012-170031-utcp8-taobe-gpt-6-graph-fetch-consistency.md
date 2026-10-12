# Git Graph 与同步提示一致性

- 用户原始prompt：「这里很奇怪，如果我能 pull 不就意味着远端有一个本地比我的 change 的 head 更新的分支吗？那为啥左边的 graph 没显示出来，因为那个分支和我本地是同一个分支？这种情况 git graph 也应该处理吧？」。
- 本次追加：「我 pull 了一下有了？这更奇怪了这个不是 fetch 就有了么，如果我没 fetch 我也不应该能看到右上角的 pull 提示啊」；「然后又消失了……」。
- 模型：gpt-6，运行环境只暴露这个最具体标识。
- 启动：2026-10-12 16:30:45 UTC+8，main / df8f9e1cb95cb0e671cbb4bd59e278a5f062feb9 / 0.28.3。
- 结束时间：2026-10-12 17:00:31 UTC+8；本日志随独立修复提交，推送结果以交付时远端回读为准。
- 已读当前根/macOS AGENTS、README、DESIGN、REQUIREMENTS、ARCHITECTURE、当前对话上一轮日志和相关记忆；模板在线版本一致，fetch/prune成功且main/upstream为0/0。保留所有并行任务文件与索引。
- 需求：R-05-gitlens-graph-sync，在实现前登记。
- 成功标准：同名local/remote不同HEAD独立显示；有效的远端提交历史不因文件树读取失败而被丢弃；同一origin引用不在多个位置出现；未知祖先关系不产生Pull/Push数量；Fetch成功触发共享本地读取器及时更新，保留连续多选、选择与草稿，Pull后相同真实SHA合并。
- 源码发现：Provider将history与tree合成一个成功条件，tree失败会丢弃已验证的新HEAD提交；preserveRemoteWorkspace随任何task.error恢复旧HEAD。combine直接并集API与本地origin标签，可能把同一个引用留在旧新两个位置。gitSignals对无法证明的HEAD差异也加Pull与Push数字。后台fetch成功未通知本地读取器，等待原5秒轮询。
- 三张截图不能确定每个关联目录当时的HEAD。第二张节点明确为另一个本地工作目录的未推送提交，第三张两个HEAD已重合；不将这些截图当作已验证的远端领先证据。Pull组数字统计工作目录，不是提交数；远端API本身可提前知道分支HEAD，不必等待Git Fetch。
- 验证计划：隔离手动真实Git与Rust Provider/浏览器取样、类型/Cargo检查及生产构建；按当前AGENTS不新增或运行旧后台测试。当前任务未请求更新安装包，不操作已安装GitTogether或账号凭据。

## 完成与验证

- Provider的已验证HEAD/history独立保留，tree失败只标记该任务错误；preserveRemoteWorkspace仅在新HEAD历史缺失时保留旧快照，已读到新HEAD时不回退。混合图以共享远端任务HEAD归一化origin标签，丢弃过期跟踪位置和冗余origin/HEAD别名，同位置长/短origin名称去重；实际本地HEAD、不同工作目录和其他remote标签保留。
- Pull/Push仅对真实祖先或已证明共同祖先的分叉产生工作目录数量；无共同祖先证据时明确未知且没有数字。单次信号计算复用每个HEAD的祖先集合，避免多个目录重复遍历。Fetch成功唤醒原共享localWorkspace读取器，取消/错误/移除不发新触发，工作更改指纹不包含tracking refs，因此没有新增远端读取器或Fetch循环。
- 初始独立快照0.28.4完成验证；提交前main新增独立IMPORT-04-open-folder / 0.29.0提交，按原祖先合入而不覆盖。最终本次patch版本0.29.1，package.json、lock及Cargo镜像一致；其它未提交任务保留，只提交本次差异；签名、安装包和三平台发布不在当前请求中，也未操作用户已安装GitTogether。
- 类型检查、Cargo --locked检查及生产构建通过。最终前端小幅调整后类型/构建再通过；构建只有已有大分块建议。按当前AGENTS未新增或运行旧后台测试。
- 忽略目录内的手动临时Git取样使用独立bare和两个clone。生产模型取样：落后Pull2/Push无数；同步Pull0且零隐藏；领先Push2；已证分叉Pull2/Push2；历史关系未知两者无数字；树失败仍Pull2并明确读取异常。所有情形同名origin/main只有一个位置，两份本地HEAD均在图内，真实父图没有伪造。Fetch前后HEAD/index一致。
- 实际Rust Provider（独立fixture-only凭据及127.0.0.1服务）返回：正常3提交；tree503仍3提交、新HEAD与错误同时保留；history503无本次历史并明确失败。旧快照保留逻辑取样确认：tree失败不恢复旧HEAD；history失败才保留旧HEAD并说明本次实际分支SHA。真实Rust Git task/history读取成功；最初探针使用/var别名未规范化路径失败，改用真实canonical目录后通过，未把探针输入错误当作生产故障。
- 实际生产App隔离页面核对：同名本地/远端分别在新旧HEAD，Pull2代表两个落后目录；原后台并行Fetch/API保持，Fetch成功后约1.2秒即由共享local读取更新，早于5秒轮询且没有额外循环。切换main筛选、选择远端提交；tree失败后新远端节点和选择仍保留，错误独立显示；同步到同SHA时HEAD/origin/main/main合流，Pull零角标消失；取消历史选择后原Summary草稿仍在。图与各工作目录状态、筛选来源一致。
- 图片证据：graph-fetch-ahead.jpg，保存在当前对话visualizations目录；手动Git/Provider/模型取样文件均在macos/artifacts/graph-fetch-consistency（忽略目录），不进入提交，也不等同于真实用户账号或安装版验收。
- R-05-gitlens-graph-sync按上述限定验收完成，ARCHITECTURE同步读取与引用归一化边界；没有新增视觉设计、没有改README的并行读取说明，没有自动修改AGENTS。

- 提交前main更新为8632568554，3-way合并仅涉及需求/架构与版本，六个已验证的图和读取模块与原快照字节完全相同。浏览器追加核对历史未知时Pull/Push均无角标，main筛选和原Summary草稿保留。隔离页面和QA服务已关闭，未干预用户应用或其它服务。最终0.29.1来源的类型、Cargo --locked与生产构建全部复核通过。
