# 精简工作目录悬浮提示

- 用户原始 prompt：「这里 hover 的显示信息怎么这么多」；附件为分支目录入口悬停列出四个完整工作目录。
- 模型：gpt-6，当前环境暴露的最具体标识。
- 开始：2026-10-14T15:05:35.094282+08:00；结束：2026-10-14T15:53:11.450056+08:00。
- 需求：IMPORT-04-path-hover，归于 IMPORT-04-inline。
- 基准：复用本对话已有独立 main checkout；fetch/prune 后从5dcc426快进到7c0f60419be38c5f1a3073c10a1446d2e3cb6936，版本0.31.3，开始时干净。共享主工作区保留其他对话0.33.0图谱操作及全部未提交改动，不操作其index/HEAD。
- 已读取适用AGENTS、权威文档、当前及较新的发布日志；官方模板v1.9.1-260916-010202未发现版本更新。遵守不新增/运行旧测试、自动main提交/发布及不操作已安装App的持续授权。
- 成功标准：生产Dashboard多目录分支的title等于当前显示的第一条完整路径，没有换行和其他路径；+N及全部任务保留，点击/Enter配置、Escape恢复和未关联提示正常。
- 诊断：Dashboard BranchRows使用paths.join('\n')作为原生title，任何同分支多个工作目录都会全部展开；关联弹窗的初始路径已使用第一条路径。
- 计划：只修改该title表达式；版本按文案修复递增patch到0.31.4；隔离生产预览、类型/Cargo/构建验证后按持续授权发布。

## 源码验证

- 只把分支目录按钮的title由paths.join改为paths[0]，保留其文本、+N、aria-label、权限/禁用和点击处理；共享0.33.0清单不改。DESIGN同步该局部规则。
- 四条main目录、另一条单目录及未关联feature在0.31.4隔离生产App中回读符合预期；Enter打开原配置弹窗且预填第一条路径，Escape关闭并恢复原按钮焦点；没有保存/解除关联或执行Git。全分支任务数量和操作计数保留。浏览器原生提示采用真实title回读，截图只记录页面上下文，不冒称系统tooltip已被截图。
- npm run check、npm run check:rust、npm run build、git diff --check通过。保留已有大chunk提示；没有新增/运行测试。源码版本及三个镜像按文案修复递增patch到0.31.4。
- 初次版本脚本对Cargo锁包名作了错误假设；确认实际gittogether后完成单条镜像更新，以上最终检查通过。执行日志不是安装版验收。

## 发布与最终交付

- 修正038acaaeef4ce85cd59072e2fe61146c9657c264已正常推送main，v0.31.4绑定同一提交。正式包位于/Users/taobe/Projects/GitHub/Personal/git-together/_builds/gittogether-0.31.4-macos-arm64-6cWuzz，Developer ID签名、Apple ec138fe3-eb27-410c-8770-3ed4964ada18公证Accepted和staple/validate通过。既有spctl返回security disabled override，不冒称默认Gatekeeper实景。
- 为减少等待，在Mac构建期间先请求同一完整SHA的Windows工作流38528139200；正式收集器复用它，没有重复请求。x86/x64原生构建、实际安装/界面及有限原生检查通过，机器类型332/34404，版本与来源一致，更新签名通过；没有将更新签名等同于Authenticode。x64产物下载慢，最终原流程完成，没有停止构建或绕过任何门槛。
- 正式发布 https://github.com/DDonlien/git-together/releases/tag/v0.31.4 。原发布脚本完整匿名更新源/latest/Atom/三平台清单与全包校验通过，build-info.publicUpdateVerified=true；另外逐项计算本地9项资产的大小和SHA256，与GitHub公开API的9项digest全部一致。补充本次悬浮提示修正说明，逐字回读发布正文一致；README与需求同步。
- 交付期间main新增仓库置顶的独立提交cc497e8/67f620a；干净独立checkout仅快进以记录文档，保持其0.32.0代码和版本，不重打或更改已经核验的0.31.4资产。共享工作区已由其他任务改为0.33.1，保持其版本、所有改动和index/HEAD。本任务不声称后续置顶或0.33.1代码已由本版交付。
- 原生tooltip的title值及键盘配置流程在隔离生产App回读；页面截图仅保存上下文，不将截图无系统tooltip等同于安装版验证。生成的fixture/观察文件忽略且未入库；为清晰截图重新打开固定0.31.4 bundle后已关闭，未改浏览器视口。最初无TTY fixture按准确PID及cwd核对后停止，最终TTY实例也正常停止。未操作用户账号、关联、已安装App或要求解锁。
- 完成日志按实际Asia/Shanghai结束时间重命名；纯交付记录不产生新版本或安装包。
