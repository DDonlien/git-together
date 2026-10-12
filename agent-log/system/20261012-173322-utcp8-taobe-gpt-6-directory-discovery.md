# Windows父目录匹配边界修复

- 用户原始prompt：「我在 Windows 上尝试匹配整个 Git 仓库的本地对象时，显示目录超过 4000 个文件夹或 8 层。这其实根本无所谓，我觉得你的逻辑有问题。」用户描述PROJECT/GITEA或GITHUB/PROJECT-NAME/BRANCH-NAME/.GIT的常规层级，要求有限检索（保守6层），到达层数仍无Git标记时放弃该支路，不因worktree内容计数阻止匹配；承认异常规模可以有安全预算，要求检查问题。
- 模型：gpt-6；当前环境仅提供这个最具体标识。
- 开始：2026-10-12 17:33:22 UTC+8；结束：2026-10-12 19:17:28 UTC+8（本轮源码及候选包验证结束，正式发布仍受阻）。
- 当前适用根/macOS AGENTS及IMPORT-04已读；通用模板远端v1.9.1-260916-010202一致。按持续授权main提交/推送、同源macOS及Windows x86/x64发布，不操作已安装应用或要求解锁。
- 原实现已支持普通.git目录和linked worktree的.git文件，且发现checkout后停止其内容遍历。主要错误是depth>8导致整个discover返回Err，从而不保存任何已找到结果；错误文案混合4000数量和8层而没有说明真正触发原因。识别标记之前收集目录全部条目也没有必要。
- 成功标准：PROJECT范围内真实clone/worktree均匹配；超过4000个项目内部目录不触发扫描预算；旁边10层无关目录不让整次失败；第6层可识别、第7层新支路不深入；匹配按remote/分支而非文件夹名称，符号链接与取消边界保留，Git HEAD/index不变。Windows两种目标完成原生匹配及安装器核对，公共更新源一致后交付。
- 实现：先symlink_metadata(.git)识别文件或目录，标记检查不列出项目内容；无标记第6层停止该支路。预算仅统计尚需展开的父目录，保留4000异常保护及每仓库64个关联上限，分开准确报告；已完整核对并记录的Git登记工作目录不重复检索。取消/读取失败/安全预算及保存异常保留原子失败，深度截断属于正常有限搜索。
- 保留其他任务的全部工作和索引。复用已有独立main快照，df8f9e1快进至08adcb73bb；HEAD版本0.29.1，主工作区另有0.30.0等Presence/平台/性能工作未提交，本轮不复制或打包它们。
- 验证：类型及生产构建通过（285模块、既有分块建议）；首个扫描代码Cargo通过。现有不随App分发的Windows原生验收工具加入实际Service.handle匹配取样，采用临时clone、gitdir-file、4100个checkout内目录、无关十层树、6/7边界、未改HEAD/index和取消不保存。适配Arc<Service>调用后Cargo重新通过，不新增旧框架测试或运行历史Node后台套件。
- 当前真实临时Git取样：Developer ID签名后的独立探针调用实际Service.handle，git-folder/gitdir-file、4100个checkout内部目录、无关十层树、6/7层边界、保留HEAD/index及取消无保存全部通过。匹配4个工作目录（含原先选定范围外的已有来源目录），未覆盖既有关联。相同目录调用旧main discover，实际复现「超过4000个文件夹或8层」错误；旧实现并没有把4100个checkout目录递归计数，触发来自无关深路径。
- 探针使用临时Git、虚构账号和fixture-only凭据，不接触真实账号目录或网络API。探针复用原生验收工具同一函数，生产匹配服务通过公共有限方法调用；没有mock.git或自行模拟Windows路径。
- 并行主线新增Windows授权端口修复36179f0b60后，保存本任务独立补丁、干净快进并重放；本次版本0.29.2→0.29.3，四清单一致；不覆盖主工作区已有0.30.0未提交版本/功能。随后已完成本次源码提交/推送；三平台正式发布状态见下。
- 源码交付：主线先进入8689177260的候选包记录；从该已提交main新建独立干净快照并只重放本任务9个路径，得到d482887edbf71930835d97ed73303ea45531b4a1，已推送GitHub main。原独立2698ba38提交保留；主工作区的0.30.0及其他功能/文档未被打包或覆盖。最终证据另从fab393a53a main快照更新，仅提交本需求和本日志，不把后来Presence功能重新打入0.29.3候选包。
- Windows原生构建：GitHub Actions运行38237787126，Windows x86和x64两个任务均success，实际Build and verify installer成功。已有验收程序新增bounded-directory-matching，与DPAPI/篡改拒绝/ACL/Unicode Git/提交和staging保留/进程树取消/日志隐私共同运行。x86下载报告明确9项通过，程序Machine=332、安装器大小5512246、SHA256=1a2d129ab0c6aa007721cbad45d69666f17c8905ec1dc4509cc119abf76a2a51；源码d482、版本0.29.3，安装器核对及临时界面启动通过。x86更新签名及本机独立验证通过；无Windows Authenticode证书，不将更新签名当成Authenticode签名。x86运行在Windows runner，不能等同独立32位设备验收。
- Windows包收集限制：默认gh下载及任务临时下载器遇到CI存储下载超时；x86一次完整ZIP取得，核对认证API元数据digest、ZIP CRC、固定文件名和源码后签名，x64完整包本机回读尚未完成。保留两个成功原生CI任务和产物，不将CI成功冒充完整公共更新源验收。未修改系统代理/TLS或全局gh，不提交临时下载器到产品。
- macOS候选：正常package:desktop在公证预检退出69，No Keychain password item found for profile: gittogether-notary。仅为验证本机候选构建使用临时脚本跳过已失败的history预检；仍实际执行正常notarytool submit并要求Accepted才可继续发布。候选GitTogether.app完成Developer ID签名（ZHENGTAO GONG，86J7X3KZ5Z），版本0.29.3、来源d482、bundle只含gittogether主程序；submit同样退出69，因此没有本版本Accepted/staple/validate。候选信息明确notarized=false、publicUpdateVerified=false。
- 公证故障只读诊断：签名证书可用，系统keychain返回unlocked/readable，仍找不到既有notary profile。不能据此归因于项目文件夹权限或要求解锁，也未重置配置、重放密钥或绕过系统保护。19:13左右正常history重试仍退出69。
- 验证及发布边界：同步后类型、Cargo --locked及生产构建重新通过（286模块、既有分块建议）；临时真实Git取样重跑通过。公网上最新正式版本仍v0.28.3（本轮回读），本轮没有发布0.29.3/tag或更新公共清单。IMPORT-04-discovery-boundary源码及原生验证完成，单列release项保持未完成。用户真实Projects目录及安装升级未验收，未启动/替换/重启已安装GitTogether，未改真实账号或关联。
