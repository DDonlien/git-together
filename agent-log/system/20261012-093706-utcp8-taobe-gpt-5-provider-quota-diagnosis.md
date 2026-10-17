# 多仓库远端限流：日志诊断与安全方案选择

- 用户原始 prompt：「我们仓库很多时会遇到这个问题，根据日志查看问题并选择安全合理的解决方案」；附图显示GitHub远端访问频率受限HTTP403及保留旧目录/分支。
- 模型：gpt-5，当前环境只披露此最具体标识，未臆造细分版本。
- 开始：2026-10-12，本轮先进行预检；没有记录精确开始秒。结束：2026-10-12 09:37:06 UTC+8。
- 工作区：codex-standalone-ts/main，532da7a47c799c2bc6036b8a37799903460dd47b，源码0.24.0。
- 同步：记录默认fetch与同期旧引用清理的风险，最终显式只读fetch origin main成功、ahead/behind0/0，没有修改抓取配置、其他引用或工作文件。
- 提交/推送/打包：未执行；这轮是诊断和方案选择，不实现修复，不操作用户安装版。

## 上下文与保护边界

完整读取根/macOS AGENTS，当前README、IMPORT-16与检查周期/缓存相关需求、Rust架构、最新provider/分支行为/Dashboard及性能记录任务日志；在线模板版本v1.9.1-260916-010202与本地一致。轻量查阅MEMORY.md只定位Tauri迁移与历史/当前交付边界，当前事实另行核实。保留当前provider、Presence、远端控制、Dashboard、Windows等全部未提交改动，不分配子Agent。

只读ps与Info.plist确认已安装/运行的是0.22.10，PID7774；没有启动、关闭、点击、更新或重启该应用。直接读取原有日志文件，没有调用会清理日志的diagnostics status/open接口。没有读取、解密、导出或重放账号令牌；没有对GitHub发起真实用户REST诊断请求或重试，没有修改系统代理/TLS/权限。旧Node后台和旧测试不作为当前Rust证据。

## 固定日志截面

来源：~/Library/Application Support/GitTogether-Standalone-Demo/logs内现有JSONL，只筛component=app、version=0.22.10、当前session；统计截止固定为2026-10-12 09:26:00 UTC+8，避免滚动日志导致复算不一致。日志总目录约128MB，不能把所有版本/预览事件算入本次运行。

- 当前session起点2026-10-12 00:06:28 UTC+8，首个明确rate-limit事件00:26:40.997，最后截面事件09:24:44.717。
- 462条带requestId的远端读取限流失败，均属于remoteWorkspace。
- 前端带requestId的remoteWorkspace启动1922次、localWorkspace启动90020次、fetchRepository启动1922次、账号目录refresh224次。这些是原生API调用，不是GitHub HTTP请求数。
- 前端和Rust都记录api start/end，直接数全量API日志会翻倍；本次按带requestId的前端事件统计实际逻辑调用，单独使用后台resource摘要统计仓库数，不回显摘要或明文路径。
- 1208条refresh retry记录的retryMs均为300000，即5分钟。这些包含其他失败，不能全部说成限流重试。
- 后台结果涉及21个本地/远端仓库；09:24这一个分钟内仍有21个仓库的226次成功本地扫描和15次远端工作台启动，确认不是只在不同日期累计超过16个。
- 日志未记录真正HTTP层的limit/remaining/reset/retry-after，因此不能精确还原GitHub总请求数、剩余配额、具体恢复时刻、其他应用占用或实际瞬时HTTP并发。

## 与安装版源码核对

使用git show v0.22.10核对，避免拿未发布0.24.0或旧Electron实现解释安装版；当前Rust这些核心机制仍在。

