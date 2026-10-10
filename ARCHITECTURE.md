# TypeScript 客户端架构

更新包来源（2026-10-10）：releaseBranch指定main，打包入口检查当前分支及生产输入已提交，构建前后复核提交、分支、工作树和输入摘要，build-info记录sourceBranch/sourceCommit/sourceSha256。GitHub Releases仍是MacUpdater的公共下载源；Git分支不作为更新频道。发布tag应指向该main源码提交，不通过源码push冒称已发布安装更新。

2026-10-10本地Git变化触发远端检查（0.17.0）：保留五分钟远端定时和五秒本地扫描。repository-reader为每个真实worktree生成可选changeKey：HEAD、原始porcelain状态、index的模式/对象ID/阶段，以及Git更改列表内文件的mode/size/mtimeNs/ctimeNs/inode共同生成稳定SHA-256。只读index枚举补足同状态再次暂存的检测，lstat不跟随软链接，不每轮读取大型LFS内容；脏文件元信息按64项并行批次读取，正常删除用missing标识，其他读取失败作为该task错误。useWorkspace按服务、关联映射和工作目录保存成功基线，比较实际branch及指纹；首次成功建立基线，逐任务失败保留该路径基线，整个读取失败不改基线，映射移除/服务重启清理。新变化递增该仓库触发版本，单次扫描内多个分支变化合并。关联仓库的useRemoteRepositories由useWorkspace持有，Dashboard与仓库页共享同一remoteStates；筛选、隐藏、收起和页面切换不重置网络节奏。未关联仓库仍由展开/打开页面按需读取，已保存SHA内容沿用服务缓存。useAutoRefresh比较触发版本，createAutoRefresh.trigger提前检查新变化但不绕过重试截止；在途变化合并为一次后续请求，取消的触发在恢复时保留，focus/online仍只恢复原定时或已有触发。远端部分task失败发布各自结果并进入同一重试期限，不把失败扩散成整仓库假计数。没有新增远端API、Git fetch写入、文件内容上传或持久化字段；实际reading继续驱动呼吸，最后成功结果继续驱动正数角标。

