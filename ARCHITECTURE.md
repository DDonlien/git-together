# Tauri / Rust / React 架构

## 分级刷新与账号请求预算（IMPORT-16）

`useWorkspace`在本机v2偏好中保存`repositoryLastUsed`，打开/展开仓库及新本地Git变化更新使用时间；已关联、置顶和曾使用仓库由同一个workspace读取器维护。当前仓库每5分钟检查，一小时/一天/一周内使用分别为10分钟/30分钟/2小时，其余6小时，置顶最长30分钟；目录每30分钟检查。本地5秒扫描独立保留，连续变化触发的远端检查最短间隔2分钟。资源计时器动态调整周期而不重建成功结果或退避；首次后台错峰，最多一个后台工作台并为当前工作台保留并行位置，排队资源按最新使用优先级调度。Dashboard与工作台不另建同仓库读取器。

`Service`持有共享`ReadState`，所有Provider与目录刷新复用。每个API服务和已验证账号共用128项以内的等待队列，实际HTTP读取串行；按响应剩余额度与重置时间调速，至少间隔250ms并预留约20%预算。403权限、主配额耗尽、次级限流与429分开判断；Retry-After与耗尽时的reset取较晚截止，缺少时间时从1分钟起有界指数退避。冷却期间拒绝出站请求并提供`retryAt`，Tauri和预览HTTP共用响应封装；部分工作台先发布可用分支，再让计时器遵守同一截止。新资源、手动刷新、焦点恢复和重新授权不能清除同账号冷却；不同账号与平台独立，本地扫描和Git事务不进入REST队列。

纯本地context不再创建/逐出16项远端读取器。SHA历史、树、提交缓存与条件GET响应使用服务级LRU，合计最多512项、32MiB序列化内容及头字段，按账号、服务和凭据代际隔离，账号移除时清理。可变GET在同一认证范围发送ETag或Last-Modified，304合并新响应头并复用原分页信息；无验证器的响应不额外缓存。凭据不进入缓存键明文、响应DTO或诊断日志，已有账号/目录context复核与旧结果保留规则继续有效。

## 本地文件树与文件操作（R-05-local-file-operations）

`RepositoryFileTree` 对本地任务挂载 `LocalFileTree`，远端树继续使用只读 Git/provider 清单。`localDirectory` 只列当前目录，不跟随符号链接，并从 Git 查询忽略状态；前端按需读取展开目录、保留空目录、用类型图标和浅色状态区分内容，筛选/排序只改变显示顺序。文件操作走有限 Tauri/API 方法：OS拖入路径先兑换成限时 opaque grant；计划绑定服务身份、仓库、worktree、来源/目标及完整目录指纹。确认前列出每个真实目标，执行时拒绝重名覆盖、路径逃逸、符号链接和 `.git`，检测预览过期；删除经系统Trash/回收站，跨卷移动先复制成功再回收原件。工作目录common-dir互斥和operationId幂等保护并发/重复提交，结果刷新本地目录与Git状态；失败结果保留可恢复的来源和部分完成数，不改变HEAD或index。

Git Graph和文件树的行状态底色独立于行几何绘制。Graph固定42px行及连续SVG轨道，底色通过pseudo-element上下内缩3px、左右端点内缩4px；文字列增加横向内距，各列文字始终高于底色层。文件树按钮横向留白不改变点击区、树缩进或省略规则。徽标和计数胶囊使用显式左右padding，避免单字符与多字符内容贴边。

仓库置顶（IMPORT-13-repository-pin）：沿用gittogether.preferences.v2，增加pinnedRepositories仓库ID数组，旧记录缺省为空并在读取边界校验。useWorkspace唯一维护和保存状态，toggleRepositoryPin使用当前偏好的函数更新；AccountSidebar与Dashboard共享该控制器，不向服务或Presence同步。侧栏按账号内稳定置顶优先，Dashboard在当前筛选结果内先比较置顶，再沿用当前字段和方向排序；置顶不改变隐藏、筛选、关联或Git目标；读取周期按IMPORT-16的置顶上限执行。

Git Graph可见范围渲染（R-05-gitlens-graph-scroll）：完整提交关系和搜索索引仍由现有commit-graph计算；RepositoryGraph以42px固定行高、视口上下各8行缓冲及首尾占位行保留全部滚动高度，scroll被动监听按requestAnimationFrame合并，ResizeObserver覆盖栏高变化。键盘、搜索及父提交跳转先定位全局行，再挂载和聚焦。分支筛选不随滚动重绘，日期格式器复用当前语言和时区；远端专有分支不再重复遍历空的本地祖先集合。RepositoryView合并历史仅依赖内容和必要的空态错误，不依赖读取状态整体；底部动画绑定现有远端loading及当前路径的本地loading，不新增后台API或数据分页。

选择目录的系统打开（IMPORT-04-open-folder）：LocalRepositoryModal通过有限openLocalDirectory(path)打开当前展示的本地目录，可来自已保存关联或本次系统选择，不依赖远端账号权限。Rust校验请求只含path、限长且无控制字符，在阻塞线程规范化绝对路径并确认是现存目录，再复用既有系统open。此接口只返回opened，不读取文件内容、修改关联或执行Git；原openDirectory(repositoryId,taskId)仍用于工作台已关联任务。目录路径不进入诊断日志，浏览器沿用受保护的本机HTTP边界，桌面沿用有限Tauri Import命令。

性能记录（IMPORT-14-performance）：performance-diagnostics独立于React状态，以被动输入/滚动监听、交互期间rAF、可见页面1秒心跳及受支持Long Tasks接口按10秒聚合；组件layout effect记录提交观测，业务请求计数不包含日志请求。响应接收/解码与同步校验分开，不为记录大小再序列化大DTO。记录仍通过有限白名单；接口不支持时显式标识，而非把0当证明。前端日志队列128且单请求；Diagnostics以512容量通道交给单独线程，每批64条，记录接受与实际持久化分开。后台写入/清理的IO不进入异步服务执行线程，检查/打开/复制以写入屏障及spawn_blocking完成，队列拒绝和落盘失败均累计丢失并在日志/设置反馈。Git_READ_CONTEXT在Service请求范围传递匿名日志身份和取消令牌；只读4许可、fetch2许可，异步等待记录queueMs，实际写命令不占后台许可。大分支表移除高度动画并一次构建分支Map，不减少数据；首次完整DOM挂载的剩余成本与真实安装版根因仍需后续确认。完整字段/边界见docs/performance-logs.md。

2026-10-12托管平台扩展：Provider统一支持github、github-enterprise、gitlab、gitee、gitea。企业服务器按域名读取/api/v3，ghe.com企业云读取api子域。GitLab使用/api/v4/projects数字ID和完整namespace，分页读取branch/history/tree/commit/diff/blob。Gitee使用/api/v5，access_token只在Rust请求中使用，不进入DTO、跳转或日志。Git网络继续通过匹配origin的辅助器提供凭据，GitLab使用oauth2用户名，完整嵌套路径保留。

OAuth应用按平台+origin保存在provider-oauth-v1.encrypted；更换Client ID不继承旧Secret，配置不进入Catalog。GitLab使用PKCE，GHES/Gitee使用授权码+Secret，公共GitHub保留既有App及PKCE。state只用一次，拒绝/取消/过期/失败终止等待并清除会话密钥，令牌获取后重新验证身份。GitHub SSO required/partial-results作为范围未完整开放处理。桌面回调用4174，浏览器开发用4176；开发页通过同源/api/authorization有限代理调用自己的Rust服务，避免占用安装版端口。端口由服务固定决定，renderer不能指定任意redirect_uri。

分支默认行为（IMPORT-12-branch-behavior）：v2本机偏好增加可选unworkedBranchBehavior（default/hide，缺省default）和shownBranches字符串数组。branch-behavior基于登录账号绑定的hasAccountCommits和hasAccountPush结果派生有效隐藏键，手动hiddenEntries优先隐藏，shownBranches显式恢复优先于默认隐藏；派生结果不写回隐藏记录，不改变账号、目录或Git状态。linkedTasks、关联判断及统计复用有效键；未关联仓库行只报告自己已读取的隐藏键用于现有恢复入口，保持原按需读取范围。图默认排除隐藏分支，完整分支选单仍允许显式多选，原文件树与草稿保持。

导入历史的提交匹配（2026-10-13，IMPORT-12-branch-behavior-import）：设置名称为「未找到我的提交」，沿用既有偏好键和hasAccountCommits字段。Gitea返回空作者账号时，使用当前登录账号的已验证邮箱匹配Git作者邮箱；外部作者没有本地平台账号是正常情况，完整父节点历史和可用邮箱读取完成后没有匹配就返回false。账号邮箱读取失败、没有可用的已验证邮箱、未映射提交缺少作者邮箱及历史不完整保留participationError和可见；后续找到明确本人提交仍优先返回true。hasAccountCreation独立核对创建活动实际操作者，fork或迁移创建的仓库也沿用该记录，不把导入者写进原提交作者；唯一分支例外和多分支筛选范围不变。

Gitea推送参与（2026-10-14，IMPORT-12-branch-behavior-account）：Git作者、提交者与平台实际推送者是三种不同身份。账号邮箱与Git邮箱不一致时，作者和提交者的Gitea账号都可能为空；Rust在作者未匹配时，独立核对同仓库commit_repo活动的act_user.login，并要求Commits[].Sha1或HeadCommit.Sha1出现在当前HEAD已读取的真实父节点历史中。成功证据写入可选hasAccountPush，不冒称hasAccountCommits=true；推送确认足以保留分支，即使作者或更早历史仍不完整。活动每页50条、最多十页，满页即继续翻页，兼容服务器无Link的50条上限；权限、身份、格式或读取上限失败保留participationError与可见。正常无匹配还要求作者历史完整，创建记录与手动隐藏/恢复保持独立。结果按账号、仓库、HEAD缓存五分钟，不改保存账号或Git邮箱；SHA不得从消息或CompareURL中猜取。