1. Service::context中的readers只保留16项，满时按BTreeMap首key移除，不是LRU；Provider拥有自己的SHA历史/树缓存。localWorkspace也先取得context，因此每5秒的纯本地扫描同样创建/触碰这些远端Provider。21个活跃仓库超过16，缓存对象必然被替换；后续远端读取可能不得不再次下载未改变的历史/树。这是确定存在的放大路径，具体多发多少HTTP请求因缺少命中日志不能量化。
2. 每仓库自己的刷新计时器只限制该仓库一个在途请求，没有账号级HTTP队列；每个workspace又并行读取最多4个branch的历史和树。多个仓库同批唤醒时并发相乘；日志证明同批工作台读取，但不能把理论上限当实际并发峰值。
3. Provider::get把403且x-ratelimit-remaining=0归为截图中的频率受限，也将429归为此类；只返回错误字符串，丢弃reset/retry-after预算。auto-refresh的interval和maxBackoff都为300000，指数退避实际始终封顶5分钟；不同资源/目录刷新也没有共享冷却。手动重开新读取器还可能丢失前端退避。
4. 可变的目录/分支列表没有ETag或Last-Modified条件请求。历史/树已有按SHA缓存，应该修复其生命周期和容量，而非再建一份无边界缓存。

截图HTTP403对应安装版的remaining=0判断，支持主配额耗尽，不是将任意403认作令牌过期。仍不能根据当前日志断言全部462次都是403、没有次级限流，或配额全由此App消耗。

## 选定方案：先控制请求，再减少重复

归属IMPORT-16-provider-budget，本轮仅完成诊断/决策，后续实现未开始。

- P0：在Rust共享传输层以provider host、已验证账号身份和rate-limit resource建立账号级有界请求队列/预算。多个仓库、目录刷新、手动读取共享冷却，不把状态放在随时可能重建的单个Provider里。GitHub读取初期保守串行并按响应预算调速，交互读取优先但不能绕过限流；其他账号和Gitea不被GitHub暂停牵连。本地扫描、纯本地catalog/status、现有Git写事务不进入这个REST队列。
- P0：保留结构化的主/次级限流信息。遵守Retry-After及remaining=0时的reset时间，二者均适用时采用较晚截止；未知次级限制至少等1分钟，再有界指数退避并错峰恢复。队列取消只撤销当前等待者；显示旧数据和实际等待状态，不把冷却当账号失效，也不强制重连。
- P0：修正Provider与本地context/缓存的耦合，纯本地轮询不逐出远端读取缓存。远端不可变SHA内容按账号/凭据代际/仓库身份隔离复用；有内存字节上限和合理淘汰策略，在账号移除/权限或凭据变化时正确失效。不能只把16改成无限，也不能削弱Git写动作的context复核。
- P1：对目录/分支等可变GET启用认证ETag/Last-Modified，304只复用同一认证范围的成功缓存；列表背景只做轻量refs/HEAD发现，历史/树按SHA命中或实际查看需求加载，保留完整信息、用户草稿和真实截断/未知提示。不为“性能”隐藏仓库/分支或改变它们的管理语义。
- 诊断只增加provider/endpoint枚举、状态码、剩余/重置/等待时刻、排队和缓存命中/字节等安全字段，聚合记录；不输出令牌、明文仓库路径、文件内容或原始provider错误。日志吞吐/GUI卡顿由并行IMPORT-14-performance任务处理，不覆盖其实现。

不选：轮换/增加令牌、反复重新登录、无视等待时间重试、关闭TLS或权限保护、单纯扩大常驻缓存、把全部分支永久隐藏。Installation token/webhook/GraphQL涉及新的授权或部署和独立限制，不作为这次首选修复。

## 依据与后续验收

- GitHub官方限流：https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- GitHub官方最佳实践：https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- 普通用户认证请求常见主预算5000次/小时，并与其他代表该用户的App/OAuth/PAT共享；以实际响应头为准，不硬编码预算。认证304不占主配额，但不代表可以忽略次级限制或无限轮询。
- 后续在21个以上仓库、相同SHA多分支、429/403/reset、取消与账号隔离的受控Rust环境验证：冷却期实际出站请求0，恢复错峰，缓存按容量真实命中，未知/旧数据保持，Git事务不受影响。按当前项目约束不运行旧后台测试、不以浏览器成功代替安装版验收。
- 本轮仅新增待实现需求和这条诊断日志，没有修改架构实现、版本、用户账号/文件、运行服务或安装包，没有提交/推送/发布。