2026-10-10未关联分支下载（0.16.0）：Dashboard分支行按实际已关联任务决定显示七项Git操作或仅下载/隐藏。App提供BranchDownloadModal，复用本地目录选择器，输入新文件夹名称并显示目标位置；useWorkspace复用单仓库busy锁，有限downloadBranch协议只接受repositoryId、branch、parentPath、folderName并返回Catalog。服务依据自己的仓库/账号构造远端HTTPS URL，复用账号凭据；令牌仅进入子进程环境，临时credential helper限定同一origin，不存入Git参数、URL、配置或日志。新分支使用应用数据目录内按账号/仓库身份区分的共享bare对象库，精确fetch该分支depth=1，创建私有临时worktree，按实际filter属性处理当前版本LFS，然后创建/使用真实分支并通过git worktree move移至用户指定的新文件夹。已有目录、工作目录和不同本地提交不覆盖，其他检出不切换。下载、账号/关联身份和实际remote/branch验证完成后，经既有v2存储原子追加LocalWorktreeLink；保存失败保留完成目录并提示手动关联。失败只清理未发布的私有临时worktree；请求取消/超时先等待Git及同进程组子进程退出，再处理清理。后台检查继续只读，不复用下载为普通Fetch/Pull/Push/Get Latest/Reconcile/Clear执行。依据[Git worktree](https://git-scm.com/docs/git-worktree)、[Git credential helper](https://git-scm.com/docs/gitcredentials)、[Git LFS pull](https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-pull.adoc)契约实现；源码和运行验收分别记录。

Dashboard操作名称：`DashboardActionNames`只围绕整个仓库表建立一个事件边界，读取行尾控件的`data-action-name`，通过body portal展示单一名称；禁用Git的现有wrapper和可用Hide仍独立处理原点击。名称和鼠标/焦点坐标是短暂UI状态，无服务、存储或Git调用；窗口边缘按实际标签尺寸计算，键盘自动滚动保持按钮锚点，鼠标滚动关闭。不改变账号、本地目录、刷新或诊断日志协议。

2026-10-10检查节奏与稳定结果（0.13.1）：参考[GitHub Desktop BackgroundFetcher](https://github.com/desktop/desktop/blob/development/app/src/lib/stores/helpers/background-fetcher.ts)的完成后定时，以及[AppStore](https://github.com/desktop/desktop/blob/development/app/src/lib/stores/app-store.ts)的条件检查和独立在途状态。现有provider只读接口继续读取远端，未引入真实Git fetch写入；远端目录/HEAD每5分钟检查，本地仍每5秒只读。auto-refresh记录最近成功完成时间，focus/online只恢复尚未到期的原定时或启动过期检查，同时保留重试截止与单资源单请求。已有0.12.2工作区缓存及状态/数量分离继续使用。Dashboard从实际reading派生整排行尾动作的aria-busy与呼吸类，Git与Hide同相位；读取状态不直接成为数字。RepositoryActions只渲染大于0的数字和独立错误感叹号，取消、失败与待机不产生临时1或0。

2026-10-10读取状态与计数分离（0.12.2）：auto-refresh的onReading仅覆盖实际在途请求，取消/暂停清除等待状态，失败退避不持续显示忙碌。远端与本地hook沿用原资源身份保护，分别发布loading/error及最后可用workspace；preserveLocalWorkspace在相同映射内保留失败任务的文件、树和历史，按task id/path/branch核对，成功任务更新、删除任务或映射变化不复用。branch-links从已读取数据计算真实数量，独立status/statusDetail表达reading/error，读取失败不短路成count=1，未知仍未知；Commit只依赖本地，Fetch只依赖远端，逐任务错误限定分支。RepositoryActions独立渲染数字和状态，保持禁用执行。账号服务的15秒远端请求限时覆盖头/正文，外部取消仍透传；只将白名单连接/证书代码、超时、HTTP权限与限流转换为安全说明，不返回原始异常、凭据或provider正文。无新API、持久化结构、账号重放或Git写操作。

2026-10-10操作裁切与隐藏修正：Dashboard的显式repository-action-cell固定在表格可见右端，276px容纳七个Git入口和独立Hide/Restore；错误行的colSpan不套用固定列。其他列保持表内横滚与六项排序。RepositoryRowActions复用已有RepositoryActions并追加真实可用的隐藏按钮。useWorkspace沿用v2界面偏好存储，新增可选hiddenEntries字符串数组，旧记录缺省兼容；键为JSON编码的repositoryId和可选branch，不依赖服务instanceId。Dashboard过滤隐藏仓库及分支，显示已隐藏模式提供逐行恢复，分支全部隐藏时显示明确说明。隐藏仅影响列表，不改变Catalog、账号权限、目录关联、Git状态或文件。

2026-10-10行尾操作定义：`RepositoryActions`按Commit/Fetch/Pull/Push/Get Latest/Reconcile/Clear显示7个公共IconButton，移除Ignore专用图标。`branch-links.ts`的`GitSignals`扩展为7个固定键，已有HEAD ancestry与工作目录数用于Pull/Push，未提交文件数用于Commit；Get Latest的空间清理与Reconcile/Clear的文件内容比较没有读取契约时保持数量未知。操作列220px容纳7个28px按钮与6个4px间隔，日期列继续保留。本轮没有新增写API、Git进程或目录删除；保留已有按下反馈和禁用说明。真实操作执行另列未完成需求，后续实现需要先产生账号/仓库/当前分支绑定的影响清单，再处理浅拷贝、当前版本完整性、Git对象与LFS缓存回收、共享worktree和文件覆盖的边界。

`SettingsView` 使用flex纵向布局：标题和账号/外观/更新内容放在独立的settings-scroll滚动区域，版本footer是其后的不收缩兄弟区域，固定沿窗口底部右对齐，不覆盖表单。没有新增偏好、账号状态或IPC。侧栏公共收纳按钮与常驻导航图标框在styles.css共用状态反馈规则，保留原DOM和aria状态。

R-05-tree-identity-row仅调整RepositoryFileTree的应用自有标记与局部CSS：当前task.branch和task.head派生同一行名称/8位SHA，文本渐隐用带透明尾部留白的蒙版，短名称不被淡化，SHA不收缩。本地路径和worktree标签保留；没有新增状态、读取接口或树重建，历史选择不替换树基准。隔离QA可用--long-branch建立真实临时长分支，默认测试数据不变。

React 客户端由 App shell、AccountSidebar、统一仓库 Dashboard、独立 SettingsView、LocalRepositoryModal 和只读 RepositoryView 组成。设置仅显示账号与外观，不显示指南或材质说明；App 仍保留原生桥接就绪检查。`import-model.ts` 定义有限 API 方法与 DTO，`import-api.ts` 验证响应形状，`use-workspace.ts` 管理账号目录、异步操作和外观偏好。AccountSidebar 按 accountId 展示完整 Catalog 仓库，不用 LocalLink 过滤导航或数量；Dashboard 以仓库、归属方、账号、本地目录和 Git 操作五列展示统一列表，不再单列本地状态。实际分支位于可展开的仓库子行，保留独立目录与操作；支持原搜索与筛选。旧 `domain.ts` / `data.ts` 仅保留历史测试契约，运行入口不导入场景或模拟操作。

IMPORT-13-branches 的展开集合由 Dashboard 持有，以 Catalog instanceId + repository.id 区分会话与访问账号；目录心跳和筛选不清空其他展开。IMPORT-13-branches-folder把原文件夹底板直接复用为公共IconButton展开入口，保留aria-expanded/aria-controls；仓库名称的工作区导航处理器独立，不新增状态或箭头。每个可见仓库行复用 useRemoteRepository；0.10.0 在展开或已有本地关联且服务就绪时启用已有 remoteWorkspace。未关联仓库收起保留该行最后结果并取消读取，已关联仓库保留同步信号所需心跳；筛选隐藏/离开 Dashboard 卸载读取器。分支名称取真实远端任务与已关联本地任务的并集，不从 defaultBranch 合成；任务历史/树失败不掩盖已读名称，分支列表整体失败明确保留上次结果。默认标记只在实际名称匹配时显示，读取上限沿用原分支警告，计数仍只统计仓库。现有接口同时读取有限历史/树并缓存SHA，没有新增分支API或Git写入。

`ui.tsx` 的 MaterialProvider 使用 OpenGlass UI 的公共 classic/CSS 交互原语，保留按钮、字段、分段选择、菜单与弹窗的无障碍/焦点契约；`theme.ts` 与 `styles.css` 统一 Material 3 亮暗色、状态、形状与轻微卡片 elevation。Roboto 字体本地打包，中文系统回退，不访问外部字体服务器。App shell 只有共享画布，侧栏透明且无独立浮层，主要语义内容分组为卡片，浏览器/Electron 共用样式。侧栏宽度只由显式开关决定，收起保留56px图标列；导航、选择与草稿不卸载。旧 reducedGlass 偏好仍可读取以兼容保存结构，但不再呈现无作用的开关。仓库图标空心角标表示 Presence 未连接，不伪造在线数据。

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

`auto-refresh.ts` 是可注入时钟的单资源调度器，只有一个在途请求；请求结束后才安排下一次检查。`use-auto-refresh.ts` 根据稳定的资源 ID 保留计时器，监听 visibilitychange / focus / online / offline，隐藏或离线时取消/暂停；恢复后检查。重复激活合并，最短间隔 1 秒，失败指数退避至 5 分钟，激活不能绕过退避。每个账号/本地关联有独立调度器，删除一个资源不停止其他资源。

Workspace 每约 10 秒检查服务 instance/version 与 Catalog；每个账号正常约 60 秒调用已有只读仓库 refresh；每个关联仓库正常约 5 秒读取 localWorkspace 中的真实工作目录。远端目录沿用服务分页/错误保留/原子 revision；新会话旧响应、已解绑或换路径的迟到响应不能覆盖当前数据。服务失联保留缓存并显示错误，不重放 connect、token 或授权。版本不一致停止检查，保留原刷新页面交接。

本地工作区缓存位于 controller 的 localStates，以 instanceId、仓库、父目录及工作目录集合组成 mappingKey。Dashboard 用操作灯及提示表达读取错误，RepositoryView 复用同一工作区，不各自重复拉取；映射变化时不能沿用旧目录任务，失败仅保留相同映射的最后结果。内容比较复用未变对象，不清空搜索或已选文件。按R-05-local-preview-removal，文件选择只保留列表/树联动，不再读取或轮询所选文件内容；工作区状态与历史提交详情的自动检查继续沿用原缓存和错误边界。

R-05中已选文件退出更改列表时仍保留树选择；本地和远端均没有内嵌内容预览或预览专用占位。删除RepositoryChanges的Diff状态和调度，以及View/Column/隔离预览入口的readDiff回调链；隐藏任务继续保持挂载，草稿与选择不清空。有限后端Diff接口保留，不再由文件选择触发。

浏览器远端读取的 AbortSignal 通过 HTTP 连接关闭传递到服务端，再传递给提供方请求；监听 response close / request aborted，不把正常 POST 读完误判为取消。既有目录 refresh 不改变去重语义。原生 IPC 本身没有远端执行取消，renderer 的 signal/资源身份阻止卸载后的发布。`use-remote-repository.ts` 为打开且可访问的工作区，以及 Dashboard 中可见且展开的仓库建立正常约 60 秒的 HEAD 心跳，以服务 instanceId + 仓库身份定位缓存，保留最后成功结果与逐任务 UI 状态；停止旧资源、丢弃迟到结果，隐藏/离线和错误退避沿用共享调度器。这是前台轮询，不是 webhook 推送，不 fetch 或写入本地 refs，不表示零延迟或 API 限流时仍实时。

## 文件树打开边界（0.8.0）

`RepositoryFileTree` 的文件选择按钮和公共打开按钮为同层兄弟节点。浏览器远端在真实点击事件中使用 `repository-file-url.ts` 的同一纯派生器打开新网页，关闭opener、不带referrer；链接按已保存account.host和repository.fullName、当前树HEAD与逐段编码的字面路径构造，GitHub使用/blob/{sha}，Gitea使用/src/commit/{sha}，不信任任意repository.url。历史差异只影响状态叠加，不能改变链接基准。

有限 `openFile` 方法只接收repositoryId、source和commitId或taskId、path，返回{opened:true}，不接受调用者URL、绝对路径、命令或应用名。AccountService从已验证的关联定位Git目录，`repositoryTaskFile`枚举真实worktree并验证同一common-dir，使用literal pathspec核对tracked/untracked文件，再realpath拒绝越界符号链接、Git元数据、缺失与非文件路径；打开前复核账号/仓库/关联。浏览器本地由`system-file-open.ts`无shell调用macOS默认应用；Electron通过既有主frame有限import IPC，注入shell.openPath/openExternal。默认应用错误不是成功响应，凭据不进入地址或renderer。

## 账号服务与凭据边界

`server/account-service.ts` 是浏览器/Electron 共用的只读服务。GitHub 请求固定 `api.github.com/user` 与 `/user/repos`；Gitea 请求指定 HTTPS origin 的 `/api/v1/user` 与 `/user/repos`。来源参照 [GitHub 仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)、[Gitea 接口](https://docs.gitea.com/api/operations/user-current-list-repos/) 及 [Gitea ListMyRepos 实现](https://github.com/go-gitea/gitea/blob/main/routers/api/v1/user/repo.go)。GET 仓库接口包含账号/组织/协作范围，但仍受令牌权限限制；分页构造本机 URL，不向 Link 提供的第三方 URL 转发令牌，不跟随认证重定向。

账号 ID 独立于 host，仓库 ID 为 accountId + remoteId，因此同 host 多身份以及同一共享仓库不相互覆盖。身份重复检查 provider/host/login。状态变更串行、保存成功后才发布新状态，响应携带服务 instanceId 和递增 revision；新会话的 revision 0 可以取代旧会话，旧会话迟到响应不能覆盖已验证的新目录。添加账号前先检查 status 与版本，错误区分本地断连、超时、静态托管、服务错误与认证失败；不自动重复提交凭据。

0.4.0 的 `updateAccount` 共享 DTO 仅允许 accountId、name 与可选 token，通过原 HTTP/IPC 分发与 controller 的账号级操作锁保存。SettingsView 复用公共 Modal，AccountEditForm 按 account.id 初始化独立名称/令牌草稿；不随目录心跳重置输入，空名称、未修改和保存中禁用提交，失败保留草稿。原令牌从不返回或回填。改名不请求提供方；更换令牌只访问已保存的平台/域名，验证 login 相同后完整读取仓库，再原子持久化名称、凭据与目录。保留 account.id、仓库 ID、本地关联及其他账号，已关联但失去访问的仓库保留为 unavailable；清除旧凭据的错误与到期元信息。账号已移除或凭据已被其他编辑替换时拒绝迟到保存；旧令牌的在途 refresh 不覆盖新目录或状态。

`server/github-authorization.ts` 实现官方 GitHub 设备授权，仅在服务端持有 device_code 和 access_token；renderer 只得到随机会话 ID、公开验证码、固定验证网页、有效期与轮询间隔。最多 8 个并行等待会话，过期清理；服务端限频、slow_down 延长、单会话重复请求合并、完成结果幂等。网页拒绝/过期/无配置与网络失败分开表达，不回显第三方错误详情。取消在凭据保存前通过 AbortSignal 和提交门阻止导入；已进入原子保存的取消返回真实完成结果。React 等待循环可取消，Strict Mode effect 重放不取消真实服务会话；卸载停止等待并尽力取消服务会话。

采用 [GitHub App 官方设备流程](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app#using-the-device-flow-to-generate-a-user-access-token)，不申请传统 OAuth 的 repo 写 scope，不打包 client secret。权限和仓库范围由自有 GitHub App 配置与用户安装/授权共同决定。收到有效期时保存到账号元信息，过期需重新网页授权；未实现 refresh token 自动续期，不保存该 refresh token。同一身份重新授权更新凭据并保留 ID/本地关联，新身份另建账号。真实流程仍需自有 Client ID 与用户同意，测试 provider 不进入运行入口。

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

`scripts/package-desktop.ts` 在系统临时目录构建有限源码/锁文件快照，Vite使用相对资源路径并禁用开发env注入，esbuild编译main/preload。产物只有client（含本地字体）、desktop与package.json，不复制.env、日志、测试、用户数据或账号。版本统一读取macos/package.json.version；源码/ZIP摘要写入包外build-info.json，拒绝交付构建期间变化的源码。Electron Packager生成arm64应用，osx-sign以Developer ID逐项签名，保留hardened runtime和必要JIT权限，不降级ad-hoc。可通过本机notarytool钥匙串profile公证并staple；未配置时明确notarized=false。公共app-update.yml放在Resources；latest-mac.yml记录ZIP的SHA-512、大小和版本，不含账号数据。

### 桌面更新与数据保留

0.9.0起Settings单独提供应用更新组，只在打包macOS启用。main持有固定公共DDonlien/git-together GitHub provider的electron-updater，renderer只通过当前窗口/主frame/精确file页面验证的四个有限IPC读取状态、检查、下载、重启安装，不能传入URL、凭据或路径。下载验证SHA-512，安装由Squirrel.Mac验证与当前App相同的代码签名后替换应用；不禁用TLS/ATS，不允许降级、预发行、自动下载或普通退出时自动安装。进度来自原生事件，设置轮询只读本地IPC，不重复请求GitHub。import完成前不安装，安装阶段拒绝新import，避免中断账号原子保存。

bundle ID保持com.gittogether.standalone，名称保持GitTogether，userData固定appData/GitTogether-Standalone-Demo，继续使用accounts-v2.encrypted及preferences.v2；升级不重命名、删除或迁移此目录，不复制数据进包。safeStorage与SavedState v2保持原样，本地关联只是保存路径，不改仓库内容。浏览器会话不共享到桌面。旧ad-hoc版先手动替换为带更新能力的Developer ID版，此后使用同一签名身份；签名身份/存储位置变更需另行设计迁移，不能清空配置作为恢复。

0.10.1将检查、下载和安装失败分开处理。GitHubProvider可把缺失的正式latest包装为ERR_UPDATER_INVALID_RELEASE_FEED，因此只输出安全的发布信息不可用提示，不把所有解析错误断言为未发布，也不显示底层XML/网址/路径。控制器记住当前操作，以免原生error事件与Promise拒绝重复到达后失去失败阶段；只有安装阶段提示应用可写目录和签名。公开Release需在资产齐备后发布，源码tag与安装包快照对应；仅生成本地ZIP或推送源码不代表更新源已就绪。

## 本地关联与只读查看

账号设置中没有仓库路径字段。账号连接后，全部已读取的仓库直接出现在侧栏和 Dashboard；远端内容不依赖 localLink。Dashboard 的仓库/分支目录入口及本地文件树空态复用配置弹窗和可点击的目录选择字段。`local-directory.ts` 验证原生 IPC 返回的绝对目录，取消返回 null 并保留原目录；浏览器尚无原生选择桥接，不接受上传伪路径。选择不自动保存；0.10.0 的 link 可带 branch，保存时调用 local-discovery 按远端身份和真实检出分支匹配。解除关联可只针对一个分支，不移除远端仓库、不删除文件。

`LocalLink.path` 保留用户选择的仓库/父目录，新增可选 worktrees（branch + canonical path）；加密 SavedState v2 与稳定存储位置不变，旧单目录记录仍可读取。`local-discovery.ts` 最多遍历4000目录、8层、64个匹配工作目录，不进入符号链接、Git元数据及常见构建/依赖目录；遇到checkout不扫描它的内容，另核对真实worktree登记中位于选定范围内的目录。远端身份复用 `git-identity.ts`，不按目录名猜分支；候选再次核对其实际remote。取消、限制、错误或持久化失败不部分保存，串行提交前复核原关联未被其他操作替换。仓库三态要求已知完整分支范围和每分支健康目录；范围未知不标完全关联。可见的已关联仓库即使收起，也用原远端心跳读取HEAD和分支范围；未关联仓库仍仅展开时读取。

Dashboard 的 `matchAccountRepositories` 是单账号批量目录关联入口：renderer 只提交 `accountId` 和用户选择的父目录，账号服务从自己的 Catalog 取得该账号全部可访问仓库，目录扫描一次后按规范化远端身份返回命中的仓库 ID，并在一次持久化变更中更新这些关联。未匹配仓库保持原记录；多个账号筛选时客户端逐账号调用，搜索、组织、类型和可见性筛选不参与匹配范围。请求与响应继续通过有限 API DTO/IPC 校验，不向 renderer 传递账号令牌。

关联本地目录后，RepositoryView 使用真实 Git status、branch、最近 log、工作目录与暂存区 Diff；关联或解除时重建对应视图，避免残留的本地快照。有限 execFile 参数、不使用 shell、禁止外部 diff/textconv、关闭可选 index 锁；不提供任意命令/任意文件读取。Diff 仅接受当前更改列表中的路径；未跟踪文件不编造差异或读取内容。没有 Git 写动作与模拟成功。修改文件、克隆、LFS 写入、AI 和 Presence 连接需要后续独立合同。

外观与折叠偏好使用 `gittogether.preferences.v2`；不保存账号令牌、仓库私密数据或错误状态。旧 v1 演示存储保留但不读取为新工作区，也不自动覆盖/清除它。

## 仓库三栏与任务模型（R-05，部分接入）

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

`server/remote-repository-reader.ts` 只接收 provider、已验证的仓库标识和服务端 transport。0.5.0 的 AccountService 提供固定 API base、账号凭据、8MB 有界 JSON/文本响应和有限远端方法 `remoteWorkspace` / `remoteCommit` / `remoteFile`；renderer 只能传入仓库 ID、合法 SHA 与字面路径，不能传入 URL、host、token 或任意 blob。生产 App 调用专用 hook 并向 RepositoryView 传递远端状态与有限提交读取函数，未关联本地也自动加载。服务缓存最多 16 个读取器，凭据/仓库变更或移除后失效；每次请求前后及返回前复核身份，旧凭据结果不能重新发布。HTTP/IPC 共用 AccountService 的有限分发，客户端再验证无凭据 DTO；不新增任意网络或目录入口。

GitHub 使用 branches、commits、git/trees、git/blobs；Gitea 区分 branches 的 commit.id、提交列表、git/commits/{sha} 与原始 .diff，再读取树和 blob。参考 [GitHub Branches](https://docs.github.com/en/rest/branches/branches?apiVersion=2022-11-28)、[Commits](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28)、[Trees](https://docs.github.com/en/rest/git/trees?apiVersion=2022-11-28)，以及 [Gitea 单提交](https://docs.gitea.com/api/1.24/operations/repo-get-single-commit/)、[提交 Diff](https://docs.gitea.com/api/1.24/operations/repo-download-commit-diff-or-patch/)、[Tree](https://docs.gitea.com/api/operations/get-tree/)。不克隆、不 fetch，不读写用户 HEAD/index。

分支最多 1000 个，每个 head 最近 50 条提交，最多 4 个分支并发。树与 head 历史按不可变 SHA 缓存，各最多 64 份；真实父节点去重并拓扑排序，不用作者日期或相邻行捏造 ancestry。GitHub recursive 树截断时回退逐目录读取，Gitea 按 total_count/truncated/Link 本机分页；最多 20000 个树条目（Gitea 200 页、GitHub 400 个子树请求），到限明确提示不完整。GitHub 提交文件最多 3000 个，缺少 patch 时明确二进制/未提供差异，不伪造。逐分支失败保留成功部分；取消传播，失败和空仓库分开。

`remote-repository-model.ts` 定义独立、无凭据的响应验证。远端任务 path=null、files=[]、remote=true，树属于已提交对象，不是本地更改。`combineRepositoryWorkspaces` 同时保留 remote/local 任务身份，按真实提交父节点合并；本地解除不应擦除远端内容。文件读取只接受合法 SHA 与字面仓库路径，并先查该提交的树定位 blob；不跟随 submodule 或接受任意 blob。超过 500KB、含 NUL 或非 UTF-8 返回明确不可文本预览。

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
