# 按仓库使用程度刷新与共享远端配额

- 用户原始 prompt：「要有个办法解决这个问题，比如分级别刷新，越最近用的权限越高之类的，现在似乎刷新特别频繁？」附图为GitHub远端访问频率受限HTTP403。
- 模型：GPT-6（当前环境只暴露此标识）。
- 开始：2026-10-21；首次精确时钟为00:58:24 +08:00。
- 结束：2026-10-21 01:17:46 +08:00完成源码检查；随后归档本日志。
- 基准：真实main工作区，22a2373c44de588ec2a324071fc6198c3a4eb58a，起始版本0.34.2；fetch后相对origin/main为0/0。
- 提交：未提交、未推送、未打包、未发布；不操作用户安装版。

## 上下文与成功标准

阅读主/子目录AGENTS、README、DESIGN、ARCHITECTURE、IMPORT-16及此前配额诊断、刷新和缓存实现；远端通用模板版本与本地一致。轻量记忆定位真实main与运行/交付边界；运行进程和Info.plist只读确认安装版0.33.0。参考GitHub官方REST最佳实践与限流文档。React Best Practices用于共享状态和请求去重检查。

成功标准：最近使用仓库获得更短检查周期；连续保存不再以5秒扫描频率访问远端；同账号请求串行且共用提供方冷却；本地扫描不逐出远端SHA缓存；条件请求保留完整目录、分支和旧结果。源码检查、受控验证、真实账号恢复与发布分别记录。

## 对话与行动记录

1. 默认在main处理；保留起始styles.css一行改动。检查发现固定5分钟计时之外还存在本地变化触发、跨仓库并发、16读取器逐出和丢失retry/reset四条放大路径。
2. 实现前登记IMPORT-16-refresh-priority，沿用IMPORT-16-provider-budget。告知用户分级周期、连续保存合并和账号冷却方向。
3. 调查期间另一个任务写入旧工作目录清理，涉及service.rs、use-remote-repository.ts、API模型、文档及版本；这些不是本任务产生的内容，后续仅局部修改相邻代码，保留全部既有差异。

4. 最近使用时间在v2偏好保存，打开与离开工作台、展开仓库及新本地Git变化更新；每仓库最多每分钟写一次使用时间。关联、置顶和曾使用仓库共享workspace读取器，Dashboard不再自建按行读取器。五档周期为5/10/30分钟、2/6小时，置顶最长30分钟；账号目录每30分钟检查。使用级别变化保留成功时间和重试期限，连续本地变化最短2分钟一次远端检查。
5. 首次后台检查分散到3秒至2分钟；每次最多一个后台工作台，并给当前工作台留一个读取位置。排队资源在获得位置时按最新优先级选择，取消只移除自己的等待；在排队期间的本地变化由即将开始的检查合并覆盖。呼吸状态只在获得位置后启用，等待时显示准备读取。
6. Service共享ReadState，移除context中16项读取器缓存及其本地扫描逐出路径。账号预算按API服务和已验证login隔离，重新授权不清除已知账号冷却；每账号最多128个在途/等待HTTP读取，实际出站串行，依据remaining/reset调速并保留约20%预算。缺少预算头时至少间隔250ms，单次普通排队间隔最多30秒；耗尽时仍遵守完整冷却期限。
7. 主配额、429和403次级限制分别依据remaining、retry-after和有界错误消息判断，普通403保持权限错误。Retry-After和主配额reset采用较晚截止；未知次级限制从1分钟起有界指数退避。原始错误正文只在内存中有限解析，不回显或落日志。Provider诊断记录实际响应状态和等待毫秒；未进行真实请求量统计。
8. 不可变SHA结果与有验证器的GET响应共用最多512项、32MiB序列化内容/头字段的LRU，按账号/服务/凭据代际隔离。304合并新响应头并保留原分页，无验证器响应不额外存副本；账号移除清理其缓存。token不作为缓存键明文或日志输出，权限/context复核继续保留。
9. Tauri与HTTP使用同一个import_response封装，错误独立传递retryAt；部分工作台先发布成功分支和旧结果，再遵守冷却。成功读取刚耗尽额度时也提前安排等待；Git引用更新错误和分支参与记录错误不会丢掉冷却。前端普通远端错误最多退避30分钟，提供方更晚截止继续有效；本地服务/扫描保持原5分钟退避上限。
10. 保留并行任务的旧目录清理、部分fetch错误、API形状与文档差异；没有覆盖styles.css原始一行。并行任务将0.34.2提升到0.34.3，本任务再将产品权威版本与npm/Cargo清单和锁文件一致更新为0.34.4，依据为刷新/限流修复的patch递增。

## 完成工作

- 需求归属：IMPORT-16-refresh-priority、IMPORT-16-provider-budget-source；预算父项和provider-budget-validation继续保留未完成运行验收。
- 前端：auto-refresh、use-auto-refresh、use-workspace、use-remote-repository与App/Dashboard接入使用级别、共享结果、排队及冷却。API边界验证可选retryAt，部分成功结果继续保留。HTTP远端工作台允许15分钟总读取时间，以容纳串行预算下的多分支冷启动；单个远端HTTP请求仍限15秒。
- Rust：provider/read_state.rs维护队列、冷却及有界LRU；provider.rs接入共享状态、条件请求和限流解析；service.rs的context/账号Provider和桌面/预览响应封装复用同一状态。
- README增加使用级别和限流等待说明；ARCHITECTURE补充IMPORT-16，更新置顶和调度器契约。没有更改视觉规范。

## 验证方式与剩余边界

- 最终0.34.4的npm run check通过。
- cargo check --manifest-path src-tauri/Cargo.toml --locked --all-targets通过，无编译警告；只编译目标，没有运行测试。
- npm run build通过，332模块；保留既有JavaScript分块超过500kB提示。
- git diff --check通过。React Best Practices核对稳定订阅、动态优先级、不重置退避、取消隔离和共享数据来源；保留原控件、焦点、草稿及账号服务契约。
- 按当前项目的Tauri规则，没有新增或运行自动化测试，也没有伪造受控运行结果。超过16仓库的实际HTTP计数、冷却期零出站、条件304、取消/恢复和真实账号限流恢复尚未运行验收；不能仅凭检查/构建声称安装版问题已消失。
- 没有读取/导出用户凭据，没有触发真实用户REST重试、Git写操作或新授权，没有启动/重启/更新用户安装版0.33.0；没有提交、推送、打包、公证或发布。主线保留全部本任务及并行任务未提交差异。

## 参考

- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
