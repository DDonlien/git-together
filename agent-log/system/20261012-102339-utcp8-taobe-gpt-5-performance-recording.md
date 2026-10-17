# Dashboard 性能记录与后台压力

- 用户原始prompt：APP在特定状态下严重卡顿，Dashboard上下滚动不跟手且延迟，展开等GUI交互也相同；可能为Codex大量磁盘IO、多分支资产仓库、许多仓库Git刷新。要求日志加入性能记录，后台IO/网络慢应只体现加载时间，不能卡GUI；保留所有信息，不把分支展开/读取混为界面卡顿。
- 模型：gpt-5，当前环境可验证的最具体家族标识；执行者taobe。
- 开始：2026-10-12 09:20:39 UTC+8（首次时间预检，之前已发送开始说明）；结束：2026-10-12 10:23:39 UTC+8。
- 工作区codex-standalone-ts/main，532da7a47c，0.24.0。同期main-only任务删除旧远端分支造成默认fetch旧ref失败，精确fetch origin main成功；模板HTTP200通用前缀一致。
- 保留并行provider、Presence、Windows及远端控制的未提交改动；本轮不分配子Agent，不提交/推送/打包，不操作用户安装版。原生后台仅Rust，旧Node后台与旧测试套件不运行。
- 已读当前日志协议/白名单、Rust日志/Service/Git、Dashboard展开/状态、刷新机制、架构/需求/README及相关最新任务记录。记忆只用于工作区及源码/安装版边界。
- 成功标准：本地日志可把界面卡顿与后台慢区分，字段脱敏、有界聚合且不制造卡顿；正确记录排队/压力与降级，保留24小时与日志复制；确认的代码压力路径轻量修正，真实用户根因未有证据前保持未确认。
- 初步源码事实：Diagnostics.record同步持锁做目录/文件操作；多分支的td高度/padding/grid行动画和每行重复状态推导可导致昂贵布局。它们是风险而非本次安装版根因证据。
- 需求ID：IMPORT-14-performance。后续记录实现、类型/Cargo/构建、受控压力与安装版未验收边界。

## 实现

- performance-diagnostics以passive事件、交互期间rAF、1秒可见心跳和支持时Long Tasks按10秒聚合。LongTask接口不支持明确记录0，保留其他观测；记录输入排队/下一次rAF、帧间隔、事件循环调度、Dashboard/分支提交观测及在途/峰值请求，不把rAF当屏幕FPS。原生IPC解码不可直接拆分，浏览器body接收/解码和已有同步校验分别计时，不额外编码大DTO。清理pagehide与HMR监听，避免开发时重复采样；无React采样状态或逐帧IPC。
- 前端日志128条有界、单在途传输；后台512条通道、单写线程、最多64条一批，不再在async命令线程同步做日志文件IO。保留普通文件/权限/24小时/128MiB检查；队列拒绝与写失败分别计入丢失，日志/设置明确反馈，不把入队当持久化成功。检查/打开/复制有屏障并spawn_blocking，设置检查仅一条在途。强杀进程最后队列可能丢失，文档明示。
- Service请求以task-local READ_CONTEXT传递匿名资源、诊断与取消；Git只读4/fetch2许可，异步排队可取消。日志保留queueMs、整体durationMs、输出bytes及同队列活动数，写命令不占后台许可；其内部只读验证仍可能等待。没有减小索引/树/分支/提交范围、改动用户Git或把等待判为空。
- Dashboard一次构建分支Map，避免逐行重复扫描完整remote/local列表，并去掉重复push状态推导。超过40分支关闭td/grid高度动画及动画前强制测量，原几何/按钮/功能保持。完整DOM仍挂载，首次展开剩余成本不是本轮已解决的问题。
- 使用React最佳实践技能，补读index-maps/passive-listener规则用于复查；只改当前相关重复工作，不引入新UI库或常驻仪表。
- 起始源码0.24.0；同期平台任务先升0.25.0，本轮新增记录能力minor升0.26.0并同步lock/Cargo镜像；同期分支默认行为升0.27.0，保留最新。其他provider、远端控制、图标、Windows与引用清理任务均保留独立归属。

## 验证

- Rust临时目录手动程序使用生产Diagnostics/Git，不使用账号或网络；5000条记录约60–64ms入队，屏障后5000条与12个真实Git status完成，读并行最大4、最大排队35–45ms、bytes记录有效。旧文件清理、原始path/token/message剔除、写失败累计1及恢复均实际核对。5000条基准后台拒绝为0，未冒称实际磁盘饱和复现。
- 独立Cargo probe曾重新解析缓存依赖，改用同一生产Cargo锁的临时bin包装复核；包装在结束前删除。手动源只在忽略目录artifacts/performance-probe，runtime创建的Git与日志临时目录已清理，没有触碰用户仓库。没有新增/运行旧项目测试套件。
- 隔离生产Dashboard完整600合成分支、td transition=0s、内部scrollTop=720。约250ms手动停顿、20个定时等待和慢日志传输被分别记录；前端丢失171，最终样本另有1条传输损失，均显式保留。首次分支提交观测52–136ms，不能认定已经不卡。最后冷页样本frameMax299、lag351、longTaskMax288及partial，接口支持标记1；后续请求归0且心跳延迟1ms。合成等待不是用户网络/IO测试。
- 会话visualizations目录performance-sample.jsonl与performance-recording.png是受控样本，不是安装版日志。最终冷页console error为空，所有压力页关闭，viewport未改。采样脚本自身不读输入文字/内容或额外测量DOM布局；自动化辅助树/截图可能影响部分窗口，不能把样本的所有调度成本归给产品。
- 全项目类型检查与独立当前修改依赖检查、Cargo --locked、285模块构建及git diff --check通过。早期远端控制任务的branch类型错误在对方修正后消失，本轮未修改该组件。最后Cargo检查无新增警告，Vite大分块建议保留。
- 结束时恢复统一dev：只停止本轮已确认的UI-only PID36604，安装版PID7774不动。并行provider任务已将开发回调独立为4176，实际Rust/React0.27.0、status/catalog/logs HTTP200、githubWebAuth=true、同实例fb2afe1b-75bd-40f6-926b-8c58f2629593、0账号/0仓库/0关联；日志retention24、queued0、dropped0、error空。开发远端控制为non-persistent且默认停用，未执行用户Git写命令或重放凭据。

## 收尾与边界

- docs/performance-logs说明阶段、指标局限、有界记录、排队与丢失；README、ARCHITECTURE、DESIGN及design-qa同步。IMPORT-14-performance-source完成，父项与runtime保持待真实App日志/根因验收，不将Codex/网络/磁盘猜测认定为事实。
- 未提交、推送、打包、安装或操作用户安装版；日志功能需要包含它的新App版本才可用于用户现场。依赖就绪和源码构建不等于已发布或卡顿已解决。
- 总耗时约63分钟，主要为Rust/前端有界日志与取消/压力实现、写失败/隐私/保留验证、实际UI记录及并行规格/版本变化复核。未来下一步是新版App实际复现日志，并据观测处理完整大分支DOM首次挂载/响应解码等剩余成本。