创建参与（IMPORT-12-branch-behavior-created）：完整远端分支列表只有一个分支且hasAccountCommits=false、尚未确认本人推送时，Rust补充hasAccountCreation。Gitea核对仓库remoteId和创建日期，分页读取创建当天的activities/feeds，只信任create_repo活动中同仓库的act_user.login；user_id是接收人，组织owner和管理权限均不作为创建证据。成功结果按账号/仓库缓存五分钟；最多十页，每页100条，只有找到明确创建者才返回true/false。活动缺失、身份/权限/格式失败或平台未提供证据时保留participationError与warning，不把未知写成false。客户端保留创建者及创建身份未知的唯一分支，也拒绝带参与错误的自动隐藏；手动隐藏与显式恢复沿用原优先级。此仓库创建例外不泛化到多分支，默认模式及已有本人提交或推送不额外读取创建活动。官方契约见[Gitea仓库活动](https://docs.gitea.com/api/operations/repo-list-activity-feeds/)。

仅hide模式通过remoteWorkspace的有限checkParticipation布尔参数发起账号参与核对，旧调用缺省false。Rust Provider在账号凭据与仓库身份边界内，GitHub/企业版/Gitee按平台作者账号查询；Gitea分页读取提交历史并独立核对推送活动；作者账号为空时核对当前账号的已验证邮箱，完整父节点历史、可用身份及推送记录读取完成后无匹配正常返回未找到。没有肯定参与证据时，邮箱读取失败、可用已验证邮箱缺失或未映射提交的作者邮箱缺失保留未知。Gitea只信任/user/emails明确verified的记录，不以显示名或公开profile邮箱推断身份。GitLab匹配当前账号与已验证邮箱。未找到当前账号提交的判定要求明确的作者查询空结果或已闭合的完整父节点历史；分页上限1000、身份失败及缺失父节点以participationError和可见warning保留未知。元数据按账号/仓库/HEAD缓存五分钟，邮箱只留服务内存，不回传界面或写入偏好；有脏文件、未知本地HEAD或未推送本地历史时保留分支显示。官方契约见[GitHub提交](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28)、[Gitea提交](https://docs.gitea.com/api/operations/repo-get-all-commits/)及[GitLab账号邮箱](https://docs.gitlab.com/api/user_email_addresses/)。

0.24.0 Presence头像：Rust观察者使用远端协议2读取server-authoritative avatarUrl与Bridge只读计算的unpublishedCommits；本机编辑器协议1不变，NAS按连接向旧客户端兼容发送原字段。presencePeople根据有效在线会话、精确仓库/分支和userId聚合操作人员；优先editing、未Commit change、未Push Commit。多设备同账号去重，边框颜色由repositoryId派生，与账号头像分离；已发布提交、仅远端领先及失联不产生头像角标。UI共享AvatarGroup/Popover，未增加读取请求、动态插件或Git写入口。

读取与动作错误归属（2026-10-11，IMPORT-14-read-health-scope）：GitSignals继续只表达真实数量与本地/远端读取健康，不把读取失败转为功能错误。repositoryReadFeedback从独立本地Commit和远端Fetch读取信号汇总仓库状态，Dashboard把加载/访问问题放到左侧文件夹的RepositoryReadBadge；保留最后可用数量。RepositoryRowActions把实际reading并入原生disabled，缺少目标的包装入口也撤销焦点及按下响应；共享提示边界在行状态变化时关闭已有提示。具体动作异常通过独立actionErrors按动作键提供，RepositoryActions只在该按钮上显示可聚焦/悬停的描述角标，同组共享计数不共享功能错误。没有新增后台API或持久化状态，也不为暂无实际错误来源的动作制造异常。

仓库状态排序（IMPORT-13-status-header）：Dashboard通过既有GitSignals和repositoryReadFeedback派生排序级别，读取中或推送中优先于残留错误，同级以仓库身份稳定排序；升序依次为异常、处理中、实际差异、已确认一致、未知。关联仓库继续使用workspace共享读取，未关联读取仍由现有行拥有。行只通过稳定回调报告一个带instanceId/repositoryId键的排序级别，不把新排序变成第二个读取器；相同级别不更新父状态。表头复用原排序状态，折叠/筛选不执行Git或保存账号配置。

## 仓库认证与授权状态（IMPORT-02，2026-10-15）

LocalLink 保存可选 authentication（system / account）；已有记录缺省为 system，首次通过应用下载的分支显式保存 account。系统模式从真实工作目录的 Git remote 及当前分支 remote/pushRemote/pushDefault 选取同仓库连接，保留 SSH 用户、端口、host alias、agent 与 credential helper，不注入应用令牌、不重写已有 Git 配置。应用模式仍使用绑定账号及 HTTPS origin 的独立凭据助手，令牌只在该子进程环境中。SSH -G 仅用于确认 alias 对应的仓库身份，执行 Git 时保留原 URL。Push 的前后引用检查固定同一个实际推送地址；后台 Fetch 使用同一个实际远端及其跟踪引用。快照与新分支存储继承原工作目录必要的本地认证配置，Get Latest 替换目录保留已有 remote/branch 配置；预览状态包含 Git 配置摘要，变化后停止旧计划。

setRepositoryAuthentication 只修改已有 LocalLink；按仓库保存锁及执行任务守卫保护切换，上下文摘要和前端读取资源键包含选择，旧计划/读取不能用于新模式。应用 API 仓库访问失败不阻止系统模式的本地操作；远端 API 浏览仍独立显示其应用账号错误。未知推送数量保持未知，系统模式可显式选择本地提交并由真实 Push 的引用复核确认结果。

repository_access 使用有限 accountRepositoryAccess 协议从保存的账号检查权限，不接收调用者域名、URL 或令牌。GitHub App 分页读取 /user/installations 与 /user/installations/{id}/repositories，仓库是否授予应用与 Contents 写权限、用户仓库 push 权限分别判断；列表未完整读取时保留未知，读取公开内容不代表写权限。安装令牌、细粒度令牌及无法报告令牌权限的平台不猜测写权限。设置页按账号读取、取消与退避，每60秒更新且隐藏/离线暂停，手动检查使用同一读取器；结果不写入凭据目录，不发送 Git 写操作。openAccountAccessSettings 只打开保存账号对应的固定 GitHub 设置地址。

## 当前运行结构

分支消失提示与关联清理（IMPORT-04-stale-branch-notices，0.34.5，取代0.34.3的立即清理时机）：显式Catalog读取在阻塞工作线程检查已保存路径，仅绝对路径的symlink_metadata == NotFound认定本地缺失；现有符号链接、权限及其他访问错误保留。完整远端分支列表单独标注branchesComplete，不受树/历史是否完整影响；Git Fetch先通过账号或现有系统认证执行精确ls-remote查询，只获取仍存在的分支，历史跟踪引用仅为本次查询的分支提供曾发布证据。新建且未发布的本地分支不算远端删除，列表截断、网络、权限、限流与取消均不产生缺失证据。REST与Git获取沿用并行读取。

现有加密v2状态新增可选branchSnapshots（按仓库URL限定当前/已见/已核对分支）与branchIssues；Catalog只公开无凭据问题身份、分支、类型和对应路径。远端缺失/两端缺失使用带X横幅，仅本地缺失使用路径旁感叹号。发现问题不移除关联；问题恢复时自然撤销，未关闭的问题跨会话保留。关闭只提交仓库和服务端问题ID，重新读取当前本地任务和完整远端列表，再复核相同上下文/问题；本地缺失路径在保存前再次确认，现存路径仅在真实仓库与当前分支仍匹配时解除关联。mutate先完成加密原子保存再发布，保存失败或取消保留原关联；选中路径被移除时转到其他保留路径，全部移除才解除LocalLink。已关闭分支从历史候选中移除，后续刷新不会由无关旧跟踪引用反复生成。当前本地分支由既有本地读取与Fetch复用的内存观察提供，不为Catalog轮询重复运行Git。

单个目录验证或Git对象库获取失败仍隔离在可选errors中，其余正常目录继续刷新；已确认缺失的路径跳过获取，通过自己的提示反馈。结果沿用branches/checkedAt，成功数量只统计实际更新的分支；部分成功仍触发本地读取，其他失败保留重试退避。前端保留错误任务的上次快照并传播missing标记；已知缺失只在对应路径显示感叹号，不再污染仓库级Git读取错误。提示关闭失败保留原提示并展示原因，键盘Enter/Space与鼠标共用同一操作，进行中禁止重复提交。清理只修改应用缓存与关联，不删除真实目录、Git分支、worktree记录、提交或跟踪引用；Fetch不改变HEAD、index和工作文件。

Git网络与读取日志（RUN-01-tauri-git-network）：Network在启动Git/Git LFS之前，先保留目标URL匹配的显式http.proxy及现有代理环境；无显式配置时，通过CFNetwork按目标URL读取macOS静态HTTP/HTTPS/SOCKS代理和绕过决定，仅注入该子进程。代理变化在下次操作重新读取，不保存或改写Git/系统配置。当前PAC条目不替换为其他静态代理。Git日志仅记录有限操作、匿名仓库资源、span、真实退出码、耗时和安全错误类别，不记录stderr、地址、目录或凭据；Service把取消和包含失败任务的成功响应分别记录为cancelled/partial。通用Git失败不再以说明中的“目录权限”推断为账号权限故障。

桌面入口是`macos/src-tauri/src/main.rs`及`lib.rs`，使用Tauri 2 / WKWebView运行已打包React资源。`src/native-bridge.ts`安装既有有限协议，由Tauri命令调用Rust服务。生产不启动HTTP业务服务、Electron或Node sidecar；Node仅用于前端开发与发布工具。`macos/electron/`、`macos/server/`及相关旧回归保留为迁移前的参考，不进入当前桌面入口或安装包，不能据其结果声称Rust后台通过回归。

仓库网址入口（R-05-repository-browser-link）：RepositoryView保留真实链接及键盘语义，桌面激活时阻止WebView导航，只提交`openRepository(repositoryId)`。Rust从已保存Catalog定位仓库并验证http(s)地址，通过既有系统open打开默认浏览器，不接受调用者URL或依赖本地关联。浏览器预览沿用普通新标签链接；打开失败使用单处Notice。

| Rust模块 | 职责 |
| --- | --- |
| service | 账号目录、关联、上下文身份复核、幂等结果及按真实git-common-dir串行写入 |
| provider | GitHub/Gitea只读请求、分页及SHA缓存；构造受限同origin Git凭据 |
| git / operations | 有界Git子进程、worktree/历史/Diff、Commit/Push、浅下载及Pull/Clean/Get Latest预览与应用 |
| ai | 每分支当前更改生成Summary/Description，沿用本机Codex配置，返回前复核任务 |
| credentials / preferences | Keychain、旧Electron密文读取、新AES-GCM原子存储和限定偏好迁移 |
| oauth | Rust loopback网页授权与设备授权，PKCE/state、实例绑定及加密开发配置 |
| github_token | GitHub官方续期交换及有限凭据模型，网页/设备方式隔离、响应校验与安全失败原因 |
| diagnostics | 24小时本机有限日志、打开文件夹及复制日志文件 |
| updates | Tauri签名更新、版本绑定、确认后立即安装与重启 |
| presence | 加密插件配置、远端只读观察者、本机 Bridge 读取与独立状态有效性 |

保留`com.gittogether.standalone`、原Developer ID及`GitTogether-Standalone-Demo`数据目录。正式应用启动时兼容`accounts-v2.encrypted`旧v10密文，保存采用认证加密；Keychain不可用时保留原文件并返回错误，不弹解锁或明文降级。只迁移本应用偏好键，WKWebView已有值不覆盖。开发账号保持会话存储，不读取正式账号。迁移源与实际用户升级结果分别记录。

每五秒本地扫描及每五分钟/本地变化触发fetch继续由已有React调度器管理；Rust同仓库身份的在途fetch共享结果，并按真实公共对象库串行。检查完成才发布数据，失败保留前次成功数量及退避。Git操作前后校验保存的账号、仓库、关联与任务；Commit开始后不因窗口请求取消中断事务。Clean和Get Latest先核验远端快照/LFS、再复核当前状态，使用备份与回滚，不能只删除shallow标志冒充空间回收。

远端优先呈现（0.22.8，RUN-01-remote-first）：同次自动刷新并行启动平台remoteWorkspace与本地fetchRepository，平台结果返回即发布分支/提交/树，不等待Git网络调用。调度器保持在途直到两条请求收尾，继续使用同资源串行、取消/身份隔离和退避；各自失败及时保留上次内容，最终单处提示分别说明平台读取与本地引用更新错误，失败不能覆盖切换后的仓库。

本地关联以服务器主机和解码后的仓库路径匹配，沿用旧版对SSH/HTTPS及不同传输端口的同仓库识别；不因Gitea的SSH2222/HTTPS10443差异拒绝已有目录。身份匹配与凭据边界分开：Git网络操作仍只向保存账号的实际HTTP origin提供凭据。未保存关联的仓库保持远端浏览，在更改栏直接提供已有本地配置入口，不自动扫描或写入用户目录。

正式发布从已推送main生成独立源码快照，构建Rust release及React资源，Developer ID签名、Apple公证并附加凭证后生成两套更新资产：旧Electron版读取ZIP和`latest-mac.yml`，新Tauri版读取最终已公证的`.app.tar.gz`、`.sig`和`latest.json`。Tauri签名绑定版本，内置公钥匹配仓库外0600私钥；发布后完整回读两套公共资产并核对摘要。开发版禁用安装更新。不会为交付启动或修改用户已安装应用。

Windows双架构（RUN-01-windows-packaging，2026-10-12）：同一React/Tauri/Rust客户端增加platform边界，Windows使用KnownFolder LocalAppData内的原数据目录名称、当前用户DPAPI（GTTW1，带应用身份熵）与私有ACL；macOS继续兼容Keychain/GTT1/v10及原目录。路径按本机分隔符枚举工具并规范化Git绝对目录；Windows通过Job Object接管在挂起状态创建的Git/AI进程，再恢复初始线程，取消及退出清理整组后代。普通文件读取保留no-follow/reparse校验，权限/链接、系统打开、日志文件剪贴板与更新错误码按平台实现。Windows更新验证NSIS PE/firstheader，签名仍绑定版本；Mac更新结构校验保持独立。

联合打包由macos/scripts/package-desktop.ts驱动：Windows workflow只接受已推送main SHA，在原生Windows-2022/MSVC以i686与x86_64分别构建，使用相同版本。package-windows.ts在私有快照构建真实应用，构建时验证器在临时目录核对DPAPI、ACL、Git提交范围/暂存和进程取消；随后删除快照内诊断bin再生成currentUser NSIS包，解包核对主程序PE架构/摘要及额外二进制，并实际临时安装、核对和卸载。CI不持有更新私钥，只产出安装器和有限构建报告。Mac发布入口收集同SHA的两包、核对报告/完整摘要、在本机签名并原生验签，latest.json统一包含darwin-aarch64、windows-i686和windows-x86_64；Windows两包未通过则不能公开完整正式版本。GitHub资产及公共完整下载、对应sig与清单均须匹配。当前Windows安装器未配置Authenticode代码签名，不能把更新签名等同于Microsoft代码签名；纯32位Windows不支持官方Codex CLI，AI缺失必须如实提示。

更新包与错误诊断（RUN-01-update-diagnostics）：最终tar通过COPYFILE_DISABLE禁止AppleDouble元数据；发布验签工具及安装前共用update_archive，要求唯一GitTogether.app根目录、真实Info.plist/主程序和正常相对路径，拒绝._元数据。官方安装器去掉第一路径层，旧包的根._GitTogether.app因此被解压到临时目录自身，实际返回EPERM/errno 1，尚未开始应用替换。Updates直接持有Diagnostics，记录检查/下载/安装起止、目标版本、错误类型、脱敏source链、系统errno及HTTP状态；原生有限字段不接受渲染层输入。UpdateFailure保留透明Io包装的直接errno，并区分解压包、签名/版本、网络、磁盘、访问限制及未知错误。安装失败保留下载与重试，不推断所有失败均为权限，不更改系统权限。

安装预约（RUN-01-update-immediate，取代0.22.4通用等待）：useWorkspace持有跨页面的useUpdates状态；确认重启时立即设置安装标志，停止自动账号、本地和远端检查。安装状态仅由更新卡片展示，正常关闭入口或IPC退出不生成顶部连接错误。Service.installing原子关闭新请求入口，独立Foreground守卫记录真正的提交、推送、文件变更、下载及配置保存；已有前台事务只返回具体原因，不排队等待。其余在途读取及独立fetch通过后台CancellationToken取消，安装不等待Service.active归零；该计数仍用于实际请求生命周期。预约以Drop释放并更新后台取消代次，安装失败恢复新请求、保留已下载Update及字节，以ready状态和“重试安装”直接重试。前端确认前仍禁用真实前台操作/授权期间的重启入口。

浏览器开发由Vite将有限`/api`转发到Rust服务4175；授权回调4174也由Rust持有。受限Host/Origin、请求体上限和断连取消仍保留；桌面通过IPC直接调用同一Service，不依赖这些端口。类型检查覆盖当前React和发布工具，Rust使用独立Cargo检查。

## 历史实施记录（0.21及以前）

以下保留旧TypeScript/Electron实现及各阶段的证据边界；当前入口以上述Rust结构为准。

2026-10-10完整仓库操作：repository-network从服务保存的账号、仓库和真实关联构造同origin凭据与Git命令，fetchRepository实际获取关联分支引用/对象，use-remote-repository沿用五分钟、变化触发、取消和退避。AccountService以git-common-dir队列串行Commit/Push/fetch/预览/应用，避免后台读取触发的fetch阻断Submit后续Push。repository-sync的prepare/apply/discard有限协议保存十分钟预览，绑定账号/任务、HEAD、引用、工作目录、index和文件指纹；应用前复核本地和远端，过期重新预览。Pull仅ff并补齐LFS；Clean用已核验远端快照与回滚备份恢复/补齐/删除文件，不改HEAD/index；Get Latest先核验depth1快照及当前LFS，再替换选中目录并删除可独立回收的旧对象/缓存，未推送或共享主目录拒绝，linked worktree迁移成独立clone且保留其他分支需要的对象库。前端RepositoryOperationDialog固定目标，逐目录预览、一次确认、失败停止并保留已完成结果。commit-generator沿用正常CLI配置，禁用工具/插件/钩子、忽略exec rules，在空私有目录按JSON schema生成；取消和返回后重新验证任务，错误不输出底层诊断。


官方M3字段（2026-10-10）：material-inputs.tsx只导入Material Web的描边字段、填充字段和图标按钮，使用官方Lit React适配绑定受控属性和原生input事件。RepositoryCommitComposer、RepositoryActionDialog共用描边字段；Dashboard、RepositoryView顶部共用Search bar组合。官方字段通过host参与既有弹窗焦点管理并将焦点委派给Shadow DOM输入；顶部搜索ref只需HTMLElement.focus，保留Cmd/Ctrl+K。官方主题令牌映射现有CSS语义颜色，其他公共交互组件继续复用原边界；不新增草稿来源、服务API或持久化格式。官方Material Web没有独立Search bar，填充字段加图标按钮是按M3搜索规范实现的组合。

更新包来源（2026-10-10）：releaseBranch指定main，打包入口检查当前分支及生产输入已提交，构建前后复核提交、分支、工作树和输入摘要，build-info记录sourceBranch/sourceCommit/sourceSha256。GitHub Releases仍是MacUpdater的公共下载源；Git分支不作为更新频道。发布tag应指向该main源码提交，不通过源码push冒称已发布安装更新。

三平台联合发布绑定已推送main的不可变源码快照，所有构建报告、包、版本和tag保持同一sourceCommit。等待Windows CI期间main可以继续推进；正式发布反复读取远端main，通过GitHub compare的base/merge-base/status验证快照仍为main祖先，不接受被移出的历史、其他分支或别名。准备、上传前及公开前复核候选版本高于公共latest，保留同版本草稿身份、资产摘要和tag检查。后续main提交不改变本次快照或包来源，不用反复重建已验证的三平台包。

2026-10-10本地Git变化触发远端检查（0.17.0）：保留五分钟远端定时和五秒本地扫描。repository-reader为每个真实worktree生成可选changeKey：HEAD、原始porcelain状态、index的模式/对象ID/阶段，以及Git更改列表内文件的mode/size/mtimeNs/ctimeNs/inode共同生成稳定SHA-256。只读index枚举补足同状态再次暂存的检测，lstat不跟随软链接，不每轮读取大型LFS内容；脏文件元信息按64项并行批次读取，正常删除用missing标识，其他读取失败作为该task错误。useWorkspace按服务、关联映射和工作目录保存成功基线，比较实际branch及指纹；首次成功建立基线，逐任务失败保留该路径基线，整个读取失败不改基线，映射移除/服务重启清理。新变化递增该仓库触发版本，单次扫描内多个分支变化合并。关联仓库的useRemoteRepositories由useWorkspace持有，Dashboard与仓库页共享同一remoteStates；筛选、隐藏、收起和页面切换不重置网络节奏。未关联仓库仍由展开/打开页面按需读取，已保存SHA内容沿用服务缓存。useAutoRefresh比较触发版本，createAutoRefresh.trigger提前检查新变化但不绕过重试截止；在途变化合并为一次后续请求，取消的触发在恢复时保留，focus/online仍只恢复原定时或已有触发。远端部分task失败发布各自结果并进入同一重试期限，不把失败扩散成整仓库假计数。没有新增远端API、Git fetch写入、文件内容上传或持久化字段；实际reading继续驱动呼吸，最后成功结果继续驱动正数角标。

2026-10-10未关联分支下载（0.16.0）：Dashboard分支行按实际已关联任务决定显示七项Git操作或仅下载/隐藏。App提供BranchDownloadModal，复用本地目录选择器，输入新文件夹名称并显示目标位置；useWorkspace复用单仓库busy锁，有限downloadBranch协议只接受repositoryId、branch、parentPath、folderName并返回Catalog。服务依据自己的仓库/账号构造远端HTTPS URL，复用账号凭据；令牌仅进入子进程环境，临时credential helper限定同一origin，不存入Git参数、URL、配置或日志。新分支使用应用数据目录内按账号/仓库身份区分的共享bare对象库，精确fetch该分支depth=1，创建私有临时worktree，按实际filter属性处理当前版本LFS，然后创建/使用真实分支并通过git worktree move移至用户指定的新文件夹。已有目录、工作目录和不同本地提交不覆盖，其他检出不切换。下载、账号/关联身份和实际remote/branch验证完成后，经既有v2存储原子追加LocalWorktreeLink；保存失败保留完成目录并提示手动关联。失败只清理未发布的私有临时worktree；请求取消/超时先等待Git及同进程组子进程退出，再处理清理。后台检查继续只读，不复用下载为普通Fetch/Pull/Push/Get Latest/Reconcile/Clear执行。依据[Git worktree](https://git-scm.com/docs/git-worktree)、[Git credential helper](https://git-scm.com/docs/gitcredentials)、[Git LFS pull](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pull.adoc)契约实现；源码和运行验收分别记录。

共享仓库操作（2026-10-10，0.20.2）：RepositoryRowActions由Dashboard仓库行、分支行与RepositoryView顶部复用，按Pull / Get Latest、Commit / Submit、Push、Clean和独立隐藏分组；同组一个正数角标，移除可见Reconcile和手动Fetch。GitSignals的旧键保留内部读取兼容，不增加后台Git写入。Dashboard筛选条额外批量入口及其独占回调已移除，仓库行清单取其当前筛选分支，不依赖展开DOM；仓库页顶部取该仓库分支筛选，中栏仅当前task或选中SHA。四个文字数量表头仅排序；styles.css共用按钮尺寸和组留白变量，表头用64/64/34/34/34px五槽及8px间距对应行内组，第四槽留给无标题的Clean。数量角标和排序箭头绝对定位，标题本身居中；数量角标作为dashboard-sort-label的子元素相对文字定位，14px文字行在30px按钮中居中，top=-7px使12px角标的顶部留在按钮内部，right=-6px贴文字右角。th/td操作列内缩一致。repository-action-model统一生成真实可执行目标，RepositoryActionDialog打开时复制task/文件/指纹并按物理路径去重，不因后续刷新或筛选扩大范围。Submit逐task调用原有限AI接口，展示各自Summary/Description及完整清单，只用一次确认；取消不写Git，生成/Commit失败停止，Push失败保留Commit及操作UUID，重试跳过已完成步骤。Commit只写本地，成功后中栏切到新提交并仅显示Push；对应分支远端可达记录用于已发布状态。App沿用原LocalLink和隐藏偏好，名称提示、草稿、栏目挂载与读取反馈保留。

Submit可编辑草稿（2026-10-10，0.20.1）：App内RepositoryActionDraftsProvider按服务instanceId维护内存Map，不新增持久化或API；键为repositoryId、真实branch及worktree路径，Dashboard、仓库顶部及中栏的同一个RepositoryActionDialog共同读取。弹窗固定打开时的task/文件/HEAD/changeKey；同一快照的已生成说明复用，快照改变时只重新预填未经手工修改的字段。Summary与Description分别可编辑、分别记录用户修改，异步生成仅填未修改字段，关闭后迟到结果丢弃。字段编辑重置待Commit的操作UUID；生成失败不越过确认门，全部生成完成且每个Summary非空后才允许一次确认，Commit收到各分支最终draft。成功创建Commit清除该分支草稿，Push失败继续保留既有Commit和Push UUID，重试不重复Commit。服务变化清理草稿，切页/筛选不清理；未持久化到浏览器或账号存储。此轮只完成源码/类型核对，不冒称真实AI/Git或安装版验收。

所选提交Push（2026-10-10，0.20.0）：新增有限pushCommit输入repositoryId/taskId/expectedHead/commitId/operationId，AccountService只从保存的账号、仓库及已关联真实worktree确定HTTPS目标和凭据，拒绝未知字段、游离HEAD、不同HEAD/关联、无写权限及不属于该分支历史的SHA。local-push复用限定origin的credential helper，令牌仅进入进程环境；推送精确SHA到对应refs/heads分支，不强推、不跟随标签、不递归推送子模块，前后只解析对应远端引用并确认结果。使用与Commit共用的目录锁、成功请求缓存和稳定UUID，不自动重试或撤销已创建Commit；开始写入后浏览器断开不打断Git，进程仍有独立超时。客户端写入后失效旧读取并重新扫描本地，触发原远端刷新；刷新失败说明已完成写入与待恢复读取，不伪造成功计数。依据[Git push](https://git-scm.com/docs/git-push)及[Git ls-remote](https://git-scm.com/docs/git-ls-remote)契约实现；真实账号、AI和Git执行验收另记。

2026-10-10检查节奏与稳定结果（0.13.1）：参考[GitHub Desktop BackgroundFetcher](https://github.com/desktop/desktop/blob/development/app/src/lib/stores/helpers/background-fetcher.ts)的完成后定时，以及[AppStore](https://github.com/desktop/desktop/blob/development/app/src/lib/stores/app-store.ts)的条件检查和独立在途状态。现有provider只读接口继续读取远端，未引入真实Git fetch写入；远端目录/HEAD每5分钟检查，本地仍每5秒只读。auto-refresh记录最近成功完成时间，focus/online只恢复尚未到期的原定时或启动过期检查，同时保留重试截止与单资源单请求。已有0.12.2工作区缓存及状态/数量分离继续使用。Dashboard从实际reading派生整排行尾动作的aria-busy与呼吸类，Git与Hide同相位；读取状态不直接成为数字。RepositoryActions只渲染大于0的数字和独立错误感叹号，取消、失败与待机不产生临时1或0。

2026-10-10读取状态与计数分离（0.12.2）：auto-refresh的onReading仅覆盖实际在途请求，取消/暂停清除等待状态，失败退避不持续显示忙碌。远端与本地hook沿用原资源身份保护，分别发布loading/error及最后可用workspace；preserveLocalWorkspace在相同映射内保留失败任务的文件、树和历史，按task id/path/branch核对，成功任务更新、删除任务或映射变化不复用。branch-links从已读取数据计算真实数量，独立status/statusDetail表达reading/error，读取失败不短路成count=1，未知仍未知；Commit只依赖本地，Fetch只依赖远端，逐任务错误限定分支。RepositoryActions独立渲染数字和状态，保持禁用执行。账号服务的15秒远端请求限时覆盖头/正文，外部取消仍透传；只将白名单连接/证书代码、超时、HTTP权限与限流转换为安全说明，不返回原始异常、凭据或provider正文。无新API、持久化结构、账号重放或Git写操作。

2026-10-10操作裁切与隐藏修正：Dashboard的显式repository-action-cell固定在表格可见右端，276px容纳七个Git入口和独立Hide/Restore；错误行的colSpan不套用固定列。其他列保持表内横滚与六项排序。RepositoryRowActions复用已有RepositoryActions并追加真实可用的隐藏按钮。useWorkspace沿用v2界面偏好存储，新增可选hiddenEntries字符串数组，旧记录缺省兼容；键为JSON编码的repositoryId和可选branch，不依赖服务instanceId。Dashboard过滤隐藏仓库及分支，显示已隐藏模式提供逐行恢复，分支全部隐藏时显示明确说明。隐藏同时影响Dashboard列表、关联标签和顶部仓库统计，不改变Catalog、账号权限、目录关联、Git状态或文件。隐藏键由branch-links统一提供，linkedTasks在关联判断和统计时按当前真实分支过滤；其他调用保留完整任务。associationStatus排除隐藏远端分支及本地任务，仍要求完整远端分支读取及可见任务验证成功，零可见任务不标完全关联。顶部卡片独立于普通搜索/筛选，排除隐藏仓库；有可见已保存本地任务才计入已关联，否则可访问仓库计入未关联。显示隐藏项目只改变列表恢复视图，不重新计入顶部关联统计；恢复偏好后立即重算。 Dashboard列表表头的隐藏数量和排序共用hiddenCount：关闭showHidden时为0，开启时仅汇总当前筛选仓库的隐藏记录；工具栏隐藏总数保留原来的恢复入口含义。

2026-10-10行尾操作定义：`RepositoryActions`按Commit/Fetch/Pull/Push/Get Latest/Reconcile/Clear显示7个公共IconButton，移除Ignore专用图标。`branch-links.ts`的`GitSignals`扩展为7个固定键，已有HEAD ancestry与工作目录数用于Pull/Push，未提交文件数用于Commit；Get Latest的空间清理与Reconcile/Clear的文件内容比较没有读取契约时保持数量未知。操作列220px容纳7个28px按钮与6个4px间隔，日期列继续保留。本轮没有新增写API、Git进程或目录删除；保留已有按下反馈和禁用说明。真实操作执行另列未完成需求，后续实现需要先产生账号/仓库/当前分支绑定的影响清单，再处理浅拷贝、当前版本完整性、Git对象与LFS缓存回收、共享worktree和文件覆盖的边界。

`SettingsView` 使用flex纵向布局：标题和账号/外观/更新内容放在独立的settings-scroll滚动区域，版本footer是其后的不收缩兄弟区域，固定沿窗口底部右对齐，不覆盖表单。没有新增偏好、账号状态或IPC。侧栏公共收纳按钮与常驻导航图标框在styles.css共用状态反馈规则，保留原DOM和aria状态。

R-05-tree-identity-row按2026-10-10最新反馈将RepositoryFileTree的唯一身份行移到每个任务底部：分支左对齐、当前树8位SHA右对齐，路径紧随分支且单行省略，保留长分支渐隐和完整提示。树节点、历史选择、来源及树基准不变。有限openDirectory协议只接受repositoryId/taskId，由AccountService从已保存关联定位真实worktree，通过taskRoot复核目录、remote与分支，打开前再复核账号可访问性和关联身份；复用系统默认打开器，macOS目录由Finder打开，失败沿用树内alert。HTTP/可信主frame IPC与日志方法白名单共用原有边界；不接受调用者绝对路径、不操作Git或修改关联。

React 客户端由 App shell、AccountSidebar、统一仓库 Dashboard、独立 SettingsView、LocalRepositoryModal 和只读 RepositoryView 组成。设置仅显示账号与外观，不显示指南或材质说明；App 仍保留原生桥接就绪检查。`import-model.ts` 定义有限 API 方法与 DTO，`import-api.ts` 验证响应形状，`use-workspace.ts` 管理账号目录、异步操作和外观偏好。AccountSidebar 按 accountId 展示完整 Catalog 仓库，不用 LocalLink 过滤导航或数量；Dashboard 以仓库、归属方、账号、本地目录和 Git 操作五列展示统一列表，不再单列本地状态。实际分支位于可展开的仓库子行，保留独立目录与操作；支持原搜索与筛选。旧 `domain.ts` / `data.ts` 仅保留历史测试契约，运行入口不导入场景或模拟操作。

IMPORT-13-branches 的展开集合由 Dashboard 持有，以 Catalog instanceId + repository.id 区分会话与访问账号；目录心跳和筛选不清空其他展开。IMPORT-13-branches-folder把原文件夹底板直接复用为公共IconButton展开入口，保留aria-expanded/aria-controls；仓库名称的工作区导航处理器独立，不新增状态或箭头。每个可见仓库行复用 useRemoteRepository；0.10.0 在展开或已有本地关联且服务就绪时启用已有 remoteWorkspace。未关联仓库收起保留该行最后结果并取消读取，已关联仓库保留同步信号所需心跳；筛选隐藏/离开 Dashboard 卸载读取器。分支名称取真实远端任务与已关联本地任务的并集，不从 defaultBranch 合成；任务历史/树失败不掩盖已读名称，分支列表整体失败明确保留上次结果。默认标记只在实际名称匹配时显示，读取上限沿用原分支警告，计数仍只统计仓库。现有接口同时读取有限历史/树并缓存SHA，没有新增分支API或Git写入。

`ui.tsx` 的 MaterialProvider 使用 OpenGlass UI 的公共 classic/CSS 交互原语，保留按钮、字段、分段选择、菜单与弹窗的无障碍/焦点契约；`theme.ts` 与 `styles.css` 统一 Material 3 亮暗色、状态、形状与轻微卡片 elevation。Roboto 字体本地打包，中文系统回退，不访问外部字体服务器。App shell 只有共享画布，侧栏透明且无独立浮层，主要语义内容分组为卡片，浏览器/桌面共用样式。侧栏宽度只由显式开关决定，收起保留56px图标列；导航、选择与草稿不卸载。旧 reducedGlass 偏好仍可读取以兼容保存结构，但不再呈现无作用的开关。0.23.0 仓库 Presence 角标只在插件启用时根据实际会话显示在线、离线或未知，停用时隐藏，不伪造在线数据。

`WindowChrome.tsx` 是生产 App 与真实 Git 隔离 QA 共用的窗口控制区，位于横向 app-body 外，只保留红绿灯；Electron 保留系统按钮，浏览器绘制既有预览。`SidebarHeader.tsx` 两态保留同一公共IconButton和右侧GitTogether文字DOM，收起时文字hidden；32px头部/常驻导航行与固定8px间距通过CSS统一，不引入新状态。侧栏与首页/仓库首卡片共用顶部内缩令牌，左边缘沿既有导航尺寸对齐。App 的 sidebarCollapsed 仅切换 is-collapsed CSS 类，侧栏保留56px图标列，不条件卸载导航或工作区，不改变页面/RepositoryView 的 key；账户/仓库导航隐藏文字时仍有明确可访问名称。函数式切换、aria-expanded/aria-controls 和显式名称维持鼠标/键盘操作。保持 hook 顺序不变，布局热更新不使用强制 refresh reset，避免重置当前表单。普通卡片共享无投影令牌，菜单/弹窗阴影独立。原生窗口按钮固定在顶部控制条内，不依赖侧栏宽度或 resize 回调；不增加 IPC、账号服务变更或凭据存储。

0.10.0 的 `RepositoryActions.tsx` 用四个公共 IconButton 平铺 Fetch、Get Latest、Push、Commit，移除行尾省略号菜单；工作台和本地配置仍由仓库名称、目录入口打开。`branch-links.ts` 从真实已关联任务、远端 HEAD 与已读取 ancestry 纯派生灯色及详细说明；没有足够依据时明确未知，SHA 不同不直接等同于落后。焦点包装层支持键盘与鼠标右侧 portal 提示，接近窗口边缘时约束在视口内。Git 写动作仍禁用，没有执行处理器或写服务 API。

仓库分支图和文件树不渲染底部状态/操作容器；滚动内容使用原来的 flex 剩余高度，不用隐藏空条来占位。R-05-column-insets移除整套图标题选项与未使用的密度状态，固定36px双行；搜索跳转保留键盘监听，分支与提交右键菜单关闭后仍回到目标记录；真实复制/定位反馈按需显示在标题下。三栏CSS通过--repository-column-inset共享12px外侧水平留白，行内不重复加padding，图轨道与树层级缩进不变。本地配置仍由 Dashboard 复用原弹窗，未关联 Local 空态的关联入口保留；没有新 API 或账户行为。

R-05-gitlens-graph-filter取代原R-05-branch-title的单选定位：Graph默认显示全部历史，按task与真实ref归并同名本地/远端分支；null跟随全选，显式Set保留子集或空选。复选只显示所选分支实际HEAD祖先的并集，与任务聚焦、历史选择和树来源独立，不改变checkout或卸载任务。公共Popover、原生checkbox/fieldset支持连续选择及键盘导航；标题仍是28px控件/44px栏，收起时显示只读筛选范围。

R-05-gitlens-graph-local从已有工作区纯派生workingTask节点，每个非空更改目录一个，以task.id稳定标识并连接实际HEAD；unborn HEAD没有父节点，不赋予虚构SHA、作者或时间，不调用提交详情API。点击节点清除历史上下文并选择对应已挂载的本地更改卡片；各目录草稿、文件选择和树基准保留。本地领先已读取远端祖先的记录标为未推送，缺失或分歧远端头只标本地提交。读取器保留非origin远端ref命名空间，避免与含斜线的本地分支混淆；不新增DTO字段、读取权限、账号存储或Git写操作。

0.9.1的Dashboard不再使用单选`FilterMenu.tsx`；账号、组织、仓库统一复用`MultiFilterMenu.tsx`的公共Popover与具名原生checkbox/fieldset。账号以accountId为键、同名账号保留平台/login/host辅助身份；账号、组织、位置、类型与搜索取交集，组内取并集。整行label执行同一原生change，失去焦点且relatedTarget为空不提前卸载复选框，连续点击不关闭；键盘移到外部才关闭。触发器显式dialog语义，方向键在应用层打开和导航，避免库openOnArrowKeys自动赋予menu语义；Escape/外部关闭和焦点管理仍复用公共弹层。`dashboard-filters.ts`纯派生选项，null表示跟随全选，显式Set保留子集/空选；新增选项只进入全选，移除键不别名到新账号。目录revision不清空选择，搜索由App持有、Cmd+K不变。公共菜单内联光学背景经共享样式覆盖为不透明Material语义色，不修改库私有逻辑。

GitHub的主目录和显式协作目录是两次分页快照，0.9.1按remoteId合并两者，再标记collaborator；不再仅给主目录附上标记而丢弃协作查询独有的Fork/Added仓库。协作快照中的最新provider字段保留，主目录为空时仍查询协作目录，重复记录不重复计数；可选查询失败仍保留主目录并标记未知。Gitea继续按官方204端点确认直接协作，不把团队权限或owner不同猜成Added。

IMPORT-17-completeness（2026-10-10）统一有限分页解析：只构造本地页码，不访问provider返回的Link地址；中间空页仍遵循next/total继续，连续三页没有新ID但声明仍有记录则报错，避免不完整快照替换旧目录或重复查询到上限。GitHub协作快照与Gitea认证用户uid限定的Fork/collaborative搜索按remoteId合并，补充快照缺失的可选字段不擦掉已确认值。Gitea搜索可能包含team访问，所以只补目录，不凭搜索结果标记直接Added；仍由204接口确认。缺失fork通过固定仓库详情补查并核对ID/fullName，失败保留未知。四worker队列的每次实际请求各有15秒超时，不再共享15秒排队截止；外部取消仍透传，组织查询按owner复用。补充失败保留基本目录与安全metadataError；基本/补充均空且补充失败则拒绝把它当完整空目录。Dashboard由其他筛选的候选集合计算所选类型覆盖缺口，只警示真正未确认且未匹配的项或补充目录失败；全选/主动空选不被未知警告干扰。不改变凭据存储、关联、Git写操作或既有日期字段。

Dashboard 的仓库名称直接读取 `RemoteRepository.name`；「组织 / 用户」列读取 `fullName` 中的 owner，账号列继续通过 accountId 读取用于访问的身份。这两种归属独立。0.7.0在无凭据DTO中增加可选ownerType、fork、collaborator、permissions和安全metadataError，客户端与旧加密目录验证兼容；组织筛选键由accountId、真实归属类别和规范化组织名称组成，个人与未识别归属分别成组，不猜用户名。行键、导航、菜单与本地关联仍使用仓库id。远端表示未关联、本地表示已关联，沿用原关联语义，不声称已克隆；来源与协作关系可以重叠，组内OR、维度之间AND。权限只在状态提示中标注，不用于推断Added。

仓库主列表成功后，GitHub使用同一有界分页读取器的affiliation=collaborator查询确认协作，owner.type/fork/permissions直接取提供方字段，组织成员访问不等于直接协作。Gitea自己的个人归属由已认证身份确认；其DTO没有组织标记，因此对其他owner从固定/api/v1/orgs/{owner}确认组织，从固定仓库collaborators/{login}端点的204确认直接协作。归属查询按本次账号/owner去重，最多4并发，共享15秒额外读取期限；404可能是不可见或不支持，不据此猜个人/非协作。可选分类失败保留成功主目录和已确认字段，留下安全metadataError；原始payload与凭据不返回。原HTTP/IPC方法不增项，分页仍自行构造URL、不跟随提供方Link或认证重定向；刷新/换令牌沿用原子提交和身份竞争保护。没有新凭据存储、授权助手修改、Git写操作或历史正文读取。

## 自动检查与缓存

`auto-refresh.ts` 是可注入时钟的单资源调度器，只有一个在途请求；请求结束后才安排下一次检查。`use-auto-refresh.ts` 根据稳定的资源 ID 保留计时器，监听 visibilitychange / focus / online / offline，隐藏或离线时取消/暂停；恢复后检查。重复激活合并，本地扫描保留原5分钟退避上限；远端变化触发最短间隔2分钟，普通失败指数退避最多30分钟，并继续遵守更晚的提供方retryAt。资源优先级和周期变化保留退避及在途身份，删除一个资源不停止其他资源；远端排队和分级周期见本文IMPORT-16。

Workspace 每约 10 秒检查服务 instance/version 与 Catalog；每个账号正常约 60 秒调用已有只读仓库 refresh；每个关联仓库正常约 5 秒读取 localWorkspace 中的真实工作目录。远端目录沿用服务分页/错误保留/原子 revision；新会话旧响应、已解绑或换路径的迟到响应不能覆盖当前数据。服务失联保留缓存并显示错误，不重放 connect、token 或授权。版本不一致停止检查，保留原刷新页面交接。

本地工作区缓存位于 controller 的 localStates，以 instanceId、仓库、父目录及工作目录集合组成 mappingKey。Dashboard 用操作灯及提示表达读取错误，RepositoryView 复用同一工作区，不各自重复拉取；映射变化时不能沿用旧目录任务，失败仅保留相同映射的最后结果。内容比较复用未变对象，不清空搜索或已选文件。按R-05-local-preview-removal，文件选择只保留列表/树联动，不再读取或轮询所选文件内容；工作区状态与历史提交详情的自动检查继续沿用原缓存和错误边界。

R-05中已选文件退出更改列表时仍保留树选择；本地和远端均没有内嵌内容预览或预览专用占位。删除RepositoryChanges的Diff状态和调度，以及View/Column/隔离预览入口的readDiff回调链；隐藏任务继续保持挂载，草稿与选择不清空。有限后端Diff接口保留，不再由文件选择触发。

浏览器远端读取的 AbortSignal 通过 HTTP 连接关闭传递到服务端，再传递给提供方请求；监听 response close / request aborted，不把正常 POST 读完误判为取消。既有目录 refresh 不改变去重语义。原生 IPC 本身没有远端执行取消，renderer 的 signal/资源身份阻止卸载后的发布。`use-remote-repository.ts` 为打开且可访问的工作区，以及 Dashboard 中可见且展开的仓库建立正常约 60 秒的 HEAD 心跳，以服务 instanceId + 仓库身份定位缓存，保留最后成功结果与逐任务 UI 状态；停止旧资源、丢弃迟到结果，隐藏/离线和错误退避沿用共享调度器。这是前台轮询，不是 webhook 推送，不 fetch 或写入本地 refs，不表示零延迟或 API 限流时仍实时。

## 文件树打开边界（0.8.0）

`RepositoryFileTree` 的文件选择按钮和公共打开按钮为同层兄弟节点。浏览器远端在真实点击事件中使用 `repository-file-url.ts` 的同一纯派生器打开新网页，关闭opener、不带referrer；链接按已保存account.host和repository.fullName、当前树HEAD与逐段编码的字面路径构造，GitHub使用/blob/{sha}，Gitea使用/src/commit/{sha}，不信任任意repository.url。历史差异只影响状态叠加，不能改变链接基准。

有限 `openFile` 方法只接收repositoryId、source和commitId或taskId、path，返回{opened:true}，不接受调用者URL、绝对路径、命令或应用名。AccountService从已验证的关联定位Git目录，`repositoryTaskFile`枚举真实worktree并验证同一common-dir，使用literal pathspec核对tracked/untracked文件，再realpath拒绝越界符号链接、Git元数据、缺失与非文件路径；打开前复核账号/仓库/关联。浏览器本地由`system-file-open.ts`无shell调用macOS默认应用；Electron通过既有主frame有限import IPC，注入shell.openPath/openExternal。默认应用错误不是成功响应，凭据不进入地址或renderer。

## 账号服务与凭据边界

`server/account-service.ts` 是浏览器/Electron 共用的有限服务；账号与远端浏览保持只读，本地创建/提交仅通过各自的有限操作入口。GitHub 请求固定 `api.github.com/user` 与 `/user/repos`；Gitea 请求指定 HTTPS origin 的 `/api/v1/user` 与 `/user/repos`。来源参照 [GitHub 仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)、[Gitea 接口](https://docs.gitea.com/api/operations/user-current-list-repos/) 及 [Gitea ListMyRepos 实现](https://github.com/go-gitea/gitea/blob/main/routers/api/v1/user/repo.go)。GET 仓库接口包含账号/组织/协作范围，但仍受令牌权限限制；分页构造本机 URL，不向 Link 提供的第三方 URL 转发令牌，不跟随认证重定向。

账号 ID 独立于 host，仓库 ID 为 accountId + remoteId，因此同 host 多身份以及同一共享仓库不相互覆盖。身份重复检查 provider/host/login。状态变更串行、保存成功后才发布新状态，响应携带服务 instanceId 和递增 revision；新会话的 revision 0 可以取代旧会话，旧会话迟到响应不能覆盖已验证的新目录。添加账号前先检查 status 与版本，错误区分本地断连、超时、静态托管、服务错误与认证失败；不自动重复提交凭据。

0.4.0 的 `updateAccount` 共享 DTO 仅允许 accountId、name 与可选 token，通过原 HTTP/IPC 分发与 controller 的账号级操作锁保存。SettingsView 复用公共 Modal，AccountEditForm 按 account.id 初始化独立名称/令牌草稿；不随目录心跳重置输入，空名称、未修改和保存中禁用提交，失败保留草稿。原令牌从不返回或回填。改名不请求提供方；更换令牌只访问已保存的平台/域名，验证 login 相同后完整读取仓库，再原子持久化名称、凭据与目录。保留 account.id、仓库 ID、本地关联及其他账号，已关联但失去访问的仓库保留为 unavailable；清除旧凭据的错误与到期元信息。账号已移除或凭据已被其他编辑替换时拒绝迟到保存；旧令牌的在途 refresh 不覆盖新目录或状态。

`server/github-authorization.ts` 实现官方 GitHub 设备授权，仅在服务端持有 device_code 和 access_token；renderer 只得到随机会话 ID、公开验证码、固定验证网页、有效期与轮询间隔。最多 8 个并行等待会话，过期清理；服务端限频、slow_down 延长、单会话重复请求合并、完成结果幂等。网页拒绝/过期/无配置与网络失败分开表达，不回显第三方错误详情。取消在凭据保存前通过 AbortSignal 和提交门阻止导入；已进入原子保存的取消返回真实完成结果。React 等待循环可取消，Strict Mode effect 重放不取消真实服务会话；卸载停止等待并尽力取消服务会话。

采用 [GitHub App 官方设备流程](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)，不申请传统 OAuth 的 repo 写 scope，不打包 client secret。权限和仓库范围由自有 GitHub App 配置与用户安装/授权共同决定。同一身份重新授权更新凭据并保留 ID/本地关联，新身份另建账号。旧TypeScript原型仅保存访问令牌有效期、不保存续期令牌；当前Rust客户端从0.30.2起采用下列自动续期机制。真实流程仍需自有Client ID与用户同意。

GitHub令牌自动续期（0.30.2，IMPORT-11-token-refresh）：网页/设备交换由同一github_token模型读取access_token、expires_in、refresh_token及refresh_token_expires_in。续期令牌、有效期与原授权方式保存在accounts-v2.encrypted的私有githubOAuth项，公有Catalog仅保留原authorizationExpiresAt，不传回任何令牌。网页续期恢复已有加密开发应用配置，设备续期无需client secret；仅请求固定GitHub官方HTTPS端点，不改变scope、权限、主机或TLS策略。

Service按账号及明确授权代次串行续期；API或Git网络操作在到期前120秒获取更新凭据。401最多续期并重试一次只读API，403/限流不触发续期，Git写操作不自动重放。自动轮换保留authorizationId与仓库/任务上下文；重新授权和手工替换凭据生成新代次，旧读取/写计划继续被隔离。账号目录刷新与目录匹配比较授权代次，不把正常轮换误认为账号变更。

0.34.1（IMPORT-02-git-auth-lifecycle）细化 Git 凭据寿命：API 继续使用120秒余量，应用账号的 Git 网络进程改为按进程超时加60秒余量提前续期。Service 为每个账号维护共享读写锁，领取令牌后核对授权代次与当前令牌；读锁持有到 Git 及其 LFS/钩子输出结束，续期交换和加密保存持有写锁，避免轮换撤销仍在使用的令牌。系统 Git/SSH 不领取应用令牌。行为参照 [GitHub Desktop CredentialSessions](https://github.com/desktop/desktop/blob/bebc062caafcf818993b9f53397b976d33484231/app/src/lib/credential-sessions.ts)；[GitHub 官方续期契约](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens)说明交换会同时使旧访问令牌失效。

Git 失败解析同时检查 stdout 和 stderr，读取 push --porcelain 的拒绝理由；只有明确 non-fast-forward/fetch-first/stale-info 才提示远端领先。工作流权限、SSO、仓库写权限、凭据缺失/拒绝、SSH 密钥/主机、远端规则/接收钩子、不可见仓库和限流分别返回固定安全文案。后台 Git 日志仅附加白名单 authentication 与 gitFailureReason，renderer 不能注入这两项；原始 Git 输出、目录、远端 URL、账户名和令牌不写入日志。

系统认证在已关联目录内以验证后的 remote 名称执行 Fetch、Push 与 LFS fetch，保留 remote 专用配置及 pre-push 钩子的名称参数。Push 固定名称和唯一实际推送 URL，每次执行前重新核对；引用预检与回读直接使用固定推送 URL，避免误读不同的 fetch URL。多个推送地址及执行期间配置变化在执行前停止。临时快照不借用源目录的 remote 名称，继续使用验证后的地址。源码对照与现场证据见[Git GUI 对照](reference/git-gui.md)。

续期交换在独立任务中完成；HTTP/IPC调用取消仅停止等待，已经开始的轮换仍尝试原子加密保存。保存失败时保留待保存结果、15秒后可重试保存，不重复使用已被GitHub轮换的旧续期令牌；待保存结果阻止重启安装，移除账号或替换授权后清除旧结果。暂时网络/服务失败按账号退避60秒；缺失或到期续期凭据退避5分钟，并显示明确重新授权原因，保留账号/仓库/本地关联。旧版本登录缺少续期凭据，需升级后正常重新授权一次。

授权诊断只记录有限阶段、原因、HTTP状态、相对有效期及账号哈希。阶段包括token-received、token-rejected、refresh-start、refresh-complete、refresh-failed、refresh-unavailable和storage-load；区分expiring/expired、缺少/到期/失效续期凭据、配置、网络、保存和授权竞争。原始OAuth响应、URL参数、access_token、refresh_token、secret和账号名称均不入日志；Renderer不能写入这些后台专用字段。

Vite 只监听 loopback，HTTP 中间件要求本机 Host、同源 Origin / Sec-Fetch-Site、专用请求头、JSON POST 及大小限制，无 CORS 放行。静态 Sites 包装不运行这个本地账号服务，UI 会明确报不可用，不把 HTML 当作导入成功。

### 正常网页返回与开发配置

原生桌面也通过正常网页回调连接 GitHub。每次由主进程生成能力值，保存在主进程和原生授权服务内存中；无浏览器 Origin 的有限原生接口才可传递授权结果，普通页面不能轮询原生会话。主进程使用账号服务的授权专用接口保存并保留旧身份、目录映射和有效期，再确认完成。页面仅收到公开授权网址及不含凭据的账号目录。已有外部助手仍可复用；缺失时主进程直接运行原有 4174 服务，不再启动另一个应用身份来读取钥匙串。浏览器预览的实例绑定与原生能力值边界保持独立。当前接入仍使用本机已有开发应用配置，公共生产授权服务另行部署。

桌面启动时只读取一次 `userData/github-oauth-v1.encrypted`，与账号存储共同使用 `GitTogether` 的系统加密身份。缺失时短期迁移进程以旧 `GitTogether Authorization` 身份恢复既有开发配置，仅经继承的私有管道传回主进程并重新加密；管道有 512 字节上限，stdout/stderr 不承载秘密，临时会话退出即清理，旧文件保留。迁移或保存失败不会启用配置，损坏的新配置不会回退覆盖；准备失败由授权入口显示，设置仍可使用。首次读取旧钥匙串可能仍须用户授权，不能绕过系统权限；后续重新授权使用缓存，不读取钥匙串或启动迁移进程。应用密钥仍不进入源码、日志、页面或安装包。

主页面的 `connect-src` 除自身和现有开发 websocket，只增加固定 `http://127.0.0.1:4174/api/` 路径前缀，供网页授权的 start/poll/cancel 请求使用；不允许任意 HTTP、外部 GitHub API、开发配置或回调路径。仅配置服务 CORS 不够，客户端 CSP 也必须允许该精确来源。客户端 HTML 策略回归同时限制脚本、默认来源和对象，构建与实际页面均需核对。

浏览器与原生桌面入口现使用 `github-web-api.ts` 和 `GitHubBrowserAuthorizationModal`，不再调用设备码接口。`github-web-model.ts` 只有自有开发应用的公开 Client ID、固定本机地址与无凭据 DTO。浏览器先在点击事件内预留窗口，拿到经白名单校验的 URL 后只导航到 GitHub 官方 authorize；关闭 opener，弹窗被阻止时提供明确的再次打开入口。原生入口通过主进程打开已登记会话的系统浏览器网址。等待检查本机结果，不把访问令牌返回 renderer。

`github-web-authorization.ts` 保存十分钟的随机 state、S256 PKCE verifier 和一次性回调状态，服务端固定向 GitHub access_token 端点交换，不跟随重定向，不回显 provider payload，不保存 refresh token。拒绝、格式/网络失败、过期、重复回调和取消分别处理；提交门后取消等待保存结果，不误报回滚。主账号服务重启后停止当前流程，不把授权凭据自动重放到新的会话。

`server/github-oauth-dev.ts` 保留本机开发启动命令，在自动清理的专属临时目录编译并启动 `electron/github-oauth-dev.ts` 无窗口辅助进程，固定监听 127.0.0.1:4174。不读取桌面账号存储，不打开登录 WebView，不加载 .env。应用配置通过独立 `oauth-config-store.ts` 复用系统加密边界，保存在稳定的 appData/GitTogether Authorization/github-oauth-v1.encrypted，绑定配置版本和自有 Client ID；Chromium 的 userData/sessionData 仍位于临时目录。启动时恢复配置，系统加密不可用、解密或身份校验失败则拒绝启动并保留原文件，不明文降级。

`scripts/dev.ts` 是0.7.1统一开发入口，programmatic Vite 固定4173/strictPort启动后验证受保护的主服务状态，再校验4174公开的版本、Client ID和configured。只把ECONNREFUSED作为缺失助手，有限等待新启动；无效/超时/异版本/未知端口占用失败，不强杀占用者。复用已有健康助手不取得进程所有权；本入口创建的助手在退出、启动失败时收尾，助手意外退出同时终止未就绪的预览并报错。信号和启动竞争做幂等关闭。启动入口不产生OAuth grant、不读取配置明文，也不安装系统常驻服务；助手自行通过已有系统加密存储恢复应用配置。

每次新授权读取当前 4173 服务实例/版本，并把该连接器固定在本次授权会话中，而非永远绑定辅助进程启动时的实例。主服务重启后新的授权无需重启助手；旧回调仍拒绝跨实例导入。身份查询后读取目录及提交前再次核对实例，不重试或重放凭据。首次导入用 connect，重新授权先验证身份并用既有 updateAccount，保留账号 ID 与本地关联。账号令牌依旧仅进入账号服务的内存；现有通用 API 不保存 OAuth 有效期元数据，过期时明确要求重新授权，没有自动续期。

`electron/system-network.ts` 是桌面账号与辅助服务共用的 fetch 适配边界：通过 [Electron Chromium 网络](https://www.electronjs.org/docs/latest/api/net) 读取系统代理/PAC/直连规则，而非 Node fetch 或猜测某个 VPN 端口。辅助服务的远端请求使用独立、不持久化且禁缓存的 session；Cookie 不参与身份认证。4173 桥接使用另一个显式 direct session，仍保留固定路径、Origin、专用头、JSON、超时和实例验证。不会修改系统设置、绕过 TLS 或在代理失败后偷偷直连。已在桌面 main 注入同一适配器，必须重新构建/启动才影响已安装包；当前保留的 4173 Node 账号服务未改为 Chromium，仓库读取仍使用该进程原有网络路径。

有效回调通过协议校验后立即结束nonce CSP保护的完整HTML响应，页面清除地址中的code/state，避免原先网页导航等待长响应结束的问题。后台原会话继续一次性交换/导入；页面通过同源POST `/api/callback-status`、JSON和专用头查询仅pending/complete状态或安全失败，不返回catalog或凭据。该接口没有跨来源CORS，拒绝其他来源、GET、未知会话和伪造Host；不承担授权交换，不可用于重放回调。前端以textContent更新结果，成功自动关闭；禁止关闭时保留结果与返回动作。无效/重复/拒绝回调仍立即返回完整400页，已接受的后续失败由状态页表达。可选观察器只有received/accepted/complete/rejected/failed枚举，无法访问请求URL/参数/身份/正文，观察器出错不改变授权结果。

0.7.2的callbackProgress只向上述同源接口返回pending加有限phase（waiting/exchanging/verifying/importing）或complete；它不克隆或返回账号目录，原应用poll/cancel DTO不变。接受有效回调时进入exchanging，验证授权响应后调用原连接器进入verifying，原提交门进入importing，实际保存并得到catalog才complete。`github-callback-page.ts`持有页面文案、样式和nonce内脚本，计时使用performance.now、阶段只取服务结果，轮询无重叠；慢提示以当前阶段15秒为阈值，状态读取15秒超时后明确结果未知而非断言后台取消。成功/失败/未知结束页面计时与动画；文案用textContent，阶段枚举校验，URL清理/来源/取消/实例绑定边界保持。隔离脚本逻辑、HTTP协议和浏览器目视分别验证，不操作用户授权。

应用 API 的跨端口 CORS 只允许固定 4173 origin，要求专用头和 JSON；配置 API 仅允许自身 origin、随机配置页凭证和明确轮换确认。密钥直接从密码字段进入本机进程，等待系统加密文件保存成功后才启用；保存中拒绝开始授权和并发配置，失败保留旧密钥与用户输入，不回显内部存储错误。有活动授权时拒绝更换配置。父目录0700、密文文件0600，响应/日志/源码/安装包/浏览器存储均不带密钥。页面禁缓存、禁止嵌入与 referrer，回调响应移除 URL 中的授权码；不会代填或自动生成真实密钥。旧进程的内存配置没有安全导出接口，首次升级由用户直接重新输入一次，不提取或重放。本机入口与测试不是生产远端 OAuth broker，也没有把秘密打包进 Electron。此进程的配置/重启不清除主服务账号。

Electron main/preload 只开放有限 import、目录选择器、系统主题、环境信息与固定 GitHub 授权网页打开；所有 IPC 均检查当前窗口、主 frame 和可信页面，不接受调用者 URL。Material 3 使用不透明窗口背景，不再加载原生玻璃模块；兼容环境字段 nativeGlass 固定 false，不改变 IPC 形状。页面 window.open 一律拒绝，登录不嵌入 Electron renderer。`credential-store.ts` 使用 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) 将完整账号存储加密，系统加密不可用时拒绝保存，不明文降级；本地签名版可能触发系统钥匙串询问。浏览器服务使用内存会话存储，两者账号数据不共享。

### 独立 macOS 包

生产 `.app` 通过 `app.isPackaged` 加载 `app.getAppPath()/client/index.html`，不用开发 URL，也不启动 Vite/HTTP 服务；账号服务直接在 Electron main 中运行。预览环境变量只影响开发启动。`renderer-source.ts` 对文件来源比较精确的绝对页面路径，不能把所有 origin 为 `null` 的 file URL 视为同源；开发版仍比较指定 HTTP(S) origin。保持 contextIsolation、sandbox 与 nodeIntegration 禁用，不扩大 preload 能力。

`scripts/package-desktop.ts` 在系统临时目录构建有限源码/锁文件快照，Vite使用相对资源路径并禁用开发env注入，esbuild编译main/preload。产物只有client（含本地字体）、desktop与package.json，不复制.env、日志、测试、用户数据或账号。版本统一读取macos/package.json.version；源码/ZIP摘要写入包外build-info.json，拒绝交付构建期间变化的源码。Electron Packager生成arm64应用，osx-sign以Developer ID逐项签名，保留hardened runtime和必要JIT权限，不降级ad-hoc。打包默认使用已配置的gittogether-notary（可通过GITTOGETHER_NOTARY_PROFILE选择其他profile），强制要求Apple JSON结果Accepted，随后staple/validate并再次验证签名、重新压缩和计算校验值。缺失配置或失败直接停止，不生成宣称完成的更新发布。公共app-update.yml放在Resources；latest-mac.yml记录最终ZIP的SHA-512、大小和版本，不含账号数据。

0.17.3起打包入口同时执行类型检查、完整回归和公共更新发布。`scripts/desktop-release.ts` 只承担包外发布，不进入安装包：验证main提交已推送、版本递增及tag对应；用现有GitHub环境凭据或Git credential helper在内存中授权，经统一HTTPS REST接口发布，凭据不进入参数、日志或产物。只在对应源码的draft上传ZIP和清单，核对uploaded状态、大小与GitHub SHA-256 digest后标为stable/latest。已公开版本不可覆盖，同版本草稿可重试；本机独占发布锁避免两个打包同时写同版本。创建、上传和公开发生临时网络失败时，先回读同版本/同源码草稿与资产，确认已完成则不重放，未完成才有限重试三次；已确认成功的写入允许列表短暂延迟，只等待回读、不重复写入；发布读请求禁缓存。权限错误或状态已改变直接停止。草稿通过有写权限的发布列表读取，避免只按tag查找遗漏未公开结果。发布后通过可独立恢复的verifyPublicDesktopRelease无凭据回读latest、tag提交、应用更新器使用的Atom列表、清单及完整ZIP。JSON/清单使用HTTPS REST，完整ZIP统一通过macOS HTTPS下载器读取，从byte 0获取全包，15分钟时限及两次有限重试；不关闭TLS校验。核对SHA-256/SHA-512与完整大小；全部通过后才在build-info写publicUpdateVerified。打包不安装、重启或读取用户账号存储。

### 桌面更新与数据保留

0.9.0起Settings单独提供应用更新组，只在打包macOS启用。main持有固定公共DDonlien/git-together GitHub provider的electron-updater，renderer只通过当前窗口/主frame/精确file页面验证的四个有限IPC读取状态、检查、下载、重启安装，不能传入URL、凭据或路径。下载验证SHA-512，安装由Squirrel.Mac验证与当前App相同的代码签名后替换应用；不禁用TLS/ATS，不允许降级、预发行、自动下载或普通退出时自动安装。进度来自原生事件，设置轮询只读本地IPC，不重复请求GitHub。import完成前不安装，安装阶段拒绝新import，避免中断账号原子保存。

bundle ID保持com.gittogether.standalone，名称保持GitTogether，userData固定appData/GitTogether-Standalone-Demo，继续使用accounts-v2.encrypted及preferences.v2；升级不重命名、删除或迁移此目录，不复制数据进包。safeStorage与SavedState v2保持原样，本地关联只是保存路径，不改仓库内容。浏览器会话不共享到桌面。旧ad-hoc版先手动替换为带更新能力的Developer ID版，此后使用同一签名身份；签名身份/存储位置变更需另行设计迁移，不能清空配置作为恢复。

0.10.1将检查、下载和安装失败分开处理。GitHubProvider可把缺失的正式latest包装为ERR_UPDATER_INVALID_RELEASE_FEED，因此只输出安全的发布信息不可用提示，不把所有解析错误断言为未发布，也不显示底层XML/网址/路径。控制器记住当前操作，以免原生error事件与Promise拒绝重复到达后失去失败阶段；只有安装阶段提示应用可写目录和签名。公开Release需在资产齐备后发布，源码tag与安装包快照对应；仅生成本地ZIP或推送源码不代表更新源已就绪。

## 本地关联与只读查看

Tauri/Rust读取一致性（2026-10-11，RUN-01-tauri-parity）：旧式单目录关联通过同一个localWorkspace读取器展开；失效旧目录保留错误，但不能阻止新增正确目录或批量匹配。snapshot遇到任务错误必须返回失败，不把不可读取的目录当成无修改。可选branch在协议边界校验，格式错误不能扩大解除关联的范围。Git历史仅将origin引用缩写为origin/分支，其他远端保留refs/remotes命名空间。

后台fetch用独立作业令牌及等待者计数合并相同仓库请求；每个调用独立取消，最后一个等待者离开才停止Git作业。取消账号刷新不写入持久化错误。远端API读取与本地引用更新分别处理，fetch失败仍读取远端并显示明确反馈，继续遵守退避；停止刷新后不启动迟到的远端读取。不完整树或带警告的提交详情不进入不可变SHA缓存，后续允许重新读取；Gitea Diff解码Git引用路径及八进制UTF-8字节后匹配文件，保留中文和特殊字符文件的patch。

账号设置中没有仓库路径字段。账号连接后，全部已读取的仓库直接出现在侧栏和 Dashboard；远端内容不依赖 localLink。Dashboard 的仓库/分支目录入口及本地文件树空态复用配置弹窗和可点击的目录选择字段。`local-directory.ts` 验证原生 IPC 返回的绝对目录，取消返回 null 并保留原目录；浏览器尚无原生选择桥接，不接受上传伪路径。选择不自动保存；0.10.0 的 link 可带 branch，保存时调用 local-discovery 按远端身份和真实检出分支匹配。解除关联可只针对一个分支，不移除远端仓库、不删除文件。

`LocalLink.path` 保留用户选择的仓库/父目录，新增可选 worktrees（branch + canonical path）；加密 SavedState v2 与稳定存储位置不变，旧单目录记录仍可读取。Rust `service::discover` 先直接检查.git目录或gitdir文件，所选父目录为第0层，向下最多检查6层；没有标记的第6层支路停止，继续搜索其他同级目录。识别Git后不枚举项目内容，已核对的登记worktree不重复处理。4000安全预算只计算仍需展开的父目录，每个仓库最多64个匹配工作目录，不进入符号链接、Git元数据及常见构建/依赖目录；遇到checkout不扫描它的内容，另核对真实worktree登记中位于选定范围内的目录。远端身份复用 `git-identity.ts`，不按目录名猜分支；候选再次核对其实际remote。取消、限制、错误或持久化失败不部分保存，串行提交前复核原关联未被其他操作替换。仓库三态要求已知完整分支范围和每分支健康目录；范围未知不标完全关联。可见的已关联仓库即使收起，也用原远端心跳读取HEAD和分支范围；未关联仓库仍仅展开时读取。

下载层级及目录显示（IMPORT-14-branch-download-layout、IMPORT-04-directory-display）：downloadBranch请求仍只传repositoryId、branch、parentPath和folderName；Rust operations::download按当前仓库名生成安全项目容器，在parentPath/project-name/folderName创建真实worktree，默认folderName为project-name_branch-name。预览与后端采用相同的非法字符替换及尾部点/空格清理规则，项目层不接受请求中的任意额外路径。实际下载、LFS及目录占用检查仍完成后才保存原v2关联；已有文件、符号链接容器和已占用目标不覆盖。仓库显示由branch-links.repositoryLocalDirectory从完整LocalLink.worktrees推导；缺少worktrees的旧单目录记录用LocalLink.path，空工作目录集合不冒称已识别。默认命名结构的唯一工作目录显示项目容器，其余单目录显示自身，多目录按路径组件计算最小公共父目录；Windows比较不区分大小写并统一分隔符，跨驱动器/UNC share无共同目录时显示各真实路径。默认结构判断只调整已验证关联的显示，不据文件夹名推断Git身份。显示路径用于Dashboard搜索、排序、辅助文字及健康提示；分支仍用实际工作目录。选择范围、缓存mappingKey、关联与Git文件保持原样，搜索或隐藏只影响可见行，不改变目录计算输入。

Dashboard 的 `matchAccountRepositories` 是单账号批量目录关联入口：renderer 只提交 `accountId` 和用户选择的父目录，账号服务从自己的 Catalog 取得该账号全部可访问仓库，目录扫描一次后按规范化远端身份返回命中的仓库 ID，并在一次持久化变更中更新这些关联。未匹配仓库保持原记录；多个账号筛选时客户端逐账号调用，搜索、组织、类型和可见性筛选不参与匹配范围。请求与响应继续通过有限 API DTO/IPC 校验，不向 renderer 传递账号令牌。

关联本地目录后，RepositoryView 使用真实 Git status、branch、最近 log、工作目录与暂存区 Diff；关联或解除时重建对应视图，避免残留的本地快照。有限 execFile 参数、不使用 shell、禁止外部 diff/textconv、关闭可选 index 锁；不提供任意命令/任意文件读取。Diff 仅接受当前更改列表中的路径；未跟踪文件不编造差异或读取内容。此段描述原只读浏览边界；2026-10-10 用户授权的分支下载与本地 Commit/本机 Codex 生成分别遵循对应有限入口。其他未实现操作不显示模拟成功；0.23.0 的独立 Presence 接入见下方插件章节。

外观与折叠偏好使用 `gittogether.preferences.v2`；不保存账号令牌、仓库私密数据或错误状态。旧 v1 演示存储保留但不读取为新工作区，也不自动覆盖/清除它。

## 仓库三栏与任务模型（R-05，部分接入）

`RepositoryColumns.tsx`独立持有当前工作台的三栏比例；`column-layout.ts`以总和10的整数份额提供默认3/4/3、相邻份额调整及最小可读宽度边界。两条12px分隔轨道复用原卡片间距，不嵌套或重挂任务。Pointer capture让离开间隔的拖动继续，pointerup/lost capture结束，Escape或pointercancel恢复拖动前比例；方向键每次移动一份，Home/End到当前有效边界。ResizeObserver仅更新布局宽度并在卸载断开，不注册全局鼠标事件，不写应用配置。最小布局宽度按份额与230/290/216px基准推导，保证已展开三栏的真实宽度也是10%档位，而不是被minmax偷偷夹成连续比例。收起时沿用44px窄栏与原最小宽度，分隔条不可访问；全部展开时恢复已保存于组件内的份额。无账号、DTO、IPC或Git变更，也不声称跨页面/重启持久化。

App 不再渲染重复顶栏，RepositoryView 保留一个基础信息块，并组合 RepositoryGraph、RepositoryChangesColumn 与 RepositoryFileTree。`repository-model.ts` 定义 task/commit/workspace 数据：任务 ID 区分 branch 与 worktree 路径，commit 包含真实 parents 和 refs。全部任务同时挂载；聚焦和中栏上下文切换采用 hidden，而非过滤卸载或 Git checkout，因此每个卡片的输入与 native details 展开状态保留。文件选择由 RepositoryView 按 task ID 存储，描述由对应 RepositoryChanges 持有，离开整个仓库页后不声称草稿已持久化。

`RepositoryColumnHeading.tsx` 是模块级公共栏标题，各实例持有自己的收起状态，函数式更新且不新增RepositoryView的hook、任务包裹或key变化。按钮保留同一DOM，名称随状态切换并提供aria-expanded/aria-controls。CSS通过标题的is-collapsed与`:has()`分别设置三栏宽度/min-width变量和隐藏相邻内容；44px窄栏保留展开按钮与标题，三个开关互不影响。内容仍挂载，任务草稿、selectedFiles、native details与文件树来源不重置，原读取/心跳机制保持；没有账号服务、API、IPC、Git写操作或存储变更。

默认图表使用全部已读取提交；聚焦按任务 HEAD 的真实祖先遍历过滤，并保留原 topo 顺序。SVG 只绘制 commit-parent 数据关系，包含分叉、合并与断开的根；未知父关系不会按日志相邻顺序合成。文件树由已读取路径组成、目录优先排序，行点击只更新对应 task 的选择。

0.6.0 的 `commit-graph.ts` 是独立前端图模型，只以类型依赖共享 `repository-model.ts`；图布局/搜索改动不再牵动 Vite 配置所加载的账号服务模型。其 `layoutCommitGraph` 维护轨道颜色，已读取的真实父节点继续轨道，未读取父节点只输出 boundary 虚线短尾，不占用后续幽灵轨道。`GraphRow` 的颜色/入边及 `GraphEdge` 的颜色/边界字段只属于渲染模型，不改变服务 DTO。`RepositoryGraph` 复用公共栏标题并包含分支名定位菜单、只读上下文菜单、36px双行、单一键盘入口和搜索状态；匹配列表从现有提交与搜索派生，窗口键盘事件仅用于共享搜索框的结果导航并在卸载时移除。按SHA定位DOM行，选择继续调用View原有的按任务回调；不新增读取/存储/写操作，选中详情仍由中栏组件负责。

0.10.0 的 `server/repository-reader.ts` 已由 AccountService 的有限 localWorkspace 方法接入。核对每个保存目录的真实 Git 根与远端后，只返回已关联路径中的真实 worktree，不用未检出分支冒充目录；不同 clone 的任务也独立保留。读取 `worktree list --porcelain -z`、local/remote refs、各目录 status、tracked/untracked（排除忽略项）完整树。合并图按真实父节点 topo 排序，最多每次读取最近200条，不进行网络fetch，不代表完整历史或远端实时提交。单个缺失/失效目录成为自己的错误任务，其余健康任务仍可用。

每个 worktree 校验其 realpath Git common-dir 与关联仓库相同；缺失 worktree 的错误限制在该任务。Diff 按精确 task ID 找到工作目录，只接受当前更改列表中的字面路径，不接受任意目录、未检出分支或 Git 特殊 pathspec；不读取未跟踪文件内容。所有 Git 使用有限 execFile 参数、10 秒超时/8MB输出上限、禁止外部 diff/textconv、关闭可选锁，不写 HEAD/index、不暂存/提交/切换。

完整读模型、带taskId的Diff、HTTP/IPC校验和controller已接通生产App。Diff/openFile仅允许精确已关联任务路径，先验证保存的远端，再确认当前真实任务身份；不能通过共享common-dir访问尚未关联的兄弟worktree。旧snapshot方法保留兼容测试，生产使用localWorkspace，snapshotWorkspace只作未提供新模型的组件回退。`worktree-links.test.ts` 与 `remote-integration-preview.ts --worktrees` 使用真实临时Git和实际AccountService验证父目录批量发现、独立内容、三态、逐分支解除与HEAD/index不变；不使用用户凭据或工作目录，不代替原生选择器验收。

历史提交详情由模块级 `RepositoryCommitDetails.tsx` 统一渲染在本地/远端任务底部，不再属于Graph。View保存单一`commitSelection: {taskId, commitId} | null`，由它派生选中记录与提交订阅；聚焦时优先对应任务，未聚焦时保留远端HEAD/真实祖先匹配。仅本地composer使用hidden而不卸载，草稿与文件选择继续保留；取消选择恢复本地输入或远端等待选择空态。远端只使用匹配当前SHA的读取结果，未读到或失败时显示当前图记录而非旧提交。R-05-remote-metadata 移除远端顶部重复分支/来源/SHA 与摘要/作者/时间；R-05-remote-focus-control 再移除远端聚焦按钮和其专用标题栏、props/回调及样式。顶部显示全部任务及本地聚焦入口不改，区域名称继续标识任务，图、树及底部详情不改。R-05-history-body的前端组件支持可选description，按summary、普通正文、辅助作者/时间/SHA渲染；没有正文时省略，不推断或补写内容，不新增复制状态。远端读取器及本地图记录仍只读summary；R-05-local-history-diff新增的localCommit详情读取完整本地提交正文，经独立有限DTO验证后送入底部组件。没有新存储，工作目录更改列表和草稿仍独立保留；文件内容预览按R-05-local-preview-removal取消。

R-05-change-context由`RepositoryChangesColumn.tsx`承担中栏稳定边界，派生唯一活动task，保留原task.id和所有隐藏卡片。无提交选择时优先选择的本地任务/聚焦本地任务/已关联目录，多个本地任务通过公共菜单切换；选择提交时只展示对应任务。组件仅持有必要的分组模式和本地目录选择，不用effect同步派生状态。`RepositoryChangedFiles.tsx`在本地/远端真实复用完整文件行、搜索和可选新增/修改/删除/其他分组，使用前端`file-tree.ts`导出的同一状态分类器，不切片、不复制服务字段。中栏stack及body不再滚动，活动卡片伸缩约束在可视栏；列表flex:1/min-height:0/overflow:auto，底部composer/历史详情不收缩，取消160px上限。R-05-local-history-diff接通后，选择本地提交时隐藏工作更改，改读该SHA的完整文件列表和提交说明；取消恢复原工作区选择。按R-05-local-preview-removal，本地与远端均不显示文件内容预览。

## 无本地关联的远端内容（R-05-remote，0.5.0 正式接入）

R-05-history-pagination 的首个remoteWorkspace只取每个远端分支的50条提交；RepositoryGraph滚动接近历史底部时，通过`remoteHistory(repositoryId, head, page)`以稳定HEAD读取后续页。浏览器/Rust读取器均以页缓存，客户端最多并行取4个选中分支的下一页，再将真实提交合并拓扑排序；没有总提交数上限，只有每页50条的响应边界。空后续页表示结束，Link/页大小提示下一页；分支图以未读取父节点作为边界，不制造提交关系。该历史读取不改变branch/head/tree基准，也不执行Git写操作。

`server/remote-repository-reader.ts` 只接收 provider、已验证的仓库标识和服务端 transport。0.5.0 的 AccountService 提供固定 API base、账号凭据、8MB 有界 JSON/文本响应和有限远端方法 `remoteWorkspace` / `remoteCommit` / `remoteFile`；renderer 只能传入仓库 ID、合法 SHA 与字面路径，不能传入 URL、host、token 或任意 blob。生产 App 调用专用 hook 并向 RepositoryView 传递远端状态与有限提交读取函数，未关联本地也自动加载。服务缓存最多 16 个读取器，凭据/仓库变更或移除后失效；每次请求前后及返回前复核身份，旧凭据结果不能重新发布。HTTP/IPC 共用 AccountService 的有限分发，客户端再验证无凭据 DTO；不新增任意网络或目录入口。

GitHub 使用 branches、commits、git/trees、git/blobs；Gitea 区分 branches 的 commit.id、提交列表、git/commits/{sha} 与原始 .diff，再读取树和 blob。参考 [GitHub Branches](https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28)、[Commits](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28)、[Trees](https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28)，以及 [Gitea 单提交](https://docs.gitea.com/api/1.24/operations/repo-get-single-commit/)、[提交 Diff](https://docs.gitea.com/api/1.24/operations/repo-download-commit-diff-or-patch/)、[Tree](https://docs.gitea.com/api/operations/get-tree/)。不克隆、不 fetch，不读写用户 HEAD/index。

分支最多 1000 个，每分支首屏读取50条提交，滚动时继续分页，提交总数不设上限；最多4个分支并发。树与head历史按不可变SHA缓存，各最多64份；真实父节点去重并拓扑排序，不用作者日期或相邻行捏造ancestry。GitHub recursive树截断时回退逐目录读取，Gitea按total_count/truncated/Link本机分页；最多20000个树条目（Gitea 200页、GitHub 400个子树请求），到限明确提示不完整。GitHub提交文件最多3000个，缺少patch时明确二进制/未提供差异，不伪造。逐分支失败保留成功部分；取消传播，失败和空仓库分开。

App维护应用内Dashboard/仓库/设置页面历史及重做游标；仓库列表与详情页共用返回、重做、刷新图标按钮，刷新按账号逐个调用完整目录接口。后端仅以成功的完整账号仓库快照替换该账号目录，删除目录项时保留本地link数据，不再显示不存在的远端仓库；目录读取失败保留原Catalog。单独远端workspace读取403保持权限错误语义，不据此删除仓库。刷新命中当前详情仓库删除时，App将该访问位置替换为Dashboard。

`remote-repository-model.ts` 定义独立、无凭据的响应验证。远端任务 path=null、files=[]、remote=true，树属于已提交对象，不是本地更改。`combineRepositoryWorkspaces` 同时保留 remote/local 任务身份，按真实提交父节点合并；同名origin引用以共享远端快照的HEAD为准，不把过期本地跟踪标签叠加到另一个位置，本地解除不应擦除远端内容。Provider保留已验证的HEAD历史，即使对应文件树失败；仅本次HEAD历史缺失时才保留旧分支快照。Pull/Push数量只使用同一份提交父图中已证明的领先、落后或分叉关系，历史未知不产生数量。后台Fetch成功触发既有共享本地读取器更新引用和对象，不改变工作文件，也不把引用变化当作本地保存再次触发Fetch。文件读取只接受合法 SHA 与字面仓库路径，并先查该提交的树定位 blob；不跟随 submodule 或接受任意 blob。超过 500KB、含 NUL 或非 UTF-8 返回明确不可文本预览。

RepositoryView 接受独立 remoteState 和有限 readRemoteCommit。图选中提交控制对应任务的中栏文件列表和右栏差异标记，不替换树的当前 HEAD 目录，再点选中项清除选择；文件选择仍按任务 ID 同步。按 R-05-remote-inline-preview 移除远端内嵌文本展示、内容状态/轮询以及 App→View→RemoteChanges 的文件读取 prop；生产 hook 不再发起专供预览的 remoteFile 请求。后台有限 API、Diff/blob DTO 和相关权限/隔离测试保留，没有服务或协议改动。`use-remote-commits.ts`仅订阅明确选中的远端SHA，无选择不回退到task.head；复用前台取消/退避调度器，按 SHA 缓存最多 64 份，资源身份阻止过期发布。远端禁用composer已移除，本地未提交卡片仍独立保留草稿和Diff。实际 App 始终传入远端读取状态，失败显示实际错误/自动重试、空仓库显示真实空态；旧隔离组件未传 reader 的占位契约保留。0.5.0接通时的服务重启和当时需重新连接账号属于历史更新，不用fixture端口或无凭据公开读取作为当前真实账号已登录的证据。

R-05-global-tree 将树基准与提交差异分离：View 始终将原 task、HEAD 和 treeComplete 传入树，仅将与当前明确选择 SHA 匹配的 details.files 作为差异；加载或迟到结果不能带入旧提交着色，也不能把历史树的完整性替代当前树。按R-05-change-context取消选择传入空差异集合，远端树恢复中性，不回退HEAD差异；共享的空集合稳定且不会触发新的读取。本地仍由task.files提供真实工作目录状态。前端专用 `file-tree.ts` 由固定路径和变更集合纯派生树，归一化 Git/provider 状态、重命名旧路径、历史缺失路径以及父目录混合状态；不修改输入、共享服务模型或 DTO。`RepositoryFileTree` 使用 memoized 派生数据和稳定路径 key，不新增状态或重置 effect，继续保留 native details 展开和挂载的来源任务。本地历史通过R-05-local-history-diff提供匹配当前SHA的差异；取消后本地树恢复task.files工作目录标记。源码接入不等于原生包更新。

测试 `git-remote-fixture.ts` 把本轮创建的真实临时 Git 数据转换为有限 provider 响应，覆盖零关联的真实 merge、分支树、Diff、已提交 blob 与本地脏内容隔离；`remote-integration.test.ts` 经过实际 AccountService→HTTP→importAPI，验证两个 provider、有限输入、SHA 缓存、凭据更新/移除竞争、取消和 HTTP 断连。`remote-integration-preview.ts` 在独立临时端口运行生产构建 App 和实际服务，测试账号只有 synthetic token，无测试入口进入生产；`repository-preview.ts --remote` 保留组件隔离 QA。临时 Git 的 HEAD/index 不受应用改动，用户凭据不导出、不重放、不落盘。

文件树来源控制仅为 RepositoryView 内部状态，不新增 API。未选择时优先远端（只有本地任务时显示本地）；用户选择不被心跳重置。按 task.remote 区分来源，按现有 task.id 隐藏而不卸载树，选择与展开仍各任务独立；聚焦任务不属于所选来源时，右栏按同一分支匹配另一来源的任务，不改变聚焦或 checkout。源无任务时显示明确状态，不回退冒充另一源。标题公共分段组件提供具名 fieldset/legend 与 pressed 按钮，复用 Tab、Enter、Space；右栏卡片不重复显示远端文字。隔离 `repository-preview.ts --mixed` 组合同一个新建临时 Git 仓库的 provider 已提交内容与本地脏工作目录，用于来源差异/状态保留验证，不连接用户账号服务。

## 本地历史提交差异（R-05-local-history-diff，0.15.0）

AccountService新增有限localCommit方法，diff增加可选commitId；只接受仓库、已关联worktree任务、完整SHA与字面文件路径。taskRoot核对真实关联/远端/工作目录，请求前后检查账号可访问性与关联身份；HTTP/IPC沿用同一分发。提交必须是当前仓库历史中可达的commit，补丁路径必须属于该提交更改列表。读取禁用外部diff/textconv、可选index锁和partial clone隐式fetch；每条Git读取限制10秒/8MB，取消传播至进程，不写HEAD/index或切换分支。

repository-reader读取真实提交正文与原始对象parent头，避免浅克隆pretty-format隐藏父节点而误判为首个提交。普通/合并提交与第一个父提交比较，根提交使用--root；缺失父提交明确报错。NUL分隔的name-status保留中文、空白及换行路径，重命名同时携带旧路径；逐文件patch保留二进制、模式及重命名元信息，不用工作目录内容代替历史。

use-local-commits仅订阅明确选中的本地task/SHA，缓存最多64份，取消或迟到数据不发布；独立LocalCommitDetails验证完整提交身份、正文和文件列表。RepositoryView分别保存工作区选择与task/SHA历史选择。按R-05-local-preview-removal，选中文件只更新列表和树的选择，不读取内嵌补丁；提交详情仍按task/SHA读取。未读取到当前SHA时显示加载或实际错误，不显示其他提交；底部composer隐藏但保持挂载。完整当前文件树/HEAD不替换，仅叠加当前提交差异，取消后恢复工作区状态与草稿。本地和远端都没有文件内容预览。

## 本地诊断日志（IMPORT-14-diagnostics，0.13.0）

`LocalDiagnostics` 写入固定的 `~/Library/Application Support/GitTogether-Standalone-Demo/logs`，与账号加密文件分离；桌面、预览与授权助手共享目录，但按小时、组件和进程会话 UUID 独立 JSONL 文件，避免多进程交错写入。目录权限 0700、文件 0600，拒绝日志目录/写入目标软链接，不扫描或删除非本功能文件。短行同步追加保存最后一次失败，日志 IO 错误不影响原操作结果。启动、每分钟、查询状态/关闭时清理；24 小时边界小时按行时间裁剪，其他过期小时删除，不运行时在下一次启动清理。

总日志空间上限 128 MiB；每分钟及每累计至多 1 MiB 新写入执行空间清理，可短暂超出至多每写入者约 1 MiB。达到上限删除较早日志文件，设置提示当前记录可能不足 24 小时；容量提示在触及上限的进程会话内保留。边界原子改写意外留下的本功能临时副本在超过 5 分钟后清理，不触碰其他文件或尚在改写的副本。日志不是审计保证，进程强制终止、断电、目录不可写或预览服务断开时可能缺失；写入/清理健康在设置明确展示，不静默冒充已记录。

有限协议由 `diagnostics-model.ts` 白名单重建，仅保留时间、版本、事件/结果、方法、provider/端点类别、允许的错误类型/代码、HTTP 状态、Git 退出码/信号、耗时、重试延迟与计数。不保存原始消息、堆栈、输入/响应、URL、凭据、文件内容或明文账号/仓库/分支/目录。资源使用每进程随机盐 HMAC；渲染层不能传入资源标识或服务器跨度。`importAPI` 生成 UUID，经有限 IPC 或同源 HTTP 传给服务；AsyncLocalStorage 关联根请求、provider/存储子跨度与只读 Git 失败。常规本地读取由外层 API 记录开始/成功，内部 Git 仅记录失败，以免高频轮询产生巨量日志。部分任务/目录失败及不完整结果独立记 partial；保留缓存不代表读取成功。

渲染层记录请求结果、实际退避/暂停/恢复、网络/可见性、偏好存储失败及未接入 Git 操作的 blocked；授权只记录安全阶段，更新记录 check/download/install 及终态，不存发布包内容或错误原文。进程异常监视不改变崩溃语义。日志不上传。设置的四个有限操作status/record/open/copy由本机同源HTTP检查或既有可信主frame IPC检查保护；共用`diagnosticsCommand`，打开固定日志目录而非接受调用者路径。0.14.0的copy先按既有24小时规则清理，仅读取受控文件名的普通JSONL文件，排除软链接、目录及非本功能文件；通过固定系统脚本调用macOS NSPasteboard，以NSURL文件项写入剪贴板，供文件附件粘贴使用。脚本内容固定、文件路径只作execFile参数，没有shell插值；4秒超时、空列表和系统失败明确反馈，不复制文本路径/文件内容或上传。使用Apple的[NSURL写入剪贴板方式](https://developer.apple.com/documentation/appkit/nspasteboardwriting)。纯静态部署和旧客户端无日志服务时明确提示不可用；不降级到浏览器明文存储。构建加载Vite配置不启动日志写入。账户与本地关联格式及安装应用身份保持不变。

## 本地提交与 Codex 说明生成（0.22.11，沿用0.18.0原生提交约束）

0.30.1的Submit沿用Commit说明契约：Summary非空即可确认，Description允许为空；AI成功状态只控制是否继续生成，不作为提交门槛。中栏通过每目标的可选draft把当前文本传入弹窗，弹窗修改也回写中栏草稿，避免关闭重开恢复旧值；手工摘要跳过自动生成。确认时取消仍在进行的生成，阻止迟到结果写回。没有手工摘要时仍可自动生成，未手工修改的说明在文件范围变化后重新生成。原有任务快照、选中路径、Commit后Push与仅重试Push的幂等边界保留。

Git错误分类先识别Unix和Windows磁盘不足，再区分LFS命令缺失、对象404及其他过滤器或钩子失败；只返回固定安全提示。Rust提交的add和commit步骤记录受控动词、退出码、耗时及故障代码，不记录原始stderr、正文、文件路径或凭据。

`RepositoryCommitComposer` 为每个已挂载本地任务保存 Summary/Description 草稿，历史视图只隐藏表单；通过有限 submitCommit/generateCommitMessage/cancelCommitGeneration DTO 调用现有受保护 HTTP 或主 frame IPC。Dashboard及仓库页的Commit/Submit打开固定worktree快照弹窗，每个目录按Tracked/Untracked分组，复选状态作为可选paths DTO传给submitCommit/generateCommitMessage；空、重复或已不在当前更改中的路径拒绝。范围随草稿在服务会话内保留，仅相同HEAD/changeKey复用；调整范围取消旧生成，不覆盖手工字段。旧直接提交表单未提供paths时仍提交该目录全部更改。

AccountService 从已保存仓库、账号与关联定位真实 worktree，复核 expectedHead/changeKey、remote 与映射身份，不接受 renderer 命令或任意路径。每个关联根串行执行；operationId 在当前服务实例内对已确认成功结果幂等，同 ID 不同内容拒绝。冲突、待完成 merge/rebase、已有 index.lock、过期快照在写入前拒绝。local-submit 使用真实 Git、私有 index 和独占 index.lock；分别保存原暂存区和从HEAD（unborn使用空树）建立的提交索引；GIT_LITERAL_PATHSPECS防止文件名被当作模式，仅对选中路径add --all，重命名附带原路径，之后再次复核快照，以标准 input 提供提交说明并保留 Git identity/hooks/signing。确认新HEAD的父提交与实际树后，在保存索引中仅将选中路径更新到新HEAD，再原子发布index，未选文件的已暂存内容（包括部分暂存）保持，失败保留原 index；已确认提交但响应/后处理有问题返回真实成功及警告。进入 commit 后不因浏览器断连取消，120秒执行上限仍保留。不会checkout、移动HEAD的reset、push或修改另一个worktree；路径限定的reset仅更新保存索引条目，不改HEAD或工作文件。

controller 在提交前后递增本地读取版本，丢弃写入前轮询的迟到响应；成功立即重新读取共享 localWorkspace，再触发一次仓库远端状态检查，不清空其他任务选择和草稿。图谱从已验证本地/远端祖先派生未推送状态，缺失远端仍标本地提交；虚线轨道标记跨行传递，保持真实父子关系。

commit-generator 仅收集当前任务选中范围最多96KB的差异证据，限制未跟踪文本与文件数量，跳过二进制/符号链接。Windows 在 PATH/native CLI 与已安装桌面版的 LocalAppData/OpenAI/Codex/bin 缓存中比较实际语义版本，使用新版 CLI，避免旧 PATH 副本拒绝当前模型。通过该 CLI 的 app-server 只读 config/read 与 model/list 获取工具名称和实际推荐模型，不创建会话或修改全局配置；生成说明时使用此推荐模型，保留登录/provider。随后在空临时目录内以 read-only sandbox、ephemeral 和限定 JSON schema 执行 exec，忽略 rules，禁用 shell、多 agent、apps、plugins、hooks 和 web search，并为每个已配置 MCP 显式设置 enabled=false；空 mcp_servers 表不会清除合并配置。更改内容作为不可信数据放入 prompt；生成结束复核同一任务快照，过期结果拒绝。每个本地版本探测最多5秒，配置及模型目录读取最多20秒，生成子进程最多150秒；显式 generationId 取消经 HTTP/IPC 到子进程，取消只作用于匹配任务/生成请求，临时文件最终清理。CLI 失败按模型不可用、认证、版本参数、网络或其他生成失败显示固定提示；诊断只记受控分类及退出码，原始 CLI 输出、配置值和提交正文不进入日志。

推送反馈（0.22.11）：RepositoryActionDraftsProvider内的PushFeedbackProvider保存服务会话级临时状态，统一Dashboard、仓库详情和更改栏Push/Submit入口。批次UUID与实际repository/task/path绑定；成功才记录completed，失败清除未完成pending，旧批次定时器不能覆盖新操作。仓库全部/部分覆盖按所有本地worktree判断，分支固定实线/双勾；成功标识约2600ms后消失。原有逐worktree Commit→Push顺序、操作幂等和错误重试不变；push/submit不调用横条成功回调，commit仍可提示本地提交已创建。官方Material Web LinearProgress使用不确定型，批量数字仅表示完成目录数。

macOS Git工具环境与操作错误（2026-10-10，IMPORT-14-push-lfs-errors）：git-process和branch-download共用gitToolEnvironment，在各Git子进程环境中追加用户.local/bin、Apple Silicon及Intel Homebrew目录，保留继承PATH优先级并去重；不执行登录shell、不改全局环境或Git配置。LFS钩子与filter继承相同环境。RepositoryActionDialog删除Entry.error和重复catch，仅由弹窗error保存失败信息，带失败仓库/分支并用共享Notice展示；Commit/Push结果与UUID继续用于跳过已完成步骤。已知LFS缺失返回固定安全提示及git-lfs-missing诊断分类，不回显Git原始输出，也不将泛化失败误分类为分支权限。

Dashboard展开呈现（2026-10-11）：DashboardRepositoryRows将展开意图、过渡期间挂载和完成展开区分。原tbody及七列表保持不变，每个分支单元格通过内部网格过渡高度，完成展开后允许角标和焦点轮廓溢出；收起立即设置aria-hidden/inert，transitionend后卸载，减少动态效果或后台页面有短延时收尾。快速反向切换取消旧收尾，原remote读取启用条件仍只跟随展开意图/关联状态，不随呈现过渡延长或新增网络检查。SearchBar继续共用官方组件，36px/13px/300px尺寸由公开CSS令牌统一控制；不修改服务或持久化字段。

## Presence 插件与首个 NAS 服务（0.23.0）

PRESENCE-01/02/03：Presence 独立于账号导入和 Git 写服务；有限 presence_command 与同源 /api/presence/{status,configure,reconnect} 共用 Rust Presence。私有默认配置从 ~/.config/git-presence/gittogether.local.json 发现，配置保存沿用系统加密，不把密钥返回渲染层或纳入包。更换服务器拒绝复用旧密钥；URL 限 HTTPS（loopback 例外），不接受 URL 凭据、query 或 fragment。

0.23.0 App 为 GitPresence v1 只读 observer，只接收 welcome/world 和维护心跳；此段为历史架构，0.30.0账号发布见下文。服务器 grant 同时限定角色与仓库，App 不发布、不执行 Bridge 写操作。历史独立 Bridge 是 Git/编辑器事实发布者；App 也通过固定私有 connection.json 读取 loopback /v1/projects 与 /v1/view，跳转和远程地址不得承载本机密钥。没有 Node 业务 sidecar、动态插件执行或凭据迁移。

Rust 以配置 generation 隔离旧连接结果，停用/配置变化立即丢弃连接任务；续期/断线保留上次快照且使有效性未知。Bridge 与远端独立，服务端按 alive 判断有效性，不用客户端时钟重新裁决来源。前端单一 PresenceProvider 在页面切换时保持状态，读取失败也撤销在线有效性。完整快照有容量、路径与类型限制，编辑器未接入不能显示已确认 clean。部署与初始两个仓库的范围见 docs/presence.md。

## Presence账号自动管理（COLLAB-03，0.30.0）

Presence有限命令为状态、最高级开关、账号登录/退出、打开账号Web及添加/选择/移除服务器；旧加密配置继续读取，删去客户端密码修改、个人仓库绑定及团队选择入口。身份以归属issuer/subject为准，向目标服务器交换签名短时凭证和其独立会话，不传归属登录Bearer。元数据变更写加密缓存但不重启正常连接，断线只影响所属服务器的有效性。

source_loop独立扫描可访问的已关联工作区，读取Git status及分支身份，不读取完整树/历史；结果由所有所选服务器共享，WebSocket心跳不等待Git扫描。读失败保留上次事实并标unknown，撤去可执行工作区；Bridge编辑器断线也标unknown，不伪造clean。协议3的world下发组织/角色及每个项目的服务端组织范围。

RemoteControl按服务器分别维护加密设备凭证、事务日志、工作区与出站轮询。工作区自动匹配当前账户的组织清单，每组织独立生成workspaceId；个人范围只在无匹配时使用。服务端再次检查组织revision及来源/目标身份，提交仍由本机Service验证实际Git身份、目录和当前文件。现有AI、预览、Commit、Push、中止与备份恢复复用，命令hash包含组织范围。

instances模块为显式实例参数分别配置单实例锁及数据目录；默认位置保持，独立实例分别持有Git账号、Presence和事务记录，仅复用开发者GitHub应用配置。Tauri更新重启保留原参数。应用菜单可打开默认/secondary实例。

Presence组织独立维护，Web绑定需组织和Git仓库两重ownership；同仓库多组织不合并，客户端只展示服务端事实。公共个人Docker不含组织管理实现；客户端公开协议不依赖私有源码。官网分发、计费、邮件验证/找回、正式客户端包及真实双设备写操作分别验收。

## 本机授权监听错误与备用流程

IMPORT-11-windows-oauth-port：Rust 保留 socket bind 的 ErrorKind 和 raw_os_error，只将 AddrInUse 报为占用，将 PermissionDenied 报为系统拒绝。后台授权日志仅保留受控类别和数值系统错误码；不记录凭据、授权网址或验证码。GitHub 的这两类监听失败返回带 flow=device 的有限公开设备会话，设置页复用现有设备授权、轮询、取消与账号导入接口。原正常网页流程及其他 provider 不改变。设备授权无需本机端口或应用密钥，但须开发者在自有 GitHub App 开启；公开配置状态及真实 Windows 用户同意分别验收。

## 关联标签与读取健康分离（IMPORT-04-association-refresh）

branch-links.associationStatus区分保存的关联与筛选后可见工作目录，内部verified只表示本地目录和完整远端分支范围已经可靠核对。useAssociationStatus为Dashboard行保留同一服务实例、仓库、目录/分支映射和用户隐藏设置下的最后成功结果；路径/映射排序后比较，避免仅登记顺序不同清空显示。缓存仅在本地和远端读取均完成且核对有效时更新；自动隐藏和读取中间态不作为新的验证结果。解绑或身份/用户筛选变更立即排除旧缓存，提示保留当前失败和上次结果时效。linkedTasks的隐藏排除、统计和真实Git操作范围不变；不修改Catalog持久化、服务/HTTP契约或后台fetch。
## 图谱有限操作与AI合并（R-05-graph-actions/R-05-ai-sync，0.33.0源码）

新增graphSources、graphPreview、prepareGraphMerge、cancelGraphPreparation、discardGraphMerge、applyGraphMerge、executeGraph、createGraphWorktree、openCommit有限方法；Rust Service仍从当前Git账号、仓库和已验证关联解析目标，不接受调用者命令。写操作复用common-dir队列、前台更新屏障、结果幂等与任务级控制；标准命令保留实际钩子/签名和未完成Git状态。创建worktree后原子保存关联，保存失败保留已创建目录并报告，禁止伪成功或重复创建。

graph_operations使用目标HEAD与changeKey冻结本地状态，私有index保存当前工作内容，临时共享clone逐来源合并。远端分支在临时仓库fetch；浅仓库只在临时目录补齐历史。AI复用受限本机Codex执行器，常规文本仅返回diff3冲突片段替换，不改非冲突内容；修改/删除等无标记冲突采用完整文本约束。各次最多96KB冲突证据，二进制/LFS/链接/子模块及过大片段明确停止。模型无Shell/MCP/apps/plugins/hooks权限，仓库内容视为不可信数据。

预览最多32份且有效10分钟，绑定服务身份、映射、目标快照和来源HEAD；确认复核本地和所有来源，并刷新真实远端追踪引用。LFS在临时目录复用本地缓存、下载并校验后才准备文件发布；具体文件先准备到同卷私有目录，原文件逐项备份。提交失败回退原文件并保留原index；若钩子或外部编辑改变了发布文件，停止覆盖并保留备份路径。确认使用真实Git commit、私有index和MERGE_HEAD，父提交保留原HEAD与实际合入的来源；成功后发布index，不隐式Push。恢复引用使用应用命名空间，历史读取排除这些内部快照。准备取消绑定generationId，提前取消也登记，旧取消不能命中新请求。

RepositoryOperationProvider扩展图谱任务，按仓库、目标目录、动作和所选提交区分；收起/路由切换不卸载，另一目录仍可操作。来源选择按账号内仓库ID、目标路径/分支保存；目标或来源改变立即禁用旧预览，迟到响应不能覆盖手工说明。失败重读目标后重新准备。源码类型/编译与真实Git、Codex、跨平台及安装包验收分别记录。

## Presence设备名称（PRESENCE-05-device-name，0.30.11）

managed world版本3可带可选deviceName，来源为服务端已验证设备凭证对应的登记名称。Rust允许旧帧缺席/null，仅接受非空且不超过120字符的名称；PresencePerson在精确仓库/分支过滤及有效操作状态确认后聚合同身份的设备名。UI在人员名称后的括号中显示去重名称，旧帧显示设备未知；设备名纳入弹窗roster布局键，账号/头像/分支状态仍分别保存。

## Presence人员卡片与远程工作目录

PresenceBranch保留有效快照的serverId、userId/identityId、deviceId、organizationId及worktreeId来源。人员仍按身份/组织聚合；远程目标只能从ControlStatus授权devices/workspaces中选择，逐项匹配同一服务器、设备、用户、仓库、分支和组织。工作区新增可选worktreeId，Rust采用与Presence发布相同的路径SHA256；它不改变workspaceId、请求范围或权限判断。旧设备缺少字段时只允许唯一分支目标，多个可能目录不选。

RemoteWorkspaceActions由详情和人员卡片共用，沿用RemoteActionDialog和Provider的有限预览、AI说明、执行、重试Push及备份恢复。目标状态结合所属server连接判断，不把另一台在线服务器当作离线目标可执行。人员卡片关闭后确认弹窗仍独立挂载，任务的server/device/workspace/action冻结；服务端与目标继续核验实时权限和文件变化。协议字段、部署及用户双设备运行验收分别记录。

支持此字段的服务器在控制state返回`worktreeIdentity: true`；客户端只向已声明支持的服务器公布worktreeId，连接旧严格Schema服务器时仍使用原announce字段，避免新客户端使旧服务器拒绝登记。

仓库操作收起（0.31.0，IMPORT-14-operation-collapse）：App内RepositoryOperationProvider在路由外维护服务会话级操作记录，打开时复制目标快照，按入口范围及真实工作目录恢复。所有OperationDialog持续挂载；visible只控制公共Dialog的Portal、遮罩和焦点锁，不改变AI/同步准备的effect依赖、操作UUID、草稿或结果。Dashboard仓库/分支、仓库顶部、中栏Submit/选中提交Push复用宿主。隐藏完成留存原按钮，活动Commit/Submit/Push沿用成功关闭；异步完成不关闭其他任务。服务instanceId改变清理记录，显式取消才中断可取消的准备并清理预览。

客户端写忙碌按repositoryId/taskId隔离，并汇总仓库状态继续阻止目录变更和重复操作；具体物理路径的活动弹窗阻止重叠范围。同仓库其他worktree可继续准备/确认，Rust已有git-common-dir队列仍串行真实写入。PushFeedbackProvider按仓库保存多个批次，更新/定时器只作用于自身UUID，聚合任务状态时不会覆盖兄弟任务；恢复弹窗不创建新请求。
