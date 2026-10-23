# Presence账号与商业边界（2026-10-12）

- ID：`COLLAB-03-automatic-management`。
- 类型：`UI`。
- 状态：阻塞（沿用原需求记录）。
- 版本管理标识：`versioncontrolid`（含义待定义，不推断为 commit、branch 或 change）。
- 来源：`REQUIREMENTS.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`；标题路径：GitTogether 独立实现需求 / Presence账号与商业边界（2026-10-12）。
- 原稳定 ID：`COLLAB-03-automatic-management`, `COLLAB-03-settings`, `COLLAB-03-settings-spacing`, `COLLAB-03-settings-spacing-test`, `COLLAB-03-settings-spacing-release`, `COLLAB-03-identity`, `COLLAB-03-repository-ui`, `COLLAB-03-repository-icon`, `COLLAB-03-repository-icon-test`, `COLLAB-03-repository-icon-release`, `COLLAB-03-control`, `COLLAB-03-source`, `COLLAB-03-runtime`, `COLLAB-02-presence-account`, `COLLAB-02-source`, `COLLAB-02-password-length`, `COLLAB-02-commercial`, `COLLAB-02-organization-boundary`；不改写或重编号这些既有 ID。

## 当前需求与范围

- [ ] \[COLLAB-03-automatic-management] 按用户2026-10-12八点纠正，Presence为一个实例维护一个个人身份；接入GitTogether且当前Git账号可访问的仓库自动纳入个人管理，不提供个人仓库勾选列表。用户所属组织在Web端由组织owner配置，并对Git仓库验证ownership；完整仓库地址匹配且用户为成员时自动使用组织范围。一个仓库可以分别归入多个组织，各组织/服务器的状态及操作记录隔离，不限制或合并。
  - [ ] \[COLLAB-03-settings] Presence关闭后只保留最高级开关；开启后只有账号和可不断添加、选择/停用的服务器地址列表。客户端不提供修改密码、个人仓库选择、手工团队选择、访问密钥、项目清单或服务器会话长列表；改密码及组织管理在Web端处理。保留一个实例一个账号，同电脑可用不同实例登录其他账号。
    - [x] \[COLLAB-03-settings-spacing] 按2026-10-13两张设置截图，移除Presence标题前的图标，名称和说明保持同一行；账号、服务器及添加表单不再叠加纵向留白。参照M3列表与输入框规范统一行内对齐，服务器地址采用已有官方描边输入框，添加表单限制为可读宽度并保留窄屏适配、开关和账号/服务器操作。0.30.5源码采用56px单行、72px账号双行、520px添加表单和40px居中按钮；安装包发布单独跟踪。
      - [x] \[COLLAB-03-settings-spacing-test] 实际生产组件的隔离预览已检查1440/960/800px及540px宽度、亮暗色和长地址/离线状态，卡片和页面无横向溢出；输入启用添加、成功清空、处理中禁用、失败保留草稿、URL校验、回车添加、重新登录/取消及关闭后隐藏下级内容已观察。最终类型检查、Windows宿主Cargo locked检查及生产构建通过，保留既有分包提示；未向真实账号或服务器写入测试数据，未操作安装版。
      - [ ] \[COLLAB-03-settings-spacing-release] 按持续发布授权，将此次Presence设置修复纳入同源、同版本的macOS和Windows x86/x64正式更新并校验公开资产。当前Windows执行环境没有Mac签名工具、已配置的Mac连接入口或既有更新签名密钥，尚未生成或发布此次新安装包；此前0.30.4发布不含本次布局改动。 #blocked
  - [ ] \[COLLAB-03-identity] 用户已确认账号归属一个登录服务，其他服务器验证并信任其签发的同一身份。登录仅向归属服务提交密码，添加服务器使用目标限定的身份证明；不向新服务器转发归属服务的登录凭证，不用邮箱同名合并账号。账号/权限撤销、停用和服务器移除须停止对应连接及控制。
  - [ ] \[COLLAB-03-repository-ui] Dashboard增加可筛选的“托管组织”列，未涉及的仓库显示空白；Dashboard及详情页的文件夹图标提示托管组织。详情页提供托管组织、当前用户身份/组织角色及可见协作成员，不另建冗余仓库管理列表；数据来自实际服务端授权范围，不以GitHub组织或仓库owner推导。
    - [x] \[COLLAB-03-repository-icon] 按2026-10-13仓库截图，Presence自动管理范围内的仓库使用带人物的专用文件夹图标，个人账号和组织管理均可识别；侧栏、Dashboard和详情使用同一判断与图标。开关启用且存在Presence账号时，当前Git身份可访问的仓库属于自动管理范围；断线或没有在线成员不改变管理图标。保留头像、组织提示、读取/Push状态与原点击行为，文件树的普通目录图标保持原用途。0.30.6源码使用现有FolderSimpleUser图标及共享的范围/提示逻辑，新安装包未在本轮发布。
      - [x] \[COLLAB-03-repository-icon-test] 生产组件的隔离预览已核对个人、两个组织、离线、关闭、未登录和Git无权访问；侧栏两态、Dashboard及详情的SVG一致，Dashboard/侧栏19px、详情24px保持。实际展开main和仓库导航正常，头像、组织角标及普通目录图标可见，亮暗色一致。仅本任务源码的TypeScript、Windows宿主Cargo locked检查及生产构建通过，保留既有分包提示；未运行旧后台测试或操作安装版。
      - [ ] \[COLLAB-03-repository-icon-release] 将此图标修复纳入后续同源、同版本的macOS及Windows x86/x64正式更新，并校验完整公开资产。当前Windows执行环境仍没有Mac签名发布入口，本轮未生成或发布新安装包；此前0.30.4正式包不含此图标。 #blocked
  - [ ] \[COLLAB-03-control] 已关联本机工作区自动登记与同步；Commit、Submit和两种abort沿用有限操作、状态预览与恢复机制。组织角色严格高于目标且属于相同纳管组织时才允许跨用户操作，同账号设备自动可见；服务器、组织、设备、工作区及预览范围共同绑定，不能跨范围重用。
  - [x] \[COLLAB-03-source] 0.30.0源码cbc454a0a1已推送main；仅本任务37文件的合成树通过TypeScript、macOS宿主Cargo --locked及生产构建。GitPresence0.6.0精确源码0d9c35d已部署NAS healthy，账号/组织页及身份公钥200，匿名组织数据401；真实账号/跨服务器/双设备写行为及正式三平台包仍由下一项单独验收。
  - [ ] \[COLLAB-03-runtime] 待用户在实际账号、两个设备及多服务器/多组织中验收；本轮不代用户授权或执行Git写操作。类型与构建证据单独记录，安装版和正式三平台发布另行交付。

