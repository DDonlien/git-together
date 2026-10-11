# 批量仓库读取故障诊断与修复

- 开始：2026-10-11 20:55:53 UTC+8；当前模型仅可确认gpt-6，执行者taobe。
- 用户原始prompt：「最新版本海量仓库读取错误，检查日志看看为什么，最基础的 git 操作没理由有问题」。
- 范围：既有RUN-01-tauri迁移/Git读取；先检查安装版真实日志，修复确认的共同根因。保留Material界面、账号与关联数据、正常Git配置及用户仓库。
- 工作区：codex-standalone-ts/main，起始b1060ddb27；fetch后与origin/main为0/0。已有REQUIREMENTS.md行序改动属于其他任务，保留不暂存。
- 当前安装与实际新会话日志均0.22.4，进程20:52:03启动；源码0.22.5先前签名但公证/发布未完成，不把源码版本当作安装版本。
- 成功标准：说明日志的真实失败位置/安全分类与可重现原因，隔离实际Rust/Git验证修复及失败保留，再执行类型/Cargo/构建和授权的main推送、签名公证/公共回读。当前规则不新增/运行项目测试套件。
- 授权沿用自动交付及既有签名/公证配置，不启动/操作/升级用户安装版，不索要解锁、不输出或重放凭据；真实仓库只读，写入验证使用隔离仓库。
- 初步日志：20:52—20:58本地API调用返回成功；fetchRepository后端有28失败（前14与客户端取消对应、后14被客户端归为permission），remoteWorkspace成功14次。后端目前没有详细错误分类，不能把客户端通用“权限”归类当作账号失效证据；需逐任务只读诊断。
- 模板核对：当前通用部分与官方agent-template/main的v1.9.1-260916-010202一致，仅项目占位内容不比较；不修改模板。
- 只读生产Service诊断遇到系统加密存储当前不可读取，原加密账号文件保持。没有要求解锁、重放令牌或借此断定账号失效；因此未宣称逐真实账号联网验收。
- 共同根因复现：当前系统HTTP/HTTPS/SOCKS代理均已启用，终端有代理环境，Finder应用没有同样的环境。公开git-together仓库在终端0.70秒读取成功，在最小Finder环境25秒仍无结果；生产Rust Network相同环境12秒限时失败。代码确认reqwest启用system-proxy，而Git子进程原本只继承环境，未读取系统代理。
- 修复后同样的生产Rust Network/Finder环境读取公开仓库成功，645ms。通过CFNetwork按URL读取当前静态代理与绕过，仅注入Git/Git LFS子进程，不保存配置；目标URL匹配的Git代理（含显式空值）与现有环境保持。
- 其他会话独立完成并公开0.22.6仓库网址入口，源码4084cf046f及收尾1a690794db已继承；本轮不重归属其改动，不在其发布期间推送。本轮补丁版本递增0.22.7。
- 实际Git Smart HTTP隔离核验：fetch确实更新远端引用；HTTP403分类permission，不存在的分支分类git-remote-ref-missing，超时timeout、取消aborted且active归零，随后fetch恢复；HEAD/index/工作文件保持。原目录失效的localWorkspace记录partial/1失败；退出码128、匿名资源/span与耗时写入，日志无假令牌、路径或地址。临时API初始化需要仅在诊断进程提供loopback NO_PROXY（reqwest静态系统代理不处理系统绕过），关联后移除再验证Git的原生绕过；不改变用户系统/环境设置。
- 首次临时诊断编译发现Provider构造返回Self而非Result及digest需限定util命名空间，已纠正后编译通过；初次隔离API502是诊断环境缺少loopback排除，已按上条修正，不将这些尝试计为通过或实际账号故障。
- 前端类型、Cargo --locked及生产构建通过（263模块，仅既有大chunk提示）；当前新版本同步后最终检查与正式签名发布待继续。未新增/运行项目测试套件。
- 0.22.7最终类型、Cargo --locked和263模块生产构建全部通过；安全分类说明保持普通中文，内部代码仅写有限日志。最终隔离诊断再次完成上述实际fetch/失败/取消/恢复及日志核对；最小Finder环境公开仓库读取725ms成功。没有扩大为逐账号/私有仓库或安装版运行验收。
- 源码提交ca72e63949418a5fe454e11bdeb1698dabcff58f已正常推送main，远端回读一致；只暂存本轮15个文件/段落，REQ其他任务的行序改动保留。正式构建使用已提交main的独立干净克隆，不切换共享工作区或加入其他未提交输入。
- 正式0.22.7构建再次通过类型/Cargo --locked、前端和Rust生产编译；最终包Developer ID为86J7X3KZ5Z，标识com.gittogether.standalone。Apple公证233fbb2d-ee34-4e12-9b3d-0fdb3ba03086为Accepted，staple/validate、deep/strict签名及Gatekeeper核对通过（仍返回系统既有security disabled override，本轮未更改安全设置）。
- https://github.com/DDonlien/git-together/releases/tag/v0.22.7已公开为stable/latest；tag与main源码ca72e63一致。公共latest/Atom、latest-mac.yml、latest.json、更新签名及完整ZIP/tar大小和摘要全部核对，build-info的publicUpdateVerified=true。ZIP为4226562字节、SHA-256=99cc517a438eedbf5b0af16c9039b0002b0066b9152e9d676ad39a6f59447f6a；tar为4220860字节、SHA-256=e1129c450ae4ca1cd53e1e37da39582d4822f3c1b753718c69b85a690b96bcbd。
- 从最终ZIP另行解包核对0.22.7、标识和团队，包内仅gittogether；解包后deep/strict签名及stapler validate通过。额外匿名回读最新latest.json与本地完全一致。正式包保留在_builds/gittogether-0.22.7-macos-arm64-TxYPsm，独立证据保留在忽略的macos/artifacts/mass-git-read/release-proof.json。
- 未启动、操作、替换或重启安装版，未更改真实用户仓库或账号配置；已移除本轮在真实日志目录生成的单条read-inspection日志，仅删明确匹配本轮session/time/version的文件。隔离Smart HTTP服务/临时仓库已结束，正式签名、公证、发布和公共回读均完成；收尾文档单独同步，剩余REQ行序改动属于其他任务。

- 结束：2026-10-11 21:41:24 UTC+8；RUN-01-tauri-git-network全部完成。