- [ ] \[COLLAB-02-presence-account] 按用户“补上”要求提供Presence独立账号注册/登录，账号管理、退出和重新登录；个人仓库及设备自动登记，密码修改仅在Web（COLLAB-03取代旧手工绑定/改密码入口）；原生端加密会话且不回传凭证。个人Docker只有一个账号，不提供组织空间；托管组织仅控制明确纳管项目。邮箱/密码首轮已接源码，GitHub/Gitea平台网页登录与跨平台身份绑定仍另行跟踪COLLAB-01-platform-login。真实用户注册和双设备Git写操作，以及正式客户端三平台发布分别验收，本项不以编译替代用户验收。
  - [x] \[COLLAB-02-source] 0.28.0账号设置及Rust有限命令已随66ace84推送main；当前工作区与隔离任务源码的TypeScript、Cargo --locked及生产构建通过。GitPresence 0.5.0已实际部署NAS，账号页面与注册开放状态HTTP200、容器healthy；个人镜像已构建且不含组织模块和源码映射。没有代用户注册或运行测试，真实双设备Git操作、正式客户端三平台包、官网镜像下载及收费服务仍待交付。
  - [x] \[COLLAB-02-password-length] 按用户2026-10-12要求，Presence注册和修改密码均接受至少8个字符，不强制字符组合；应用设置字段的提示和最短长度与网页、服务端一致。0.28.2为客户端源码修订，不在本轮发布安装包或操作已安装应用；线上网页以实际部署回读为准。 已通过仅本任务源码的TypeScript检查和生产构建；安装包另行交付。
- [ ] \[COLLAB-02-commercial] 用户商业方向：GitTogether开源，GitPresence源码private，官网分发单账号个人Docker，NAS单独托管付费组织服务。账号代表用户，组织用独立ID、成员关系、项目纳管和命令范围隔离；客户端不以可修改的UI标志作为授权。GitPresence当前已private、GitTogether为public，但GitTogether尚未选择和加入开源许可证；官网Docker下载、Web组织管理源码本轮完成，组织计费和正式收费服务尚未上线。
  - [ ] \[COLLAB-02-organization-boundary] 自有Presence组织独立维护，不与GitHub/Gitea组织一一对应，不因Git平台存在组织、用户属于该组织或具有管理员权限而自动创建Presence组织、加入成员或授予控制权。管理员明确选择纳管项目，可涵盖不同平台及不同外部组织的仓库；未纳管仓库仍可按个人账号使用。未来GitHub/Gitea账号绑定只关联身份及仓库访问，不自动继承组织角色。COLLAB-03已补Web管理及双ownership校验，真实跨组织权限验收仍待完成。

## 检查与验收边界

以上勾选与结果沿用迁移前的当前需求文档；历史记录中的实现、测试、编译、视觉与用户验收彼此独立。本次只迁移文档并检查结构 / 引用，没有重新执行产品构建或用户验收，也没有凭历史日志新增完成勾选。

## Comments

### 2026-10-23 17:44:33 UTC — Agent（文档迁移）

按原有功能 / 工作目标标题拆分需求，保留原 ID、勾选、依赖、最新补充及来源。没有稳定根 ID或旧 ID 在不同上下文重用时，采用由来源路径和标题确定的迁移 Issue ID，原 ID 仍在正文保留。完整旧内容可从来源版本读取；独有未提交内容的版本化副本见迁移映射。

### 20261014-144636-utcp8-taobe-gpt-6-presence-device-rows.md — 历史证据迁移

来源：`agent-log/system/20261014-144636-utcp8-taobe-gpt-6-presence-device-rows.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 行动和结果

原presencePeople仅按服务器/组织/身份聚合，把多设备名称放入deviceNames数组。改为以服务器、组织范围、账号身份及deviceId组成稳定元组键；单条记录只持有一个deviceName。设备名称相同、未知或一个账号多设备时均按实际deviceId区分；同一设备多个会话/分支/工作目录仍在该记录内聚合。状态优先级仅在该设备内部计算，各分支sources仅含该设备，既有presenceRemoteTargets因此只匹配对应远程设备。仓库及分支所有入口复用同一模型，头像堆叠和标题同步按设备记录显示。

标题与可访问名称改为“台设备”，保留姓名(设备名)、个人/组织信息、原字号布局及状态图例。更新PRESENCE-05-avatars/PRESENCE-05-device-name、README协作段落和DESIGN设备名称章节；没有新增API、修改服务器协议或部署GitPresence。

按修复递增patch至0.33.1，同步唯一权威macos/package.json及npm锁/Cargo版本镜像。完成类型检查后为保持页面/API版本一致更新本项目已确认的独立后台预览进程；停止前核对父进程cwd、进程组和原Rust实例ID。重启前后浏览器Git账号、仓库及关联均为0，没有取消用户授权或重放凭据。

#### 验证和边界

- npm run check通过，git diff --check通过；未添加、修改或运行测试套件。
- 正常npm run dev启动完成，Rust debug服务编译成功并沿原签名入口执行；独立进程父PID为1，保留运行。
- 127.0.0.1:4173页面HTTP 200；账号API为0.33.1/backend rust，实例c1b2e7ae-7161-43c3-ad1c-05d0c54b2674；授权配置configured=true、版本一致。新PresenceAvatars及presence-model源码模块HTTP 200，已包含单设备名称字段。
- Presence接口connected，但本地预览没有Presence账号及会话；没有以此声称截图中真实双设备弹窗已在运行界面验收。当前源码/开发预览完成，不是已安装应用或正式安装包更新。
- 本次源文件基线：/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/presence-device-rows-eczprn60；运行日志：/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/gittogether-preview-mnxacq90/dev.log。

### 20261012-184708-utcp8-taobe-gpt-6-presence-management-model.md — 历史证据迁移

来源：`agent-log/system/20261012-184708-utcp8-taobe-gpt-6-presence-management-model.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 完成记录

- GitTogether源码提交：cbc454a0a1d4b99d76693ee81bf147396b022ee7，版本0.30.0，已推送main。实际任务树3a33afbcdbbfe65be9b7acb2219c631d2fd4f732，在后来main d482887edb之上合成；TypeScript、macOS宿主Cargo --locked和生产构建通过，未执行测试。
- GitPresence源码提交：0d9c35d24be141cd6fd1758c1e38f52c67ca08a5，版本0.6.0，已推送main。类型/生产构建、两个网页脚本语法检查通过。
- NAS从该服务源提交git archive构建，归档SHA256 efceb80434c9235e50fe4c4453e4cce1e57ea8bf8391341d4ffd4203c1b6b282。hosted镜像 sha256:b6864b33013b21498c00865af0b3b6223ee896002961c4c92af09370ea698ff2；personal镜像 sha256:79b7646b643575c5601cc3ca68fc2522a1584ecaf13e1006928b6eb821117459。
- Compose实际更新后healthy，用户1001:1001、只读根文件系统；现有数据卷/config保留。生成的身份私钥权限600、所有者1001:1001，未读取或输出内容。deployment-info.json已保留既有字段并更新源提交/镜像/归档来源。
- HTTPS回读：health 200，protocolVersion2/managedProtocolVersion3/controlProtocolVersion2/accountProtocolVersion1/identityProtocolVersion1；保留旧握手兼容。匿名account/status 200、automaticManagement=true，account=null；manage/status匿名401。account、account.js、manage、manage.js、identity/keys全部200；页面CSP/self和no-store实际回读。配置没有添加新的trustedIssuer，当前NAS继续作为已配置的账号归属服务；其他服务器需由其安装者明确配置信任后接入。
- 个人镜像以network none检查实际文件：组织/管理/所有权模块为空，无Bridge或server源映射。正常证书验证的相邻Gitea和Ink均200。
- React源码复核：保留稳定身份和作用域key，状态读取失败撤去在线有效性；筛选/托管信息来自服务端，调节UI不执行Git；密码字段不会回传或写诊断，后台状态不生成虚假成功。
- 边界：没有注册或改动真实用户账号，没有进行实际Git平台授权、跨服务器登录或双设备Git写/丢弃验收；没有发布0.30.0三平台安装包或操作用户安装版，也没有发布官网个人Docker分发/计费服务。上述源码/公开页面/容器证据不能替代这些验收。

### 20261013-194528-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261013-194528-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 上下文与判断

- 已读根目录及 macos/AGENTS.md、REQUIREMENTS.md 的 Presence 设置契约、DESIGN.md 的 Presence 章节、README.md、ARCHITECTURE.md 对应边界及上一条本对话日志之后的两条任务日志。
- 远端 agent-template 通用规则版本 v1.9.1-260916-010202 与本地一致，没有需要同步的通用改动。
- 当前 0.30.4 已包含其他任务的正式发布记录；此次不能沿用旧版本候选或签名状态作为新改动的发布证据。
- 账号外层 16px 上下 padding 与内部 setting-row 14px 上下 padding 叠加；服务器 section、标题及添加表单又分别引入 18/8/16px 间距。标题嵌套 span 导致说明显示为下一行，添加表单无限拉伸。
- M3 官方列表 token：单行 56px、双行 72px、左右 16px；参照 https://raw.githubusercontent.com/material-components/material-web/main/tokens/versions/v0_192/_md-comp-list.scss。官方描边字段与浮动标签：https://material-web.dev/components/text-field/。本次使用已有组件，不增加组件库或改变账号、服务器协议。
- 成功标准：标题无图标、名称/说明同一行；只保留一处行 padding；账号、服务器及添加区布局连贯，输入框与按钮同排居中且宽度有界；宽窄屏无裁切；生产组件的有限受控交互及类型/构建通过。源码、浏览器检查、安装包/发布分别报告。

#### 行动与验证

- 已将两次用户反馈先登记为需求，再修改实现。后续验证结果逐项补充。
- 已移除标题图标并把名称/说明作为同排兄弟节点，取消账号和服务器区的叠加留白，单行/账号双行分别使用56/72px，添加表单最大520px、官方描边字段与40px按钮同排居中。沿用原账号及服务器控制器。
- 版本由0.30.4递增patch至0.30.5：此为既有设置页样式修复。package.json为权威来源，npm锁文件与Rust包版本镜像同步。
- 19:28类型检查及生产构建实际通过；既有500kB分包警告保留。19:31 Windows宿主 cargo check --locked 实际通过，无编译警告。没有运行旧 Node/Electron 后台测试。
- 已在4314启动独立前端验证入口，使用生产 PresenceProvider/PresenceSettings/PresenceAccountSettings，只把有限 Presence API 替换为内存受控数据，不接入真实账号/服务器。1440px宽屏实际测得标题行56px、账号行72px、服务器行56px、账号外层padding为0、添加表单520px、字段56px/按钮40px且垂直中心相同；卡片scrollWidth与clientWidth一致。
- 800px暗色及540px亮色实际截图确认标题单行、地址与按钮同排，无横向溢出。长服务器地址正常换行，离线文字和移除仍可见。实际输入启用添加、点击成功新增并清空、处理中禁用、失败保留完整地址和错误、重新登录展开及取消均已观察。
- 原生AX工具的Return曾产生额外字符，未当成产品证据；改用标准键盘Enter后，在全新正常场景仍确认官方shadow-DOM字段不能自动触发外层表单的隐式提交。只在本表单补齐Enter → requestSubmit，并排除输入法组合过程，仍由浏览器执行required/url校验，后续验证结果另记。
- 补齐后标准Enter实际新增 https://keyboard.example.com/presence/ 并清空字段；输入法组合排除为源码条件，本轮没有冒称真实IME验收。URL无效时字段显示「请输入网址。」且不添加服务器。关闭开关完成后账号/服务器隐藏，卡片82px；未登录的原账号表单在540px预览为498px，卡片无横向溢出。
- 最终TypeScript与生产构建实际再次通过，既有500kB提示仍为警告；Rust源码未在已通过的locked检查后变化。最终差异检查通过，所有生产修改限定在Presence设置组件/三份局部样式及四份版本清单。
- 已保存960×480暗色与540×560亮色长地址截图，路径为 macos/artifacts/presence-settings-review/presence-settings-fixed-dark.png 和 presence-settings-fixed-narrow.png。此目录被Git忽略，只承载隔离验证。测试标签已关闭，浏览器尺寸已恢复。
- 提交/推送沿用根AGENTS.md「自动发布与验收范围」的持续授权。当前Windows安全预检只核对可用性：xcrun不可用、用户SSH配置入口不存在、既有外置更新密钥路径不存在；不读取或索取秘密，未判断其他Mac的凭据被删除。此次正式三平台发布仍待Mac环境，不能以0.30.4旧包或浏览器预览代替。
- 已按本任务10个文件独立提交并推送源码628c51ca58；随后发现另一任务的未跟踪日志matching-diagnostics-in-progress.md，未阅读、暂存或改动该文件。
- 4314隔离预览已按PID107816和完整启动参数确认归属后停止，没有操作主预览、账号服务或用户安装版。

#### 交付记录

- README：本次布局不需要增加首页内容。
- DESIGN：已更新 Presence 自动管理章节的组件布局约定，区分官方列表尺寸与项目选择的分组标题/表单宽度。
- 实际账号、真实服务器、用户安装版：未操作。
- 源码版本0.30.5已提交、推送并完成上述验证；此次没有生成、签名、公证或发布新安装包。先前0.30.4正式包不包含此次布局修复，发布需求保留未完成。

### 20261013-204956-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261013-204956-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 已读上下文与判断

- 已读根/macOS AGENTS、REQUIREMENTS中的COLLAB-03、DESIGN与ARCHITECTURE的Presence自动管理契约、README及最新本对话日志。另一任务matching-diagnostics-in-progress.md未跟踪且最后修改早于本对话上一日志，保留不变。
- 模板远端通用版本v1.9.1-260916-010202与本地一致，不需要同步规则。
- 现有PresenceManagedMark仅提示组织管理，个人范围仍是普通文件夹。RepositoryLogo负责侧栏，Dashboard的仓库按钮和RepositoryView的标题各自使用普通文件夹。
- Rust prepare_server/catalogue_loop实际对全部available=true的Git仓库自动登记；不能使用旧账号repositories列表或是否存在在线工作区来判断当前自动管理范围。此图标表达启用Presence身份后的自动管理范围，不代替服务端登记成功或在线状态。
- 使用已有Phosphor FolderSimpleUserIcon，不增加图库。三处复用同一轻量图标/提示hook，以避免个人、组织和离线状态在不同位置判断不一致；保留现有组织角标、头像和状态标记。
- 成功标准：受管理仓库的主文件夹图标明确不同，三处一致；关闭、未登录和Git无权访问时保持普通文件夹；离线/无成员仍可识别管理。原尺寸、布局、展开/导航、状态与其他目录图标不变；生产组件预览及类型/Cargo/构建分别验证。

#### 行动与验证

- 先登记需求，再修改实现。当前工作区只有另一任务的未跟踪日志，已告知并保留；后续只提交本次修改。
- 本任务期间又出现IMPORT-14-last-divider的独立样式/文档/版本改动和日志。已经告知用户保留其内容，不提交该任务CSS、需求、设计或日志；该任务先把产品统一版本从0.30.5递增patch为0.30.6，四份版本清单只有版本差异。本次图标修复沿用当前0.30.6单一版本，不重写或撤回其清单。
- 三处复用usePresenceRepositoryIcon，注册现有图库的FolderSimpleUserIcon；个人/多组织管理的tooltip和可访问说明已接入。没有修改身份、组织权限、连接、头像、读取、Push或Git动作。
- 按vercel:react-best-practices检查共享组件：hook在组件顶部无条件调用，图标和说明直接由现有context与repository.available派生，没有effect/额外状态/请求；图标采用静态单文件导入，原控制器和无障碍展开/导航保持。
- 4316隔离数据预览实际使用生产Dashboard、AccountSidebar、SidebarHeader、RepositoryView及PresenceProvider；有限mock只允许状态和工作区只读请求，未知写命令明确失败。曾补齐fixture缺少的busy字段，未当作生产问题。
- 真实浏览器检查：个人及两组织均为新图标，Git不可访问仍为普通图标；离线保持，关闭/未登录全部恢复普通图标。Dashboard与侧栏的SVG路径一致，侧栏两态一致；实际展开main、导航ball-maze详情成功，详情24px图形与Dashboard一致，Dashboard/侧栏均19px；亮暗色一致。组织角标和编辑头像仍可见，详情文件树的普通目录图标保留。
- 保存完整Dashboard、带仓库名称的局部截图和icon-validation.json到macos/artifacts/managed-folder-review。该目录被忽略，不进入Git。
- 从431fae6db9导出基准，再只覆盖本任务五份TSX和四份0.30.6版本清单，建立source隔离验证目录，未纳入并行CSS/文档/日志或创建Git分支/worktree。此精确来源的TypeScript和生产构建已通过；保留既有500kB提示，Rust locked检查结果待补充。
- 此精确来源的Windows宿主cargo check --locked实际通过（31.35秒），无编译警告。组织角色/断线提示格式被主图标与既有角标实际复用，因此提取一处格式函数，避免新代码与旧角标各自维护相同文案；最终类型/构建随后复核。
- 最终隔离来源的TypeScript及生产构建再次通过；随后生产预览重新加载，SVG形状与管理说明和之前证据完全一致。没有再次运行未变化的Rust检查或旧测试套件。
- 发布源拟仅含本任务五份TSX、产品当前统一版本的四份镜像以及本任务需求/设计片段；将文档从HEAD基准合成后单独更新索引，避免提交并行任务的文档或CSS。工作文件及其他任务日志保留。
- 最终索引仅含上述11个文件；九份生产/版本文件的Git对象摘要逐一与实际验证的source目录相同。需求与设计索引仅为本任务3条需求和1段设计，没有纳入其他任务内容。差异检查通过后提交b977af3c79并普通推送main。
- 收尾仍保留另两任务的DESIGN、REQUIREMENTS、styles.css工作差异及20261013-195836、20261013-202143日志，未暂存、撤回或覆盖。匹配诊断的临时日志已经由其所属任务自行改名。
- 已恢复浏览器尺寸并关闭本任务标签；4316预览按完整命令确认归属后停止，没有停止其他端口、实际账号服务或安装版。

#### 文档与交付

- DESIGN：已更新Presence自动管理的主图标、范围判断与独立状态提示约定。
- README：图标细节不增加首页内容。
- 架构/协议：沿用现有自动管理契约和数据，不新增API或字段。
- 实际账号/服务器、用户安装版：未操作。正式新包仍受此前Mac发布入口限制，源码与发布分别记录。
- 0.30.6图标源码已验证、提交及推送；没有生成、签名、公证或发布新的三平台安装包。完整图及局部图分别为macos/artifacts/managed-folder-review/managed-folder-dashboard.png和managed-folder-icons.png，原始检查数据为icon-validation.json。

### 20261019-143029-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261019-143029-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

# Presence 本地工作区提示降级

- 用户原始 prompt：指出 Presence 设置页纵向 padding 不合适，并询问“部分工作区不可读”是否指仓库未匹配到本地文件夹，以及该提示是否应为 M3 warning 而非 error。
- 当前工作区：`github-desktop-based`，HEAD `a270e6d49a066c13c7ada6d9948bb1b87ab22ed1`。保留已有未提交更改；只修改 Presence 设置组件与样式。
- 将 Presence `localError` 从 error notice 改为 warning notice，使用应用现有的浅色/深色 `--warning` 琥珀色，并以 `status` 而非 `alert` 呈现。M3 标准角色未单列 warning；error 用于表达紧急错误。提示仍保留原文。
- 收紧账户详情行最小高度（72px→56px）和该提示的纵向留白（10px→6px，顶部间距14px→8px）。其他错误提示维持原样。
- 源码路径显示，未关联本地工作目录、工作目录失效或读取失败都可能导致此类本地工作区提示；它本身不是 Presence 服务器连接错误。
- 未运行测试、构建或界面预览；没有提交、推送、打包或更新已安装应用。

### 20261012-100840-utcp8-taobe-gpt-6-presence-avatars-client.md — 历史证据迁移

来源：`agent-log/system/20261012-100840-utcp8-taobe-gpt-6-presence-avatars-client.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 实际结果

- GitPresence类型检查已通过；此前检查遇到同期新增的control输出字段，后由该任务补齐默认false，不改变头像令牌权限。GitTogether类型/Cargo核验进行中。

#### 用户完整原文

仓库的文件夹图标左上角需要一个圆形的头像框，具体设计与交互要求如下：

1. 尺寸与样式：
尺寸应稍微大于我们现在的角标，但也不要太大。

2. 堆叠规则：
允许多层堆叠，最多三层。也就是说，当超过 3 个人时，也只显示 3 个人的头像框。

3. 交互与展示逻辑：
(a) 整体展示：点击后会展开一个简单的 pop-up，显示所有正在操作这个仓库的人员清单，以及他们对应的操作分支。
(b) 分支展示：如果展开了仓库文件夹，会在每一个具体分支角标的左上角也显示对应的信息。点击展开时，单独展示该分支上的操作人员。

4. 状态显示：
角标文件头像框的圆环有3种状态
实心：代表这个人已经Commit 了一些内容，但还没有提交到远端
闪烁：代表这个人的操作正在 editing，是由 presence 服务器识别到的。
虚线：代表这个人本地有一些未 commit 的 change。
如果有些人已经有东西提交到远端了，那就认为他并没有在修改这些东西，而是远端比你更新，我们就不用左上角的头像角标来处理了
同一个账号的不同仓库，用头像角标的边框颜色做出差异，但头像应该是一致的，通过我们的presence账号同步

#### 最终交付与实际证据

- 功能源码：GitTogether 6fa089a105（0.24.0）及0ee8b0022a已提交/推送；GitPresence f2cde7c（0.3.0）、232a7a9编辑器重连活动复位及2425f5a多观察者连接均已提交/推送。保留了同期Windows、状态表头/排序、图标及远控未完成改动，未将其纳入本轮提交。版本为新增兼容能力而递增minor；本轮修正仍属同一次未发布能力交付，不另开版本。
- scoped快照核验：GitPresence类型/构建、GitTogether类型/Cargo --locked/277模块生产构建通过。保留既有大分块建议。未新增或运行项目测试；原有state/network fixture仅同步必需字段和消息版本，不能称为测试通过。隔离快照没有纳入未提交的远控实现。
- NAS最终从2425f5a精确归档构建，healthy与正常TLS health返回远端协议2；镜像sha256:07fb1d05afd927ad604c78e0a5a7a7b60ccd455bf1a6fe769ebd2a26bdb19f89，源归档SHA256 1746e81d8c6f935cfd3a9f553c1da9ad8d6af7eb11c2d3f682a1fd26ad20e6df，deployment-info.json已记录。原源目录与配置作可恢复备份；服务器仍非root、只读、限loopback和原HTTPS路径，未增加仓库grant或control权限。仅将原taobe账号两份grant的公开头像统一为已由GitHub API读回的头像URL。
- 独立Bridge升级并启动，真实上报GitTogether/GitPresence两个工作区；Rust观察者与loopback读回均connected，账号Taobe头像及main、真实changed和unpublishedCommits已读回。观察时两个项目未推送计数均0，与直接只读Git计数相同；变化数量属于瞬时事实。未在本轮启用UE/Godot编辑器来源，不把样式示例当成真实编辑器editing或多用户上报。
- 协议1/2实际并发读回：两个observer使用与Bridge相同的设备标识仍能同时保持OPEN，Bridge的两项目仍可见，v1没有avatarUrl/unpublishedCommits新字段。观察者不再替换发布会话；Publisher同设备替换仍保留。证据在GitTogether ignored macos/artifacts/presence-avatars/concurrent-observers.json与live-profile-proof.json。
- 浏览器最终核对：真实头像18px且坐标在文件夹左上，两个仓库环颜色不同而头像一致；四人独立样式示例露出3头像、弹窗4人；feature/ui弹窗仅Alex/Bella并且仅列本分支。指针为pointer，关闭回焦点、Enter重开、Escape关闭正常。real-popup.png、stack-popup.png、branch-popup.png为对应实际页面；虚构人员只存在ignored设计预览，未发布到NAS。预览4193/Rust4196使用任务独立数据目录，跳过授权助手启动，未操作安装版或清空主预览账号。
- 修复预览发现的CSS覆盖：官方Disclosure默认relative会盖过低优先级的绝对定位，增强Avatar专属选择器；初版独立预览漏基础CSS造成弹窗静态/页面滚动，按正式入口补齐后重新核对。弹窗名册变动重新计算共享定位，关闭显式回焦点。另补协作端未Push新分支的只读可见行，标为仅协作端；下载仍须真实远端分支，本机Git动作仍只依赖本机关联目标。
- 本轮未打包、公证或发布桌面更新，不能称为用户安装版已更新；三平台发布仍按Windows/macOS既有流程和PRESENCE-04-release独立跟踪，不操作已安装GitTogether、不请求解锁。保存已运行的Bridge和预览，不注册新的系统启动任务。收尾仅提交本轮需求/使用说明/日志，推送与远端回读完成后结束。

- 收尾提交211c12b曾误包含README/ARCHITECTURE中同期平台扩展和性能文档；发现后用追加修正提交恢复这些文件的原暂存基线，仅保留权威版本同步，不改写已推送历史。全部工作文件原内容保留，相关并行文本重新处于未暂存状态；已向用户说明。其源代码不在本轮提交中。

### 20261012-133742-utcp8-taobe-gpt-6-presence-password-length.md — 历史证据迁移

来源：`agent-log/system/20261012-133742-utcp8-taobe-gpt-6-presence-password-length.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 客户端交付

- 结束登记：2026-10-12T13:37:42.308645+08:00。注册和新密码字段均改为至少8字符；登录仍只要求非空，128上限保留。
- package.json 0.28.1→0.28.2，向后兼容的输入规则修正，递增patch；同步npm及Cargo版本元信息。无Rust业务代码变更，不运行额外Cargo检查。
- 仅任务源码的隔离快照通过TypeScript检查及285模块生产构建；构建有既有500kB提示，未运行测试、打包或用户账号写操作。
- 检查基线3ad94fd；并行main新增cb60387只修改windows-release工具和其日志，不与本轮组件/版本/文档相交，提交基于当前main。
- 源码和文档按持续授权提交并推送main。Presence服务端0.5.1源码7a755f8已推送，NAS部署由本任务继续；客户端新安装包不在本轮交付。README/DESIGN没有变化。

### 20261012-112554-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261012-112554-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 实现与验证

- 唯一产品样式改动为presence-avatar-trigger的padding从3px 0改为3px 6px；宽度自然随完整stack增长，原圆角、颜色、头像尺寸、重叠、状态与弹窗保持。
- 浏览器测得单头像30×24、双头像37×24、三头像44×24；全部头像边界都位于背景内侧6px。用真实鼠标悬停观察到主题背景色rgb(233,231,239)，三头像hover时无键盘焦点光圈。仓库完整四人清单仍可打开并用Escape关闭。
- 截图保存于macos/artifacts/presence-avatars/hover-capsule.png，隔离预览4193保持运行；演示人员只存在于本地预览，没有向服务器发布。
- 样式修复按patch递增0.27.1到0.27.2；package.json为权威，lock和Cargo镜像同步。
- 从a3fc3a17a1已提交源码只覆盖本轮CSS/版本的隔离目录，TypeScript检查和生产构建实际通过。构建保留既有大资源提示；git diff --check通过。未新增或运行项目测试，没有安装包发布，也没有操作用户已安装应用。
- REQUIREMENTS记录PRESENCE-05-avatar-hover，DESIGN的Presence段落补充胶囊边距。共享index曾出现Windows任务暂存内容；在本轮完成记录期间，该任务提交891e6d55d6并清空其暂存区。本轮按当前HEAD局部投影暂存，保留其他对话的工作文件，不纳入本轮提交。

### 20261012-011611-utcp8-taobe-gpt-6-presence-integration.md — 历史证据迁移

来源：`agent-log/system/20261012-011611-utcp8-taobe-gpt-6-presence-integration.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

# Presence 插件与首个 NAS 服务器

- 用户原始 prompt：「把 presence 作为一个插件放到我们的设置选单里面，开始尝试把 presence 系统接入到 git together 第一个 presence 服务器，并在我们的 NAS 上创建一个 Docker 去部署」
- 模型：gpt-6（当前环境可获得的最具体标识）；执行者：taobe。
- 开始：2026-10-12 00:31:54 UTC+8；接入与部署核验结束：2026-10-12 01:16:11 UTC+8；起始 main/329cbe2eaf，fetch 后 0/0；实现提交：d84730f4df6f1d186515c1d63966db814e98edbb，已推送 origin/main。桌面正式交付仍未完成，见收尾记录。
- 已读：根/macOS AGENTS、当前 README/REQUIREMENTS/DESIGN/ARCHITECTURE、更新至 0.22.10 的交付与原生验证日志、GitPresence 的协议/Bridge/服务器/部署说明。通用模板仍 v1.9.1-260916-010202。
- 需求：PRESENCE-01-plugin、PRESENCE-02-state、PRESENCE-03-nas、PRESENCE-04-release；用户此次明确授权 NAS Docker 部署与 GitTogether 接入。沿用自动交付、复用公证和不操作用户安装版的持续授权。
- 其他对话正在修改提交范围/推送反馈、Rust Git 服务和图标设计；保留其改动，仅提交本轮内容。按照开发约束，不新增或运行项目测试；类型、Cargo、构建和真实部署连接分别记录。
- 已确认：GitPresence 是独立 Node 24/TS monorepo，协议 v1、Bridge 为本机唯一发布者；本机默认私有配置尚不存在。NAS SSH/Docker 可用，目前没有 Presence 容器；既有 gitea-caddy 提供 git.freshli4.com:10443 HTTPS。
- 决策：App 使用 Rust 只读观察者，不打包 Node sidecar；Bridge 继续独立检测 Git 与接收编辑器来源。服务器增加兼容 v1 的 observer 握手，禁止观察者发布快照。首轮登记 GitTogether 与 GitPresence 两个真实仓库，不自动共享全部账号仓库。
- 成功标准：设置可启停且秘密留在本机；NAS 独立容器健康；TLS 与鉴权正确；Bridge 的真实快照可在 Rust 客户端和 UI 读取；断线不变 clean；正式包和公共更新源通过既有验证。

## 实现与真实连接

- NAS /vol3/docker/gitpresence 部署 gitpresence:0.2.0；实际构建成功，容器 healthy，UID/GID 1001、只读、移除全部 capabilities、禁止提权、unless-stopped。配置位于 source 外、600 权限，只含 tokenHash。
- 既有 gitea-caddy 增加 /presence/ handle_path，验证候选后备份原文件并平滑 reload；HTTPS /presence/health 返回协议 1，Gitea / 和 Ink /ink/ 均为 200，未停止其他容器。
- 私有 Bridge、观察者与 loopback 密钥独立，生成于 ~/.config/git-presence，未打印、入库、写入用户安装版或放入包。该机器的 NAS 试用配置启用；其他机器默认停用且没有密钥。
- 独立 Bridge 真实扫描 GitTogether/GitPresence 两个工作区，正常 TLS 接入 NAS。真实原生 Rust 观察者与本机读取均为 connected，收到 1 个包含两个项目的真实会话；Git changed 数量随本轮文件变化更新。UE/Godot 来源尚未在本轮接入，界面诚实显示编辑器未接入。
- 原生与浏览器共用有限 Presence 命令，密码字段只输入、不回读；配置 generation 防旧连接结果回写，停用停止本应用的两个读取任务。读取错误与设置错误分开保存，定时刷新不清除保存失败说明。
- 设置、侧栏圆点和仓库的可展开文件状态接入单一 PresenceProvider；断线保留上次状态且撤销有效性，Git/editor 分开显示。没有动态插件执行或 Node sidecar，没有接入 Bridge 的 Git 写入口。
- 部署角色核对真实通过：观察者读取、观察者发布被拒绝、观察者冒充 bridge 被拒绝、无认证得到 401。首个探针曾错误假定服务会立即 close 而超时；改为按协议的 error 拒绝回读，未把该失败计为验收成功。
- 前端类型/Cargo --locked/生产构建通过（276模块，含同期提交范围/推送反馈；保留既有大分块建议）。未新增或运行项目测试。浏览器真实启用得到 connected；版本随后被同期任务递增造成旧预览版本提示，后续用当前版本重启本轮预览。
- 同期 0.22.11 的提交范围/推送反馈已独立提交 4eda68fc90；仅继承，不重归属。其发布持有全局锁，本轮先完成自身文档/部署，不在其发布过程中推送新 main 打断门禁。Presence 是新增能力，计划递增 minor 为 0.23.0。
- GitPresence 服务器源码 ff242f4 已推送 main，并从 git archive 精确更新 NAS；最终镜像 sha256:933b8a99ec1b797aa8a17089edad6b91fbd4e7454d7eff34cb41f8924023f8a0，deployment-info.json 记录 sourceCommit 与源包摘要。更新后实际 healthy，Rust/Bridge 两条读取恢复 connected，仍有两个项目、一个真实上报会话。
- 同期 0.22.11 已完成公开 stable/latest 回读，全局发布锁已释放。本轮 minor 版本 0.23.0 的所有权威入口同步，类型、Cargo --locked 与276模块构建再次通过，接下来仅提交 Presence 段落并从干净已推送 main 发布。

## 最终核验与发布依赖

- 实现 d84730f4df 已推送 GitTogether origin/main；同步 GitPresence ff242f4 已推送。NAS 最终使用 git archive 的精确 ff242f4 源码，源包 SHA256 b83ef4f91e8df6e028bf8c398cc867d310491cee2884f88331478c1c193f0f8c；最终镜像 SHA256 933b8a99ec1b797aa8a17089edad6b91fbd4e7454d7eff34cb41f8924023f8a0。01:14 UTC+8 再次读取 healthy 与正常 TLS health，未重复部署或操作相邻容器。
- 本轮旧预览已停止并以 0.23.0 重建/启动，未停止其他项目服务。实际浏览器设置开关启用、NAS 已连接、本机服务已连接，Taobe 在线含两个真实仓库，版本不一致提示已消失。截图 macos/artifacts/presence/settings-connected.png 为实际连接界面；final-integration-proof.json 为 Rust 同源接口的只读回读，当前 1 个在线会话、2 个本机项目。变化数量为观察时事实，不作为固定期望。网页预览留作用户输出。
- 01:11 UTC+8 发布预检读到同期最新根/macOS AGENTS，随后规则提交 85b201a737 已推送：下一次正式发布须同源码/版本交付 macOS、Windows x86、Windows x64。当前入口会自动公开仅 macOS 资产，Windows 加密存储、Unix 调用、两种原生架构安装包和公共更新条目尚未实现。因此没有启动该发布入口，也没有创建仅 macOS 的 0.23.0 正式 Release 或把公证/更新源写成通过。
- 已向用户说明发布依赖。PRESENCE-03 单独记录已完成的 NAS/源码部署；其原有桌面交付条件保留为新 PRESENCE-04-release 未完成项，并关联 RUN-01-windows-packaging。README/Presence 使用说明明确源码与公开 0.22.11 的区别，不把网页源码当成安装版已更新。
- 服务器和客户端的连接/部署部分完成；桌面正式发布仍未完成。后续补齐三平台交付时沿用已配置签名、公证及 GitHub 权限，校验完整安装包和公共更新源，不操作用户已安装应用、不请求解锁。此次没有访问公证凭据、读取更新私钥或写入安装版用户数据。
- 未新增或运行项目测试套件；先前类型/Cargo/生产构建、角色拒绝和本次真实连接分别作为对应证据。没有对本轮 UE/Godot 接入、其他设备、持久化历史或远端执行作完成声明。

### 20261019-085919-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261019-085919-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 实现及验证

- 新增宿主PresenceStorage，复用未修改的原版TokenStore；独立服务名和实际Presence目录作为条目标识，并发首次保存共用单个密钥请求，失败请求不缓存。私有stdio只增加storageKey回调，不将密钥返回界面frame、日志或账号状态。
- 独立Rust进程改为异步请求密钥；先启动stdio响应读取，再加载Presence及控制配置/事务日志，避免首次启动和多服务器加载等待自身输入。新文件用GTP1/AES-GCM；旧GTT1及v10兼容读取，保存前先验证旧文件可读，失败不覆盖。Windows仍用既有GTTW1/DPAPI；移除本次不再使用的钥匙串和base64直接依赖。
- 9项功能回归加原有7项来源边界共16/16通过，覆盖并发独立密钥、失败后重试、旧密钥只读、真实独立进程保存/重启、GTT1/v10迁移、拒绝/认证失败原文件保持、控制配置及事务日志启动通信。当前工作区最终类型/Cargo --locked和差异检查通过。
- 发现同期账号登录、端口澄清和仓库发现任务在修改同一工作区，完整保留这些改动。第一次完整构建因源码变化触发快照保护；第二次遇到同期adapter.ts中的string/null类型错误。未覆盖或自行修补其他任务源码，在临时独立clone中仅应用本次18个源文件/版本/测试文件，完成类型/Cargo、16项回归、完整生产构建及原生验证；本次文件与当前工作区逐字节相同，verification.json保存摘要。此后当前工作区类型检查和最终完整生产构建均已通过；worktree-build-info.json记录整体源码摘要。
- 隔离完整构建保留既有大分包、bundle analyzer的import.meta解析及依赖URL弃用提示；构建成功且来源3895文件/68处允许差异通过，原版Git/auth/后台/TokenStore源码未改。
- 实际Electron开发窗口通过loopback虚构Presence账号登录、GTP1密文保存、进程退出/重新启动、同一账号恢复及设置页展示；无页面错误。测试脚本最初在清理步骤使用了主进程evaluate中不存在的require，随后又误用构建中不存在的node_modules/keytar目录；均已改为明确加载同源keytar.node，两条早期测试的临时钥匙串记录已逐一删除。最终重跑通过，验证自己的临时条目删除返回true后才写成功报告。没有读取、修改或重放真实用户凭据。
- 证据保存于artifacts/presence-storage/0.36.2/，包含报告、恢复截图、隔离构建信息、文件摘要以及当前工作区和隔离检查日志。README/DESIGN无需因内部存储修复调整；ARCHITECTURE和执行基础文档已补充格式与调用边界，REQUIREMENTS的DESKTOP-01-presence-storage已按实际范围完成。
- 没有生成新的.app、提交、推送、合并或发布；main及安装版不操作。真实用户服务登录、Windows存储运行和多设备业务仍未在本次验收。

### 20261012-110919-utcp8-taobe-gpt-6.md — 历史证据迁移

来源：`agent-log/system/20261012-110919-utcp8-taobe-gpt-6.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 交付

- 源码提交f1b6cf268f5982273f7df845e717c2edc1b7f896经HTTPS正常推送；origin/main回读与本地一致。只包含13个本任务文件及局部段落，未暂存其他对话的未提交改动。
- 版本0.27.1由共享工作区0.27.0样式patch递增，其他平台、性能等未提交源码没有混入本轮提交或发布声明。
- 4193浏览器预览已更新并保持运行，真实NAS/Bridge显示已连接。最后截图重新保存，页面clientWidth与scrollWidth同为625，原示例最小表宽溢出已消除。
- 类型检查和生产构建在共享工作区及本轮精确投影的隔离源码均通过；git diff --check通过。构建有既有大资源提示，没有新增或运行项目测试。
- 没有进行安装包发布或操作用户安装版，交付为已推送源码和可查看的布局预览。线上状态协议、NAS部署、头像同步、成员去重与圆环优先级未改变。
- PRESENCE-05-name-placement已勾选完成；DESIGN与docs/presence的头像位置说明已同步。收尾第一次使用shell内联Unicode更新日志时解释器报编码错误，未修改日志，随后通过局部patch完成。

### 20261012-121038-utcp8-taobe-gpt-6-presence-accounts.md — 历史证据迁移

来源：`agent-log/system/20261012-121038-utcp8-taobe-gpt-6-presence-accounts.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

# Presence 账号注册、登录与产品部署边界

- 用户原文：补上；另外我们未来的商业模式是：git-together 开源；git-presence 仓库切换为 private，在官网提供 docker 下载，docker 支持创建一个账户绑定多个仓库，但不支持绑定组织空间，组织管理为付费服务，部署在我们的 nas 上一个单独的 presence 服务器，用账号隔离不同组织；你看是否合理。
- 模型：gpt-6；运行环境仅提供家族标识，无法确认更具体版本。
- 当前分支：main；本轮已有多人并行改动，仅提交本任务的账号/设备衔接范围，保护提供商、Dashboard、诊断、主题等现有改动。
- 首次日志登记：2026-10-12T11:55:10.133916+08:00; 首次精确记录前已开始实现，不反推虚构启动时间；结束时间与最终证据待收尾。
- 版本：0.27.2 → 0.28.0，增加账号流程的向后兼容能力，递增minor；Native配置沿用presence-v1.encrypted，可读取旧访问密钥配置。
- 源码：设置内注册、登录、重新登录、退出、密码修改、多仓库绑定；原生端私有会话保存、不回传token；新账号可直接登记设备，稳定账号绑定可跨会话重登录恢复，撤销后允许重新登记。
- 初步类型/Rust检查通过；最终版本构建待收尾。没有添加或运行测试，不操作安装版，不代用户注册账号或填写密码。
- GitPresence当前已private，GitTogether仍public；商业方案记录为后续范围，个人Docker与私有组织执行模块已分开，官网下载和付费组织服务未上线。

## 结束登记与证据

- 结束登记：2026-10-12 12:10:38 UTC+8；功能提交66ace84a835031b938e9082de9c95a7ae9e6feca为main。
- 当前工作区TypeScript、Cargo --locked及生产构建通过。只含本任务改动的隔离源码也通过：286个前端模块构建、Rust 35.32秒完成；仅保留已有大包尺寸警告。未新增或运行测试。
- GitPresence 0d0fcca的0.5.0已推送并部署现有NAS；公开账号页面与匿名status HTTP200，注册开放且无需安装密钥，health显示账号协议1，容器healthy。个人Docker同源码构建，实际回读确认不含组织模块/源码映射/Bridge。当前现有NAS的旧授权保留；账号登记不冒称独立收费组织服务已上线。
- 由用户自行注册，未代填密码、创建合成账号、执行Git写操作或真实双设备验收；Web脚本只做语法检查。没有生成或发布客户端安装包，没有操作用户安装版。官网Docker公共下载、组织管理/邀请/计费、独立付费服务、邮箱验证/找回及许可证仍分项待办。
- 并行提供商、Dashboard、诊断、样式和旧日志的工作区改动保留；私有索引只加入本任务源码、版本和明确文档块，不将其他需求或记录夹入提交。
- 最后范围复核明确账号会话与后台设备生命周期：已登记设备不因账号会话到期停止无人值守接收，服务端每次操作仍验证独立可撤销设备授权；显式退出、改密码和项目/组织撤销继续生效。此补充只改变客户端身份绑定计算，未运行账号或Git写测试。
- 多设备解除仓库绑定后，从已验证设备状态同步服务端最新范围，省略已解绑工作区，保留其他仓库控制及状态发布；不以整个announce失败导致其他绑定仓库离线。末次Rust检查通过，运行验收仍待用户双设备操作。

### 20261014-013305-utcp8-taobe-gpt-6-presence-device-name.md — 历史证据迁移

来源：`agent-log/system/20261014-013305-utcp8-taobe-gpt-6-presence-device-name.md` @ `433ae99073a125b03f45bd5ebe0153c37db95671`。日期 / 时区沿用原记录；以下摘录不自动改变当前完成状态。

#### 0.30.11正式发布完成

客户端源码1206747522e625e76accbc2824709d5ab6f75a5c已推送main，v0.30.11同指该提交。标准package:desktop实际exit0，直接复用已有gittogether-notary默认读取、Developer ID及仓库外Tauri更新签名；未重新配置公证、索取秘密或要求解锁。Apple 32edac0b-9537-4aa8-a927-a294b1ba4531为Accepted；deep/strict、staple/validate及更新签名通过，spctl同时报告原有security disabled，不把它当成默认设备Gatekeeper验收。Windows工作流38440478831同源x86/x64实际安装、启动、有限平台诊断、PE架构和最终更新签名通过；未配置Authenticode，不能混同更新签名。

正式版本https://github.com/DDonlien/git-together/releases/tag/v0.30.11，非draft非prerelease，九项资产。匿名公开latest/Atom、旧版清单、Tauri三平台清单和所有完整下载包/签名均已回读，build-info.json publicUpdateVerified=true。公开说明已通过文件更新为本次括号设备名和此前已合入的Gitea参与判断修复，API确认保存。

| 最终资产 | 字节 | SHA-256 |
| --- | ---: | --- |
| macOS ZIP | 6537354 | 891409852e788d13531ef2266c83cdf8d93d2a6dbb65a5cb5f1af83cecd75875 |
| macOS Tauri tar | 6535342 | 8c7eb14cd686c67fa48d35766da2d3873511539118b2a6f3aa36c753e07c05da |
| Windows x86 | 5619477 | 72de501735446945443c3af22e4448df948c965a1ec8deed51672e376b001776 |
| Windows x64 | 6024089 | edc929e9d40a5e8ec43256b7c9560a031f1d6058bed8361401beca59b9339ee2 |

服务端0d7055179287b455aab06b19e6f43212b37160a1已推送并从精确归档部署NAS 0.6.1，镜像sha256:5eff26262af3186cad81e4a8aae1a6f49cd214bf930983adefd5f737f40e4fbb。实际healthy、配置/数据挂载不变，正常TLS健康端点及相邻Gitea/Ink均200；world与managed协议的deviceName已在运行镜像回读。旧source/镜像和部署记录保留，新候选源码目录source-device-name-0d7055179287，详情见GitPresence NAS文档及deployment-info.json。

最终包记录：_builds/_builds/gittogether-0.30.11-macos-arm64-sqPFpe/build-info.json，sourceSha256 ef2b7b875dbc914f8ce5111e7f62405dcc1233012e66787024f22e798797880d。未新增或运行测试套件、未创建账号/改密码/改设备名称或执行用户Git写操作，不把源码或包验收当作用户安装版UI已验收。只移除本任务所有的发布锁，保留最终包和报告；共享工作区全部WIP保留。
