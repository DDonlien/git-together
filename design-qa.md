# 三栏10%步进比例 QA（2026-10-10）

final result: passed（真实组件的局部源码与隔离浏览器验证，非用户账号或原生包验收）

- 保留Material 3卡片、12px间隔和三栏内容，仅在两条间隔悬停/键盘焦点时显示居中4×48px抓手、相邻比例及左右调整指针。默认30%/40%/30%，两条分隔线仅改变相邻两栏，严格10%档位；最小可读宽度230/290/216px限制档位。键盘左右每次一档，Home/End到边界，Escape恢复拖动前比例。
- mixed隔离预览采用本轮新建真实Git，不使用用户凭据。1280×720实测30/40/30→40/30/30及30/30/40，第三栏不变；21px微拖不跨档、极限拖动安全停在可用档位，松开与Escape后拖动态清除。收起后44px窄栏保留，两条比例条暂隐藏，全展开恢复40/30/30。草稿「比例调整保留草稿」、README选择、docs折叠与远端树来源均保持。
- 亮暗色实际截图目视通过，暗色抓手沿用主题中性色，激活使用primary。769×853时内部三栏791px、容器521px，保持真正30/40/30且最小宽度，不把比例夹成非10%；无可用移动档位时辅助状态disabled。内部scrollbar-width为none、app-frame无溢出；该窄窗document.scrollWidth仍多126px，本轮未归因或修复全局既有溢出，不声称根级无溢出。正常1280px根页面溢出0。
- 新增8项回归；相关24/24、仓库144/144回归、strict、0.19.1生产构建和差异检查通过。扩大回归曾遇到其他并行顶部/Commit入口修改导致5条旧断言失效，对方更新后重跑144/144通过，本轮未改那些功能。实际Escape取消已测；pointercancel/失去捕获的事件处理由契约回归覆盖，内置浏览器不支持Input.dispatchTouchEvent，未声称真实触摸取消验收。控制台warn/error为0。
- 临时页、服务、viewport覆盖和测试Git已清理，HEAD/index未变；没有重启用户4173/4174服务、修改凭据/关联或执行用户Git写操作。4173 status/catalog均HTTP200且ok，真实开发模块含分隔条；不以隔离数据证明用户账号或安装包更新。本轮不提交、推送或打包。比例仅在当前挂载工作台保持，不承诺跨退出持久化。
- 效果：[亮色三栏抓手与40%/30%档位](/Users/taobe/.codex/visualizations/2026/10/08/01a11a3f-e8aa-70e2-b5e4-984d6eabe999/column-resize-cards.png)、[暗色默认比例](/Users/taobe/.codex/visualizations/2026/10/08/01a11a3f-e8aa-70e2-b5e4-984d6eabe999/column-resize-dark.png)。

# 三栏横向收起箭头 QA（2026-10-10）

final result: passed（局部源码与隔离浏览器验证，非原生包验收）

- 仅把共享栏标题的展开态向下箭头换为Phosphor向左箭头，收起态仍向右；无CSS、尺寸、配色或状态逻辑修改。
- mixed隔离真实Git预览实测三栏左→右→左，全部28×28px按钮、收起栏44px；实际点击、Enter、Space展开正常，main草稿及远端树保持，隐藏内容不进入辅助树。12/12相关回归、strict、0.17.7生产构建及差异检查通过；随后并行任务将源码版本递增至0.17.8，本轮不覆盖。
- 临时页和服务已关闭，临时Git清理且HEAD/index未变；不重启账号服务、不打包、不推送。效果：[三栏横向箭头](/Users/taobe/.codex/visualizations/2026/10/08/01a11a3f-e8aa-70e2-b5e4-984d6eabe999/column-horizontal-carets.png)。

# 文件树底部身份行 QA（2026-10-10，0.17.6）

final result: passed（本轮局部UI与隔离目录打开；不代表安装包或真实账号验收）

- 对照用户的顶部/本地两张裁图及最新底部裁图，落实最新批注：顶部身份及第二行路径移除，每个任务只保留底部一行；分支左、SHA右、路径紧跟分支。保持既有Material配色、字体/Phosphor图标、三栏与来源控件，底部不是旧配置操作栏。截图示例使用临时Git，不复刻附件的真实仓库数据。
- 使用现有remote-integration-preview --file-open，生产构建App通过真实AccountService/HTTP/DTO读取临时Git，provider为不联网的synthetic Gitea，无用户凭据。1280×720亮色本地及872×853暗色本地截图目视通过；三项远端任务DOM均为1个footer且无顶部identity。窄窗收起图栏的现有行为保留。
- 本地信息行与SHA同中心线，左右12px内缩，SHA48.2px固定宽。原621px路径在100px/47.6px文本盒内nowrap+ellipsis，完整路径仍在title/可访问名称；树栏270.5/218.1px宽，根页面溢出0。docs折叠、README选择、提交草稿经来源切换保持。没有改树HEAD基准或写入Git。
- 点击路径实际打开Finder，路径栏和内容对应本轮临时main worktree；请求中共享文件打开锁使相关按钮暂时禁用，完成后恢复，无错误提示。本轮Finder窗口已关闭。键盘真实打开和浏览器失败提示未实测；服务/HTTP/客户端负面回归已覆盖任意路径、失效、打开失败和错误成功回执。
- strict、相关59/59回归、生产构建与git diff --check通过。初期并行提交功能尚未补齐类型时check失败，最终重跑通过，未修改该任务逻辑。浏览器console warn/error为0，临时页/viewport/服务/仓库已清理，HEAD/index不变。
- 本轮不重启用户账号服务、不重放凭据、不提交/推送或打包。4173实读openDirectory对空输入返回身份校验错误而非未知方法，0账号/0仓库/0关联；源码版本递增不等于安装包更新。
- 效果证据：[亮色完整页面](/Users/taobe/.codex/visualizations/2026/10/08/01a11a3f-e8aa-70e2-b5e4-984d6eabe999/tree-footer-local.jpg)、[暗色窄窗口](/Users/taobe/.codex/visualizations/2026/10/08/01a11a3f-e8aa-70e2-b5e4-984d6eabe999/tree-footer-dark-narrow.jpg)。

# 远端内容完整链路 QA（2026-10-07，0.5.0，R-05-remote-integration）

- 用户明确回复「重启」；主 4173 已更新到 0.5.0，新 instance c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1。旧网页账号会话清空，最终 0/0/0；未重放令牌、操作用户 Git、重打桌面包或重启授权助手。
- 生产构建 App 经过实际 AccountService/HTTP/客户端 DTO，在独立真实临时 Git/synthetic Gitea 中显示 3 分支任务、4 提交和真实 merge，无本地关联。聚焦只是视图过滤；历史提交改变同任务 Diff/树，树文件读到已提交 value=0 而非脏 value=10。多次 HEAD 心跳保留选择，最终构建重新加载仍正常，warn/error 为空；退出清理临时标签/服务/仓库，HEAD/index 不变。
- 公开 Gitea 1.26.2 API 实读 backrooms 的 main/gameplay/main/ui/main，16 提交与完整树、main 已提交 Diff/文件可读。它与隔离 UI 都不是用户重连后的登录/私有权限/原生验收。
- TypeScript strict、179/179 测试、4/4 静态包装与生产构建通过。空远端树不要求关联本地；逐分支失败保留上次 SHA/树/历史并标明最新 HEAD，移除旧分支 ref 防止错误关联。
- 当前用户页面留在 Gitea 连接表单，域名已填，请用户自行点击连接，真实账号页面验收待完成。[用户重连入口](/Users/taobe/.codex/visualizations/2026/08/17/01a00fb8-fd9f-7391-9858-5801b4e44be4/gitea-reconnect-050.png)；[生产完整链路隔离证据，非用户账号](/Users/taobe/.codex/visualizations/2026/08/17/01a00fb8-fd9f-7391-9858-5801b4e44be4/remote-integration-production-qa.png)。

# GitHub 本机网页授权连通性 QA（2026-10-06，IMPORT-11-browser-local-csp）

- 错误根因是主页面 connect-src 缺少授权 API 来源；辅助服务 HTTP/CORS 正常、配置启用，却被客户端安全策略拦截。仅增加固定 `http://127.0.0.1:4174/api/` 路径，其他策略、窗口材料和组件均不变。
- 新增 HTML 策略回归先在旧策略失败，补丁后通过；strict、153/153 全套（包含其他任务同期回归）、4/4 静态包装与生产构建通过。生产 HTML、当前 4173 HTTP 页面、实际浏览器 DOM 都包含精确放行。
- 实际内置浏览器点设置→添加账号→通过 GitHub 网页授权，进入“等待 GitHub 授权”，不再显示连接错误，error/warn 为0；成功取消本轮测试流程后恢复可操作表单。未点击 GitHub 同意、配置或安装按钮，受控标签列表未确认官方授权窗口，因此真实登录/同意和回调后仓库导入仍待验收。
- 主服务原实例 31cee704-b1f3-42cf-9018-7958b437069e、0.4.0、1 个 Gitea 账号 / 20 仓库 / 0 关联不变，辅助服务 configured=true；没有重启、读取或重放凭据、保存账号或改变用户仓库。此状态也不证明用户自行配置的密钥已验证有效或轮换完成。没有原生打包、提交、推送或部署。
- [等待阶段证据（本轮测试随后已取消）](/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/github-oauth-csp-waiting.jpg)。应用注册与开发配置只做一次，普通用户不重复开发者步骤；生产授权与发布另行验收。

# 文件树来源胶囊圆角 QA（2026-10-06，R-05-tree-source-radius）

- 批注只涉及右栏标题中的「远端 / 本地」。修改前外框为8px、按钮为6px，而公开移动底板为999px胶囊；两个局部CSS声明改为共用 `--ogui-radius-capsule`，不修改库、私有光学节点、其他控件、材料或行为。
- 1280×720隔离真实临时Git浏览器：亮色远端和暗色本地均呈协调的内外胶囊，外框84×28px、按钮和底板38×22px、2px padding/gap、三个44px栏标题保持；两种来源实际切换，点击/Enter/Space通过，来源变化不改变图/Diff文本。根页面无横向溢出，error/warn为0；键盘焦点保留。
- 新增1项回归，strict、149/149全量测试、4/4静态包装、生产构建与差异检查通过。当前4173的CSS已热更新，仍是0.4.0和原实例31cee704-b1f3-42cf-9018-7958b437069e、0账号/0仓库，不重启或代填账号。前后两个隔离服务已关闭、标签已关闭，临时Git清理确认HEAD/index不变。未打包桌面、未提交、推送或部署；隔离浏览器不是原生验收。
- 局部截图：[修改前](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/tree-source-radius-before.jpg)、[亮色远端](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/tree-source-radius-light-remote.jpg)、[暗色本地](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/tree-source-radius-dark-local.jpg)、[控件细节](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/tree-source-radius-detail.jpg)。截图中的账号和仓库均为隔离测试。

# GitTogether 正常网页授权与安全开发配置 QA（2026-10-06，IMPORT-11-browser-local）

- 浏览器预览新增官方 GitHub 登录/同意页面及代码回调，复用现有账号导入与 0.4.0 编辑接口；同身份保留 ID、名称和关联，不用设备验证码代替正常网页返回。原生桌面历史设备码入口未变；生产授权服务和桌面正常返回尚未完成。
- 新增 15 项回归，覆盖 state/S256 PKCE、一次性回调、拒绝/过期、重复请求、取消与保存竞争、重新授权身份保留、令牌不返回浏览器、Host/CORS/配置来源及弹窗失败。最终 148/148 全套、strict、4/4 静态包装、生产构建和差异检查通过。最后一轮首先遇到并发打包任务调整主页面来源校验后旧源码断言失配，该任务已更新断言，重新全套通过；没有为了通过测试放宽校验。
- 实际浏览器打开并保留独立本机配置页：密码字段空白、轮换确认未勾选、状态为尚未配置；本轮没有使用或保存聊天中的密钥。页面仅用于开发者一次性配置，未加入普通账号界面或恢复已删文案。独立授权服务绑定当前主服务实例，密钥只留进程内存、不入文件/前端/安装包；重启辅助服务后已刷新空白页。
- 主预览当前 HTTP 200、0.4.0、instance 31cee704-b1f3-42cf-9018-7958b437069e、账号/仓库/关联 0/0/0。旧 Gitea 会话由另一项已获用户授权的账号编辑重启清空，本轮没有重启主服务或重放凭据。
- GitHub 设置页的两次受支持读取超时；没有保存实际 Callback URL、生成新密钥、执行用户同意或安装确认。因此真实接通仍待用户撤销旧密钥、生成新密钥并直接输入本机页，保存 `http://127.0.0.1:4174/oauth/github/callback` 后完成真实登录/同意。回归和本机配置页可用不表示 OAuth 或私有仓库权限已验收；没有提交、推送或部署。
- 本地交接截图：[开发授权配置页，密码为空](/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/github-oauth-local-setup.jpg)。

# GitTogether 0.4.0 账号编辑 QA（2026-10-06，IMPORT-02-edit）

- 局部批注落实为账号行末「编辑」「移除」，复用原有按钮、字段、弹窗与材料；GitHub 重新授权保持独立。名称预填，令牌不回填、留空保留；身份字段不可编辑，未修改/空名称/保存中禁止提交。
- 隔离 QA 使用生产客户端和真实 AccountService，通过受保护的本机 HTTP 保存，提供方仅为不联网的 fixture。1280×720 实际检查两平台入口、Enter 打开、取消/Escape 不保存和焦点恢复；无效令牌与其他身份保留名称/令牌草稿、原账号不变，留空令牌改名成功，新令牌验证/保存成功。保存中字段与动作禁用，Escape/关闭不能误关；再次打开令牌为空，侧栏与 Dashboard 的名称、账号身份和仓库分支同步，其他账号不变。浏览器 error/warn 为0；未改用户外观或 viewport。
- 新增12项回归覆盖两平台/同 host 重名账号、空白令牌、字段/来源约束、原子持久化失败、关联/账号隔离、删除/并发编辑和旧令牌迟到刷新；真实 HTTP 验证保存及跨源拒绝，不返回凭据。最终 strict、148/148全量回归、4/4静态包装、生产客户端构建及 Electron main/preload 编译通过，差异检查通过。全量含工作区其他任务的既有/新增测试，不都归为本轮编辑功能。
- 用户明确许可本轮重启与接通保存；4173 已从原 0.3.2 会话更新为 0.4.0，instance=31cee704-b1f3-42cf-9018-7958b437069e，status/catalog HTTP 200 / ok，账号/仓库/关联=0/0/0。原内存 Gitea 会话清空，需用户重新连接；没有导出/重放用户令牌、调用用户远端、保存用户关联或修改仓库文件。隔离标签与测试服务已关闭，实际预览保留。
- 不作为真实 Gitea/GitHub 新令牌、原生 UI/系统钥匙串持久化、远端内容或系统文件夹选择接口验收；未提交、推送或发布。
- 本地证据：[编辑入口（隔离账号）](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/account-edit-entry-20261006.jpg)、[编辑弹窗（隔离账号）](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/account-edit-modal-20261006.jpg)、[更新后的用户预览](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/account-edit-preview-ready-20261006.jpg)。

# GitTogether 文件树来源切换 QA（2026-10-06，R-05-tree-source）

- 仅修改文件树标题和树来源显示；使用公共分段按钮，不新增控件库、页签或 checkout 行为。右栏远端卡片不再重复显示「远端」角标或路径前缀，保留分支和 SHA；中栏来源不变。
- 1201×853 暗色当前用户页面：分段按钮在标题右侧，宽84px、高28px，三栏标题均44px、右侧14px内边距、根页面无横向溢出。点击本地显示「尚未关联本地目录。」；Enter 回到远端真实待接入状态。现有登录没有重启，服务仍为原 instance、1账号/20仓库/0关联。
- 隔离混合来源 QA 使用一个本轮新建真实 Git 仓库：远端树不含未提交 src/new.ts，本地树包含它和 M/?? 标记。切换本身不改变图和 Diff 文本；remote/main 与 local/main 的文件选择、src/docs 折叠和本地提交草稿分别保留，Space/Enter 均可切换。聚焦远端 main 后切到本地仅显示本地 main，不操作 HEAD/index。亮暗色来源控件和材料实际复查，error/warn 为0。
- 新增4项回归，最终 strict、114/114测试、4/4静态包装、生产构建与差异检查通过；临时 QA 标签/仓库已清理，HEAD/index 未变。没有设置 viewport 覆盖，也没有改变用户外观或账号配置。
- 仅验收前端来源切换：当前账号远端内容服务、完整本地读取、原生目录选择器/桌面及 Git 写操作仍待原有验收，不将隔离数据当作已连接用户账号。版本保持0.3.2以保护内存会话，未提交、推送、部署。
- 本地证据：[当前用户文件树标题](/Users/taobe/.codex/visualizations/2026/08/17/01a00fb8-fd9f-7391-9858-5801b4e44be4/tree-source-remote-20261006.png)、[隔离混合来源暗色](/Users/taobe/.codex/visualizations/2026/08/17/01a00fb8-fd9f-7391-9858-5801b4e44be4/tree-source-mixed-dark-20261006.png)。

# GitTogether 仓库名称与所属方分列 QA（2026-10-06，IMPORT-13-owner）

- 按最新批注局部拆分仓库名与组织 / 用户，在仓库与账号之间加入所属方列；组织及个人都读取真实仓库 owner，访问账号继续独立显示。仓库按钮的完整 owner/name 提示和 repo.id 导航不变，搜索仍包含 fullName。没有更换图标、字体、材料或重做其他页面。
- 与修改前同尺寸 1201×853 截图目视比较：新增列不挤出本地目录、状态或菜单，名称不带前缀、第一行长仓库名可完整显示；原 36.35px 圆角图标底板和居中 19px 文件夹保留。表格前后均 913px，七列全部位于容器内，20 行均 58px；根 scrollWidth=1201，无根级水平溢出。保留原 840px 表内滚动下限，本轮没有另外调整 viewport 或外观偏好。
- 真实 Gitea 列表：19 个组织仓库 owner=FreshLi4，个人 clash-config owner=Taobe；访问账号均为 Taobe。查询 FreshLi4/ 得到 19 行，查询 clash-config 得到个人行，点击短名称正确打开该仓库的信息与完整身份。返回并清空搜索后恢复 20 行；40px 操作列的菜单仍在视口内，Git 写项禁用，Escape 从实际聚焦菜单项关闭并恢复触发器焦点。对不可聚焦 menu 容器的第一次按键定位超时是自动化目标问题，重新读焦点后成功，不是应用失败；浏览器 error/warn 为空。
- 新增 3 项回归，覆盖短名称/完整提示、组织与个人 owner 独立于访问身份、同名仓库和所属方搜索/本地关联隔离；既有统一表、账号、图标底板和目录入口回归更新到七列。实际 TypeScript strict、117/117 全套测试、4/4 静态包装、生产构建及差异检查通过；当前目录另有既有 4 项文件树回归，不记作本轮新增。
- 原服务 instance 40c3b635-ce1f-4a1c-b392-f11154f1fcdf 及 1账号/20仓库/0关联保持；没有重启、改变 API/凭据、保存关联或操作用户 Git。预览仍为 0.3.2，不递增配置依赖造成会话丢失；未新增原生验收，未提交、推送或发布。
- 本地截图：[最终统一列表](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/repository-owner-final.jpg)、[个人仓库](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/repository-owner-personal.jpg)、[修改前](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/repository-owner-before.jpg)。截图不发布到外部服务。

# GitTogether 仓库图标圆角底板 QA（2026-10-06，UI-07-tile）

- 用户澄清要保留圆角矩形背景、把图标放在中间；最新澄清取代旧「只放大 SVG、不加底色」理解。仅为 Dashboard 仓库图标增加自有装饰 span，复用 blue-bg 与 8px 控件圆角、19px Phosphor 文件夹，不更换控件库、文字、其他列或侧栏。
- 与同尺寸 1201×853 的改动前暗色截图一起目视核对：圆角底板的范围仍与两行文字等高，内部图标留有空间、没有铺满底板；名称/描述和各列位置保持。20 行底板及文字高度均为 36.34375px，内部 19×19px 图标水平/垂直中心差为 0，图标到文字 10px、行高 58px；账号列 SVG 0、侧栏 19px，根页面不溢出。
- 暗色底板 rgb(41,58,84)，亮色 rgb(234,242,255)，均为既有语义填充；亮暗色截图实际检查，没有新增阴影、立体边缘或整行卡片。临时切换亮色后恢复原「跟随系统」设置，减少透明度保持原值；没有设置 viewport 覆盖。
- 搜索 ball-maze 得到 1 行，文字导航打开正确仓库并返回 Dashboard，最终空搜索/全部 20 行。浏览器 error/warn 为 0。当前 catalog ok，原 instance 40c3b635-ce1f-4a1c-b392-f11154f1fcdf、1账号/20仓库/0关联保持；未重启、修改凭据或保存关联。
- 更新 3 项既有尺寸/结构/样式回归，TypeScript strict、110/110 测试、4/4 静态包装、生产构建及差异检查通过。不是原生桌面目视或新的发行版本验收；保持配置依赖版本 0.3.2，不提交、推送或发布。模板在线更新检查 ETIMEDOUT，未确认最新远端规范，不覆盖本地版本。
- 截图仅在本地可视化目录：[暗色最终效果](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/repository-icon-tile-final.jpg)、[亮色效果](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/repository-icon-tile-light.jpg)。先前无底板 QA 保留为历史，不作为本轮最新样式。

# GitTogether 无本地关联的远端浏览 QA（2026-10-06，R-05-remote，服务待接入）

- 最新标注纠正本地关联门槛：远端分支、历史、文件树和已提交 Diff 独立读取；关联只影响本地未提交内容与动作。保留三栏、任务卡片、聚焦、字体和材料，没有复制 Zed 美术或加入模拟提交。
- GitHub/Gitea 独立读取器和响应验证已实现；使用本轮创建的真实临时 Git 经有限 provider 接口适配，零本地关联读出 3 分支、4 个提交和真实两父 merge。未提交/忽略文件不进入远端树，blob 是已提交值而非工作目录脏内容；缓存、分页、截断回退、分支失败、取消、空仓库、字面路径和 binary 有回归。
- 1201×853 隔离浏览器三栏：选择 Document workspace layout 后 main 卡片显示该提交 Diff、对应树不含后来的 src/search.ts；再次点击选中提交回到 Merge search task/HEAD。树中 app.ts 读取已提交值 0（不是临时工作目录脏值 10）。聚焦 main 再显示全部保留选择，关闭文件恢复提交 Diff。亮/暗色保留平面层级、内部分栏滚动、卡片底部禁用提交区，无 browser error/warn。
- 当前用户预览只显示真实已有账号目录，新的远端内容接口明确待服务更新，不能把未接入当成「本地关联后才可读取」、真实空仓库或已成功读取。status/catalog HTTP200，原 instance 40c3b635-ce1f-4a1c-b392-f11154f1fcdf、0.3.2 与 1账号/20仓库/0关联保留；没有重启服务或导出/重放凭据。
- 新增 10 项回归；strict、110/110 测试、4/4 静态包装、生产构建和差异检查通过。隔离 QA 客户端/服务单独 strict 通过。临时浏览器标签和本轮 QA 仓库已清理，HEAD/index 不变；viewport 覆盖清除后恢复原 769×853。构建不表示发布。
- **尚未接入 AccountService/共享 DTO/HTTP/IPC/controller。** 已请求清空内存预览登录的服务重启许可，未收到答复；不能把隔离接口测试当作用户真实 GitHub/Gitea 网络/权限或正式远端 HEAD 心跳验收。现有 GitHub 授权、系统目录选择器、原生桌面和 Git 写操作仍未完成本轮验收。版本暂不递增，避免触发当前服务重启。
- 截图是隔离验证，不是用户账号页：[无本地关联亮色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/remote-no-local-light.jpg)、[无本地关联暗色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/remote-no-local-dark.jpg)。此前三栏空状态证据仅为历史布局检查，由本条远端访问要求取代；未提交、推送或部署。

# GitTogether 仓库三栏与任务卡片 QA（2026-10-06，R-05，历史布局检查）

- 最新仓库标注要求三栏持续同屏、基础信息横贯、branch/worktree 作为项目任务而非切换应用。Product Design 的标注流程限定布局参考，不复制 Zed 美术；保留当前共享背景、悬浮侧栏、系统字体和 OpenGlass 公共控件。整个 App 的重复/空 topbar 已移除。
- 当前用户预览 1201×853：只有一个仓库 h1，基础信息仅一组，搜索在组内；从左到右分支图/更改与 Diff/文件树，三组 box-shadow 均 none，根 scrollWidth=1201。此仓库仍未关联目录，三栏为空状态而非虚构数据；Commit 禁用，提交区底部833px、按钮底部821px均在视口内。原 Dashboard 仍20行、账号图标0；设置没有空顶栏。
- 用户页面实际 Cmd-K 聚焦仓库搜索；关联入口打开原弹窗，Escape 关闭并恢复原按钮焦点；设置/Dashboard/仓库导航可用，没有选择或保存用户目录。版本0.3.2、服务实例40c3b635-ce1f-4a1c-b392-f11154f1fcdf和1账号/20仓库/0关联保留，status/catalog HTTP 200 / ok。未重启、重放凭据或写入用户 Git。
- 独立真实临时 Git fixture 创建 main、task/search worktree 和未检出 task/review，以及真实两父 merge。测试浏览器使用与运行界面相同的组件、样式和独立读取器，不使用用户账号/目录。默认3任务同时挂载，聚焦 task/search 后提交图只保留它的2条真实可达历史，退出恢复4条；不是 checkout。
- 两 worktree 的同名 src/app.ts 分别读到10和20；仅编辑 fixture 后 main 自动更新11，status仍M，另一任务仍20。新增 docs/new.md 后文件/树自动更新；两个草稿、各自文件选择和 task/search 的 src 折叠保持。未更改 README.md 不显示旧 Diff，而明确没有未提交更改。键盘 Enter 可折叠目录，搜索/清空不丢草稿；未检出分支只有文件快照，没有工作目录更改和可编辑提交。
- 发现并修复1280×720聚焦时 Diff 的内容基准高度把底部 Commit 撑出视口；为任务卡片约束 flex 基准，并使 Diff/文件树内部滚动，复查 composer bottom=700、Commit bottom=688与栏底700一致。1201×853亮/暗色目视确认平面层级、分支图/路径/文件状态/输入区分清楚，卡片底部操作可达。
- 实际1280×720、1201×853、920×640、769×853、390×844检查；三栏保持display:flex和固定顺序，窄尺寸各列230/290/216px、内部760px横向滚动，根scrollWidth等于viewport宽度。未用tabs/纵向替换隐藏三栏，也未缩小字号掩盖布局。临时viewport最终恢复原769×853并清除。
- 本轮新增11项回归；strict、100/100业务/组件测试、4/4静态包装、生产构建与git diff --check通过，两个隔离QA入口也单独strict检查。旧模拟契约测试仍为历史测试，不是Git写操作验收。用户页与隔离页 error/warn 为空。
- 独立读取器已实现，但 **AccountService/共享DTO/HTTP/IPC/controller 尚未接入全部任务**。更新会清空内存账号会话，已询问重启许可，尚未收到答复；不将isolated workspace prop或fixture端口冒称真实账号API接通。原生AppKit/macOS27视觉、真实Git提交、既有OAuth与系统目录选择器仍未作为本轮通过项。
- 证据只保存在忽略的本地artifacts：[用户页面对应标注尺寸](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/current-preview-1201.jpg)、[真实临时Git默认任务](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/all-tasks-light.jpg)、[聚焦亮色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/focused-light.jpg)、[聚焦暗色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/focused-dark.jpg)、[窄窗口](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-workspace/narrow-390.jpg)。测试服务/标签页和临时仓库已清理，回执确认HEAD/index不变；没有提交、推送或发布。

# GitTogether Dashboard 仓库图标等高 QA（2026-10-06，预览版本 0.3.2）

- UI-07：Product Design 标注流程限定仓库表文件夹的尺寸修正；保留既有搜索/筛选、行尾操作、字体、悬浮侧栏和右侧平面层级，没有按旧截图恢复账号图标或其他已移除控件。
- 修改前实际 20 行图标 19×19px，两行文字高36.34375px；修改后名称12px、辅助行11px、行距1.45、两行间隔3px与正方形图标使用共享局部令牌，实际图标/文字均36.34375px，上下边差值0、间距10px、行高58px。有描述、无描述、公开和私有都检查；性质仍9px，没有图标底色、阴影或形状拉伸。
- 当前769×853和与标注相同1201×853均实测全部20行高度相同、账号列SVG为0、侧栏图标19px、根页面无水平溢出，表格自身仍可滚动。实际搜索ball-maze得到1行，清空按钮恢复20行；仓库名称导航到远端信息，再返回Dashboard。浏览器error/warn为空，临时viewport已清除并恢复769×853，预览保留。
- 用户标注图片与同尺寸实际截图在本轮上下文目视比较：仅仓库图标扩大以对应两行信息，其余按当前页面状态保留。证据在忽略的本地artifacts：[标注尺寸](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-icon/dashboard-1201.jpg)、[最终默认尺寸](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/repository-icon/dashboard-default.jpg)，未发布仓库目录资料。
- 新增3项结构/尺寸/范围回归；strict、89/89测试、4/4静态包装、生产构建及差异检查通过。原服务实例40c3b635-ce1f-4a1c-b392-f11154f1fcdf及1账号/20仓库/0关联保持，不重启、重放凭据或操作用户Git。不新增原生AppKit/macOS27验收；未提交、推送、发布。继续保留0.3.2以免package配置依赖变动重启内存服务，安全发布时再递增。

# GitTogether 侧栏图标与仓库层级 QA（2026-10-06，预览版本 0.3.2）

- UI-06：Product Design 标注流程限定两处局部更改，保留窗口/侧栏材料、字体、导航逻辑及右侧内容。Apple HIG Layout 强调对齐便于扫描、缩进表示从属关系，Sidebars 建议用展开控制组织两级内容；AppKit 的 indentationPerLevel 是可设置的每级缩进。19px/半图标 9.5px 是用户选择与本应用密度，不宣称 Apple 强制具体数值。
- 修复账号列表 -2px 外边距、账号 9px 与 Dashboard 10px 内边距不一致造成的中心偏移；11px 展开/收起图标放入居中 19px 固定宽列。账号名称与 Dashboard 文字都从 x60 开始。仓库图标统一为 19px，图标与文字通过逻辑起始 padding 共同内缩 9.5px，保持 10px 图标/文字间距、34px 仓库行和 30px 账号行；不移动/缩窄整行背景和点击范围。
- 当前 769×853 用户预览：修改前 Dashboard/箭头中心分别 x40.5/x33.5；修改后展开与收起均为 x40.5。子图标中心 x50、文字 x69.5，相对父列/父文字各 9.5px；父/子行均 x21、宽170。实际 Enter 收起后 0 子行，再 Enter 恢复 20 子行；点击第一个仓库保留正确选中，Presence 角标仍贴着文件夹。
- 使用公开临时 viewport 检查 920/1201/1600px，各宽度父图标中心相同、子图标和名称各内缩 9.5px、图标19px、选中行与父行同宽。1201×853 的同一仓库完整截图与用户两张标注在本轮上下文中目视比较：父图标统一竖线、子行形成从属层级；其余区域保留现有源码，不把历史截图的旧搜索入口恢复。截图：[对应标注尺寸](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/sidebar-hierarchy/sidebar-1201.jpg)。
- 390×844：紧凑回退保留，Dashboard、箭头、文件夹图标均居中 x34，仓库名隐藏，设置入口在视口内；根页面 scrollWidth=390。完成后清除临时 viewport 并恢复原 769×853、展开账号和所选仓库。默认截图：[最终预览](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/sidebar-hierarchy/sidebar-default.jpg)。截图只保存在忽略的 artifacts，不发布用户仓库资料。
- 新增 3 项渲染/源码契约测试，覆盖装饰箭头不改变账号名称/展开语义、子项全宽选中与 Presence/名称保留、共享图标列和两个桌面断点内缩；实际 strict、86/86 测试、4/4 包装、生产构建及差异检查通过，浏览器 error/warn 为空。组件/样式检查不替代上面的实际目视；未新增原生窗口或 macOS27 验收。
- 未修改账号服务、授权、凭据或目录选择器；原 0.3.2 服务实例和 1/20/0 会话保持。未重启、提交、推送或发布。package 递增会重启内存账号服务，本轮继续保留会话，版本递增留到安全发布。

# GitTogether Dashboard 搜索筛选与自动检查 QA（2026-10-06，预览版本 0.3.2）

- IMPORT-15：按三处标注做局部更新，沿用现有 OpenGlass Menu/MenuItem 和系统字体，不新增组件库或重做页面。搜索从独立顶栏移到统计下、仓库表上的筛选行最左；两筛选采用轻量文字触发器与选中勾号，账号选项保留 provider/login/host 以区分同 host 多账号。移除「重新加载」与整个空 Dashboard 顶栏，保留统计、平面表格、浮动侧栏及 Git/GT 操作入口。
- 用户预览实际 769×853：搜索、两筛选 top 均为 124.84px、高度均为 32px，仓库数右对齐；根页面无横向溢出，仅表格自行滚动。检查鼠标与方向键选择、选中标记、Escape/外部点击关闭、焦点回触发器、Cmd-K 定位搜索、账号与关联状态组合筛选、搜索 ball-maze 1 行和清空后 20 行。没有原生 select、Dashboard 顶栏、重新加载按钮或输入蓝色焦点圈。
- 实测发现并修复公共 SearchField 的 grid 被应用 display:block 覆盖，导致清空按钮掉到输入框外；保持公开组件类的 grid 布局，非空搜索隐藏冗余快捷键提示。滤镜触发器的公共 interactive 引擎有 inline inset 阴影，改用限定公开样式覆盖，不检查/耦合光学私有 DOM。鼠标默认态无边框或阴影，键盘按钮焦点仍保留。
- IMPORT-16：服务状态每 10 秒、每账号远端仓库目录每 60 秒、每关联本地只读 snapshot 和选中 Diff 每 5 秒前台检查。每资源单任务不重叠、完成后再调度；窗口恢复/联网唤醒，隐藏/离线取消并暂停，错误指数退避至 5 分钟，窗口激活不能绕过失败重试时间。稳定资源 ID 和回调 ref 避免 catalog 更新不停重建定时器，instance/revision 与 AbortSignal 阻止迟到结果；保留成功缓存并显示错误，不清空输入、筛选或仍存在的选中文件。
- 真实 Gitea 用户会话检查时间由 16:02 自动推进到 16:30、16:43、16:47、16:52，没有手动刷新；原服务实例 40c3b635-ce1f-4a1c-b392-f11154f1fcdf / 1 账号 / 20 仓库 / 0 本地关联保持。没有重启服务、重放凭据、读取/保存用户目录或调用用户仓库 Git 写动作。远端心跳只读仓库目录，不执行 fetch，不声称远端提交实时到达。
- 1280×720 隔离生产预览复用真实 AccountService、假远端 provider 和本轮创建的真实 Git 临时目录。通过 stdin 改动 fixture，不提供网页控制路由：app.ts Diff 值 1→2 在 Git status 不变时自动更新，搜索 app 和选中 app.ts 保持；新增未跟踪 new.ts 自动计为 2 文件；远端新增仓库自动从 1→2；503 保留 2 行、显示错误并在恢复后自动清除；清理文件自动变为 0 文件/无 Diff，搜索仍保留。检查亮暗色菜单、视口内定位、32px 控件和无根页面溢出；浏览器 error/warn 为空。
- 新增 13 项回归（9 心跳 + 4 控件/样式），最终 strict、83/83 测试（包含同期文件夹入口 7 项）、4/4 静态包装、生产构建与差异检查通过。隐藏/离线/恢复及取消边界由独立时钟测试验证，没有本轮真实 OS 网络切换、原生 IPC 取消或桌面目视验收；既有 GitHub 授权/钥匙串/浏览器文件夹选择器未完成项保持。
- 截图保存在忽略的本地 artifacts：[搜索筛选行](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/import-15/dashboard.jpg)、[暗色菜单 fixture](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/import-15/dashboard-dark.jpg)、[自动 Diff fixture](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/import-15/automatic-diff.jpg)。当前用户窗口截图只展示最终关闭菜单状态；默认 769×853 不冒称来源的 1201×853。临时服务/标签页和目录已清理，清理回执确认 HEAD/index 未被应用改动。
- 产品版本保持 0.3.2：package 被 Vite 配置导入，递增会重启服务并清空真实内存账号，安全发布时再递增。不提交、推送或发布，不覆盖同期授权与文件夹选择任务的更改和验收边界。

# GitTogether 本地配置弹窗与文件夹选择入口 QA（2026-10-06，部分完成）

- IMPORT-04-picker：按用户三处标注移除关联介绍和绝对路径/子目录帮助文字，改为整行公共按钮组成的「选择文件夹…」字段。保留仓库身份、目录标签、取消/保存、解除关联、权限和错误反馈，不改变共享背景、浮动侧栏或内容层级。
- `local-directory.ts` 复用现有 Electron 目录选择 IPC，校验原生绝对路径，不改写含空格的目录名；取消返回 null，弹窗不替换原路径。选择只更新字段，不自动保存或调用 Git 写动作。打开选择器和保存的状态分别表达，未选目录禁止保存。
- 新增 7 项助手、实际字段渲染与源码契约回归，覆盖成功/取消/异常/无桥接、畸形和相对路径、不可编辑语义按钮、已有路径/禁用以及原验证/解除关联流程。同期 Dashboard 新增 localStates/onSearchChange 后旧测试 fixture 缺字段，补齐空状态和无操作回调，不修改该功能实现。最终 strict、70/70 测试、4/4 静态包装、生产构建通过。
- 当前 1201×853 浏览器实际打开配置弹窗，确认两个说明消失、input 数量为 0、空路径「保存关联」disabled。Enter 激活选择入口后，无桌面桥接的浏览器明确显示 role=alert 的不可用提示；Escape 关闭且焦点回到原目录文字。未选择或保存真实用户目录。截图为 [精简弹窗](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/local-folder-picker-preview.jpg)，仅证明布局与入口，不证明系统窗口。
- 当前浏览器系统选择器尚未接通。新增本机接口涉及 Vite 配置依赖重启，会清空当前内存账号会话，已询问用户、尚未收到授权。没有修改服务或版本配置、读取凭据或擅自重启；服务实例 40c3b635-ce1f-4a1c-b392-f11154f1fcdf / 1 个账号 / 20 个仓库 / 0 个关联保持。真实系统窗口打开、取消/回填与桌面路径保存尚未验收，需求保持部分完成；未提交、推送或发布。

# GitTogether 本地目录文字入口 QA（2026-10-06）

- IMPORT-04-inline：目录栏「尚未关联」本身为可点击文字，已关联时路径文字也可配置；无独立行内关联按钮，行尾操作菜单保留。当前 IMPORT-14 的已有源码已满足交互，本轮保留实现，仅补充明确约定、测试与实测，不重复改写菜单或目录组件。
- 新增两项回归验证目录单元格内的唯一文字按钮、账号身份可访问标签、零关联与已有路径、无独立关联按钮及权限限制。实际重跑 63/63 测试、TypeScript strict 与生产构建通过。
- 实际浏览器点击一个真实 Gitea 仓库的「尚未关联」，正确打开该仓库的「配置本地仓库」弹窗；取消后以 Enter 再次打开，Escape 关闭，焦点回到原文字。没有填写或保存路径。弹窗截图保存在本地 [文字入口打开结果](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/gittogether-inline-directory-20261006.jpg)。
- catalog HTTP 200 / ok，原服务实例 40c3b635-ce1f-4a1c-b392-f11154f1fcdf 保持，1 个账号、20 个仓库、0 个本地关联；未重启服务或修改凭据，没有提交/推送/发布。本轮未新增原生 UI 或用户真实路径保存验收。

# GitTogether Dashboard 标注与操作菜单 QA（2026-10-06，预览版本 0.3.2）

- IMPORT-14 按用户四处标注局部调整，保留共享背景、浮动侧栏、平面内容和现有账号目录；使用公开 OpenGlass Menu/MenuItem 与既有 App 处理器，没有添加新的控制库、模拟数据或 Git 写 API。
- 浏览器读取当前 DOM 的实际样式：私有/公开为 9px，原辅助文字及描述为 11px；账号列 SVG 数量为 0；分支为 inline-flex，分支/表格仓库/左侧仓库图标到文字均为 10px。解决了后续通用 .branch-label 覆盖横向布局的问题。只缩小性质，不缩小仓库名和描述。
- 行尾省略号菜单有 Git 与 GitTogether 两组，Fetch/Pull/Push/提交实际 disabled，附「尚未接入」说明，没有操作处理器。GT 工作台打开未关联仓库信息，目录配置菜单和目录列文字均打开同一个弹窗；两次仅打开并取消，不填写、保存或解除用户关联。
- 实际检查鼠标打开、ArrowDown/ArrowUp 的首尾焦点、跳过禁用项、循环导航、Tab/Escape/外部点击关闭及焦点恢复；底部仓库菜单向上翻转且保持视口内，portal 不被表格横向滚动容器裁切。浏览器 error/warn 日志为空。最终保留无搜索/筛选的 Dashboard，关闭菜单且表格返回横向起点。
- 主标注来源视口为 1201×853，本轮现有浏览器实际宽度为 769×853；尝试公开 viewport 能力没有改变实际宽度，已 reset。截图不冒称与来源同尺寸。默认窄视口的页面 scrollWidth/clientWidth 均为 769，横向溢出只在表格；已经对性质/间距做实际样式和当前视觉核对，没有声称 920/1201 桌面尺寸或原生外观已新验收。截图保存在忽略的本地 artifacts：[菜单](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/import-14/dashboard-menu.jpg)、[列表](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/artifacts/import-14/dashboard.jpg)，不发布用户仓库目录图。
- 新增 5 项分组/禁用/可用边界/触发器/样式契约回归。strict、最终 63/63 测试（包含同期目录入口两项回归）、4/4 静态包装、生产构建、git diff --check 通过；不把历史模拟操作契约测试算作真实 Git 写行为。
- status HTTP 200 / ok，实例仍为 40c3b635-ce1f-4a1c-b392-f11154f1fcdf，版本 0.3.2；账号/仓库/本地关联为 1/20/0。没有重启服务或修改凭据、授权代码与配置。包版本属于 Vite 配置依赖，递增会清除当前内存账号；延续同工作区的会话保护决定，本轮保留 0.3.2，不生成新的发行版本，后续安全重启时再递增。没有提交、推送、发布或新增桌面/钥匙串/真实授权验收。

# GitTogether 账号仓库总览 QA（2026-10-06，预览版本 0.3.2）

- IMPORT-13 已实现：账号侧栏直接列出完整远端目录及数量；Dashboard 为一个仓库表，账号、默认分支和本地目录是同级列，不再显示独立账号标题卡片。未关联目录可以从侧栏或仓库行打开信息页，不请求本地 Git 快照；本地更改与历史仍由真实关联启用。
- 新增 10 项组件渲染回归，覆盖零本地关联、折叠/选中、空账号/错误、同名共享仓库、同 host 同显示名多身份、账号列、关联隔离、账号/分支/目录搜索与远端/本地视图边界。56/56 测试、TypeScript strict、生产构建、4/4 静态包装与差异检查通过；构建验证不表示发布。
- 当前受支持的 Codex in-app browser 实际检查用户已连接的 Gitea：侧栏 20 个仓库、统一表 20 行、1 个账号、0 个本地关联。检查了侧栏与表格入口、未关联仓库信息、配置本地弹窗打开/取消、账号折叠/展开、账号筛选、关联状态筛选、仓库/账号搜索和重新加载；重新加载后仍为 20 行，无错误提示。没有新增测试账号或写入用户关联。
- 默认视口 769×853 实际目视，表格横向滚动可读账号、分支、目录、状态和操作；根页面 scrollWidth/clientWidth 均为 769，横向滚动仅在表格自身。未更改 viewport，最终回到无筛选的 Dashboard 和展开的账号。浏览器控制台 error/warn 为 0。
- 本地 catalog 服务实例与开始时相同，HTTP 200 / ok，1/20/0 状态保留；未改账号服务、凭据或授权实现，未重启服务。为保留正在使用的内存账号，本次未递增包版本或生成新发行版本。截图保存在本地 [仓库总览](/Users/taobe/.codex/visualizations/2026/08/17/01a0100f-f142-7402-8c7e-b79c809374a3/gittogether-account-columns-20261006.jpg)。
- 本轮已实现并验证浏览器行为；没有新增原生桌面、钥匙串持久化或 GitHub 真实授权验收，没有提交、推送或发布。其他任务的授权需求、日志与已有改动保持不变。

# GitTogether 0.3.2 输入焦点精简 QA（2026-10-06）

- UI-05：截图中的搜索框外层蓝圈来自组件库 focus-within，内部矩形来自应用的全局 input:focus-visible；已用公共文本控件类覆盖两者。搜索、单行和多行输入聚焦仅保留中性细边框，无焦点光圈/阴影/内部轮廓。错误字段仍使用危险色；按钮、选择框、勾选框的焦点规则未修改。
- 新增 3 项回归：焦点样式及错误色的 CSS 源码契约；搜索组件的标签、空/非空值、清空按钮与键盘定位属性；表单输入/多行控件的标签、内容及错误语义。没有修改组件或事件处理器，没有新增依赖。
- strict、46/46测试、4/4静态包装、生产构建及差异检查通过。预览沿用 4173 / PID 75051，自动重载后 status/catalog HTTP 200 / ok、版本 0.3.2，账号与仓库均为 0。
- 本轮未新增浏览器实际点击/聚焦、目视或原生 UI 验收；已有安全拒绝继续遵守，不通过其他表面或工具绕过。源码和渲染验证不等于实际视觉验收；没有提交、推送或部署。

# GitTogether 0.3.1 设置页底版本号 QA（2026-10-06）

- IMPORT-12：版本展示已从设置标题移到外观分组后，沿用原材质说明所在的页底层级；右对齐、无分隔线/卡片/图标。页底上下 padding 与标题到账号区共用 22px 变量，清除最后分组的外边距以避免留白叠加。账号及网页授权交互未改动。
- session/encrypted 两种状态的设置实际渲染回归确认页底只显示一次当前包版本、标题仅有「设置」；CSS 源码契约验证共享间距与右对齐。移除的指南、材质、令牌创建、只读及存储说明未恢复。
- strict、43/43测试、4/4静态包装、生产构建及差异检查通过。4173 原 PID 75051 沿用，自动重载后 status/catalog HTTP 200 / ok、版本 0.3.1、账号和仓库均为 0。
- 本轮未新增浏览器或原生 UI 目视验收；遵守已有安全拒绝，不用其他浏览器/协议绕过。渲染和源码测试不等于实际视觉检查。没有提交、推送或部署。

# GitTogether 0.3.0 连接与网页授权 QA（2026-10-06）

- IMPORT-10 的本地连接检查、错误分类、重连、版本提示、instanceId/revision 切换已实现。旧截图报错未复现，当前 4173 status/catalog 均 HTTP 200，服务版本 0.3.0；不把推断的旧服务退出或缓存当作确认根因。
- 用户提供的测试 token 仅一次性只读验证：GitHub 身份与仓库接口 HTTP 200。没有添加进应用、写入文件或输出完整身份/仓库名/凭据，已提醒撤销。未验证全部私有仓库或 SSO。
- IMPORT-11 流程代码已实现：GitHub 网页授权主入口、折叠 token 备用、独立验证码等待弹窗、复制/打开网页/取消/错误重试；Gitea 保持原令牌流程。沿用统一控件和右侧平面分组，原有指南/材质/只读/存储说明未回归。
- 本轮 strict、42/42测试、4/4静态包装、生产构建、Electron bridge 编译通过；覆盖服务协议、节流/并发、拒绝/过期、取消竞争与原子保存、重新授权/多账号、凭据不返回、弹窗被拒绝、链接白名单、前置检查失败不提交令牌、迟到响应与新会话 revision 0。组件渲染与模拟窗口测试不是实际浏览器/桌面 UI。
- 当前没有 GitTogether 自有 Client ID，授权开始明确返回配置缺项，没有伪造授权成功。真实网页同意、应用安装范围、原生打开/钥匙串持久化尚未验收。
- Vite 原进程沿用，配置变更触发自动服务重载；重载前后均无用户账号。浏览器此前被安全策略拒绝，本轮未绕过，也没有 UI 截图/点击验收。没有提交、推送或部署。

# GitTogether 0.2.2 添加账号精简 QA（2026-10-06）

- IMPORT-09 已实现：删除 GitHub/Gitea 令牌创建说明、只读说明、session/encrypted 两种存储说明和桌面图标；表单底部仅保留连接按钮。调整 footer 为右对齐，清理专用/窄屏死样式，未改动必要输入、连接处理器、禁用条件或错误状态。
- 更新设置实际渲染回归：两种存储状态均不出现存储说明。新增源码契约检查：footer 仅有 submit 按钮，令牌创建和只读说明不在组件源文件中。源码回归不是浏览器交互验收。
- 本轮 strict、24/24测试、4/4静态包装、构建和差异检查通过。4173 预览沿用原进程，未因重启丢失浏览器会话账号。
- 上次浏览器访问被安全策略阻止，本次没有尝试绕过；无本轮浏览器截图或目视验收。用户账号、令牌、仓库和安全实现未修改，无提交、推送或部署。

# GitTogether 0.2.1 设置精简 QA（2026-10-06）

- 已实现 IMPORT-08：移除整块使用指南与外观下的材质名称说明，删除专用样式和只用于材质名称的状态/属性；原生桥接就绪检查与实际材质代码保留。
- 新增设置组件实际渲染回归，分别验证 session/encrypted 两种凭据状态。两种状态均仅有账号和外观分组、保留添加账号/颜色方案/减少透明度和必要存储提示，不含指南或材质名称。
- 本轮实际运行 strict、23/23测试、4/4静态包装、生产构建与差异检查，全部通过；不是沿用历史测试结果。
- 4173 loopback 预览已重新启动。浏览器工具读取现有预览时被安全策略拒绝；没有尝试其他浏览器、协议或绕过方案。没有本轮页面截图，实际页面交互和目视尚未验证。
- 未删除账号、凭据、本地关联或仓库；没有 commit、push、部署或本轮原生桌面验收。之前锁屏与真实授权/持久化边界没有改变。

# GitTogether 0.2.0 account import QA

结果：账号导入六项交互实现及浏览器检查通过；原生最新目视/目录选择器/实际钥匙串持久化未验收（Mac 锁屏）。以下测试账号与目录均为本轮临时 fixture，不是内置演示功能或用户真实账号。

- 设置从左下角进入独立页面，账号维度与本地目录维度分离；GitHub/Gitea 服务切换与 Gitea 域名字段实际检查。无头像、REPOSITORIES 标签、全局 Presence/指南、右上角添加仓库、演示场景或 Dashboard 大标题/本地演示行。
- 用 loopback 假 Gitea 服务实际输入无效域名、无效令牌、有效令牌；两个同 host 的账号各读出两页仓库，重复账号得到明确错误。账号只通过设置添加；未关联远端仓库不出现在侧栏中。
- 仓库 popup 先拒绝错误 checkout，再成功关联含空格路径的正确 checkout。侧栏计数/折叠/展开/导航实际检查，仓库图标空心角标表示 Presence 未连接，不虚构在线连接。
- 临时仓库的 Git status、README.md 真实 Diff 与最近 log 显示正确。未跟踪文件没有伪造差异。没有模拟 AI/提交/推送动作。测试后解除关联与移除账号不会删除 Git 文件；随后只删除本轮创建的临时测试目录。
- HTTP 503 时保留上次列表、只影响该账号；重新加载恢复。账号/本地关联筛选、搜索快捷键、弹窗 Escape 和关闭后焦点恢复实际检查。亮暗色与减少透明度均检查，减少透明度时导航 computed backdropFilter 为 none。
- 默认 1201×853、920×640、390×844 检查；修复小视口表格表头隐藏文本绝对定位导致的根页面溢出，最终页面 scrollWidth 不超过视口。920px 保留可读的196px账号导航，表格自身横向滚动。临时 viewport 已重置。
- 最终 strict、22/22测试、4/4静态包装、生产构建通过；控制台 error/warn 为空。静态服务包装不实现本地账号 API，不表示已部署或上线。
- Electron 实际重启，日志报告 native Liquid Glass enabled、renderer bridge connected；Mac 锁屏阻止最新原生截图。没有真实用户令牌，因此真实服务授权/SSO和系统钥匙串持久化尚未验证。
- 交付截图 `artifacts/import-settings-clean.jpg`：同一默认视口的新 DOM 与截图核对，测试账号已移除；浏览器和桌面保持运行。浏览器账号是服务会话存储，桌面实现是系统加密存储，两者不共享账号。

代码执行期间出现外部 WIP checkpoint：`32c96362dd`、`26a0e32e41`（HEAD与本地origin跟踪引用一致）。本轮未主动调用源码仓库 commit/push；不回滚该外部状态，最终文档更新仍为本地修改。

# 历史 GitTogether 0.1.2 design QA

final result: passed

## 2026-10-08 侧栏矩形点击区与选中描线（UI-04-sidebar-icon-buttons-hit-area）

- 最新补充取代上一轮非固定按钮选中仅有底色的表现；保持色板/字体/容器/层级，只把紧凑账号和仓库的完整按钮统一为40×40/12px圆角。默认没有边框或阴影，仓库选中沿整个按钮画1px中性内描线，保留原选中底色；内描线不占布局空间。展开保持172×34的全宽行、8px圆角和9.5px子级内容缩进。账号展开不是选中状态，键盘聚焦另有2px焦点边。
- 隔离生产App/AccountService页面的暗色收起与亮色展开390/769/1201×853均无根横向溢出。收起图标x/y中心误差均0，账号控件40×40无常驻线，仓库未选中shadow为none，选中线亮色#d4d4d8、暗色#505a60。完整侧栏亮暗截图已目视核对，字体和Presence均未移动。
- 点击按钮左内侧6px、图标以外的空白区可打开仓库或折叠账号；Enter/Tab/Space选中另一个仓库后原描线消失。展开/收起和账号折叠保留选中，聚焦描线与选中描线共存。390×400亮色紧凑栏纵滚到222px，scrollbar none且设置固定可达。隔离目录fixture未提供有效远端内容，因此仍显示实际格式错误；仅验证侧栏交互，不声称Git成功。
- 截图：[暗色完整选中侧栏](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-hit-area-selected.png)、[暗色图标栏](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-hit-area-dark-rail.png)、[亮色展开](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-hit-area-light-expanded.png)、[真实主页面](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-hit-area-main.png)。前两轮局部截图切到了品牌行顶部，最终完整截图按实际侧栏bounds x8/y48/196×664重新采集，未编辑像素。
- 新增1项选中边界回归并更新紧凑几何回归；strict、314/314、4/4静态包装和构建通过，差异检查通过。首次回归使用了简写selected而源码是selectedRepositoryId，修正断言后全套通过；fixture首次载入旧dist，构建完成后仅刷新隔离页，再验证新CSS。主/隔离console无warn/error。
- 主页面未执行导航/主题/账号操作，最终保持用户当前的Dashboard、收起侧栏和折叠账号；统计仍1/38/0，CSS热更新的选中规则已读回。主实例fead0bc8-c050-4969-a84e-46b9b8491305不变，主/助手HTTP200同0.8.7，助手configured=true。临时viewport重置，隔离标签关闭、78562服务正常quit，主服务继续运行；不改版本依赖、不重启、不重放凭据、不写Git或打包。仅本次浏览器样式/交互通过，不扩大到真实远端或原生包验收。

final result for UI-04-sidebar-icon-buttons-hit-area: passed

本轮验收范围：UI-04 的容器层级修正，以及 UI-03 统一控件的前端回归。结果只覆盖独立 TS 演示客户端；不表示真实 Git/AI/Presence、AppKit 原生控件或 macOS 27 运行通过。

## 本轮来源、环境与对照方法

- 用户三张截图依次为当前侧栏416×1706、系统设置侧栏476×1904、系统设置整窗1670×2122像素。源图DPR未知，不将设备像素当作CSS像素，也不按跨应用文字/头像/图标做逐像素验收。
- 主对照是整窗关系与左栏边缘：统一底色 → 内缩悬浮导航 → 右侧平面分组。将用户源图和本轮1600×900暗色Repo/生成中截图放在同一次图像输入中检查；亮色亦独立审查。保留GitTogether内容和密度，明确应用内容、纵横比例与参考不同。
- 浏览器为Codex In-app Browser；主截图1600×900，另查920×640/740、390×844，最后重置临时视口覆盖。系统macOS26.6.2，Electron39.8.10，OpenGlass UI0.4.0。
- 无外部占位照片或装饰图；用户个人账号照片/系统设置图标仅是参考，未复制到产品。保留系统字体、Phosphor图标和基于父子数据的Git Graph，不伪造二进制图片或文本Diff。

## 本轮发现与修复

| 级别 | 发现 | 修正与复查 |
| --- | --- | --- |
| P1 | 全局导航贴窗边，缺少悬浮外壳 | 8px内缩、22px圆角、完整细边缘与轻投影；13个场景均检查边界 |
| P1 | Dashboard/Repo用整页立体面板包住工作区 | 外壳透明，共享窗口背景；统计/仓库表与上下文/文件/Diff/表单/详情独立平面分组 |
| P2 | Repo分割列紧贴、文件名被压缩 | 12px组间距、文件列表最低240px；920px内部滚动，提交表单可见 |
| P2 | 批量栏仍继承库inline阴影，CSS未覆盖 | 用公开style设纯填充、boxShadow:none、borderWidth:0、blur:none，关闭该自有类光泽；重拍01–04、复查computed值 |
| P2 | 窄栏预览traffic lights贴边 | 缩小间距/内边距；920px三个按钮均严格位于侧栏内部；原生按钮随窗口宽度调整位置 |
| P2 | 新工具栏border简写与库borderColor触发React警告 | 改为borderWidth；最终浏览器错误日志为空，重新类型检查/测试/构建通过 |

上述本轮发现均已关闭，无已知未解决的前端层级问题。

## 本轮审查结果

- 字体/层次：系统字体，导航13px、文件12px、Diff11px；标题/正文/路径可区分，没有人为缩小以掩盖布局。来源是结构参考，未声称与系统设置字体逐像素一致。
- 布局/间距：左栏独立悬浮；桌面Repo各主要内容组 computed shadow/filter/border 为 none/none/0。1600px侧栏x/y=8、底部8px；920×640表单底部632px，固定控件可达；390px内缩6px、横排上下文与纵向内容，页面无水平溢出。
- 材料/色彩：暗色导航更深、内容稳定；亮色共享灰底与白色平面组。减少透明度关闭模糊且保留外边距/圆角，内部行分隔仍清楚。右侧内容不使用光学投影或玻璃折射。
- 内容/状态：00–12实际逐个打开并截图审查，包括批量部分失败、AI生成中表单禁用、成功明确“未推送”、失败保留输入与选择、Graph/Tree与收起详情。09首次截图落在生成完成后，重新实际触发生成后捕捉正在生成状态，未把完成截图冒称生成中。
- 交互/可访问性：实际点击Split、文件夹、收起详情、Commit预览；检查菜单方向键/Escape、设置Escape后恢复到打开按钮、Cmd+K聚焦搜索。实际失败提交后Summary和3个文件选择仍保留；恢复失败开关和空白草稿后交付。不是完整WCAG或所有快捷键重新认证。
- 源码验证：最终 `npm run check`、11/11业务测试、4/4静态服务测试、生产构建和 `git diff --check` 通过；没有部署。

## 本轮截图与运行边界

可信视觉证据：`artifacts/hierarchy-scene-00.png`–`hierarchy-scene-12.png`，`hierarchy-after-repo-light.png`、`hierarchy-after-repo-dark.png`、`hierarchy-settings-dark.png`、`hierarchy-repo-920.png`、`hierarchy-repo-390.png`、`hierarchy-settings-390.png`、`hierarchy-dashboard-920.png`。截图逐张目视检查，批量栏修正后01–04重新采集。

前段实际Native AX和截图 `hierarchy-native-current.png` 确认了悬浮导航和平面内容。最后桌面重启日志确认原生材料/renderer就绪，但Mac随后锁屏，最新桌面截图和原生最小尺寸尚未复查。最后恢复默认视口后的截图出现与同期DOM不一致的旧帧，`hierarchy-final-preview.png` / `hierarchy-repo-920-final.png` 不作为新验收证据；交付采用已核对的1600px截图，不冒称最终默认视口截图已通过。

临时视口覆盖已重置，浏览器回到scene=08的文件Diff，预览与桌面进程保持运行。未执行真实Git/AI/Presence、读取凭据、代码commit/push或远端部署；旧MAIN未修改。本轮只改变视觉容器/材料及窗口按钮位置，业务模型和存储结构不变。

# 历史证据：0.1.0（以下不是本轮重跑结果）

保留首次交付的记录用于追溯；本轮范围、截图及验证限制以上文为准。

## 对照与环境

- 设计来源：用户 ZIP 的原生 draw.io、Notes、00–12 预览。主对照为 p01 / p06 / p08；全部页面都实际打开并截图。
- 浏览器：Codex In-app Browser；主对照 1600×900，窗口适应检查 920×740、移动视口 390×844。临时视口覆盖在交付前重置。
- 系统：macOS 26.6.2，Electron 39.8.10。native Liquid Glass 与 renderer IPC 就绪均由运行日志确认。
- 主题：系统字体与 Phosphor 图标。导航/控件玻璃、稳定内容材料，是用户明确要求的新视觉，不把线框白蓝主题当成逐像素外观约束。
- 原始图片没有产品插图，未添加装饰性 CSS/SVG 画作；SVG 仅用于由 commit parent 数据驱动的技术关系图。二进制/图片资产没有原内容，界面只显示说明，不伪造预览。

## 发现、修复与复查

1. 玻璃库默认 100% 高度撑大统一工具栏，且内容内部默认块布局。设置自适应高度并给内层明确的 flex 排列；复查 p01/p03/p05 与 segmented 控件通过。
2. Dashboard 的收缩 section 和大行高使底部行/页脚重叠。改为不可收缩的内容、44px 仓库行和自然纵向滚动；1600×900 折叠状态可见 8 个仓库。
3. 没有选中文件时，folder 的 undefined id 错误匹配，导致所有文件夹呈蓝色。匹配条件限定为实际文件；复查 p07，无文件时 active 数量为 0。
4. 原次要文字与错误色偏浅；加深语义 token 与占位文字，保留亮暗色 focus ring，减少透明度关闭内部滤镜。此次不是完整 WCAG 认证。
5. 场景切换可能留下旧任务和局部筛选状态。增加 generation 隔离、取消旧任务和视图重挂载；切换后无旧执行结果覆盖。
6. URL 场景初始化可能覆盖持久草稿。以 lastScene 区分显式载入与同场景刷新；通过真实刷新确认概要与选择仍保留。
7. 开发热更新增加自定义 Hook 时出现一次旧 Hook 顺序错误。重新载入恢复，并明确 App 的 refresh reset。最终重新载入后的浏览器错误日志为空。

## 必查视觉面

- 字体/图标：系统字体层次稳定，仓库/文件主文字为 11px；路径与图表辅助字为密集信息，不与标题争夺层级。单一 Phosphor 图标体系，无缺图。
- 间距/布局：全局仓库入口、branch/worktree 导航、中央文件与 Diff、底部表单、右侧 Graph/Tree 的顺序与线框一致；收起详情释放中央宽度。
- 材料/色彩：玻璃集中在导航、操作组与菜单。文件内容不透明；Get Latest 青绿、Submit 紫、Commit 蓝，状态同时提供文字/图标。
- 响应式：920px 保留可用三栏，Diff 必要时上下排；390px 使用图标导航、横排上下文、纵向内容。桌面窗口最小宽度 920px；移动仅为浏览器 fallback。
- 图片/内容：没有外部占位插图或假图片预览；所有 Git、AI、Presence 数据明确标注演示。Commit 成功始终说明“本地、未推送”。
- 交互/可访问性：原生语义按钮、带名称的 checkbox、indeterminate、焦点圈、弹窗焦点约束、Escape、Cmd+K、Cmd+Enter、减少动态效果；菜单与禁用/生成/成功/失败状态完整。键盘快捷搜索已实际验证。

## 结果

- 11/11 domain 测试，4/4 静态服务测试，TypeScript strict 与生产构建通过。
- 33/33 浏览器断言通过：00–12 场景、AI 覆盖确认与取消、失败保留、成功删除选中项并更新 Graph、详情折叠、减少透明度、搜索、来源空态、统计筛选、11 worktree 选择、Commit 预览、未检出分支边界、添加演示仓库/分支/worktree、Graph 详情、Split Diff/复制、Cmd+K、单项取消、场景复位、刷新存储。
- 额外人工点击验证：3 项 Submit 分别 1 成功 / 2 失败；Lebab 本地 commit 保留且未 Push，Must Be Human 因冲突阻止；其他工作目录隔离，二进制资产不显示文本 Diff。
- 图像证据保存在本地 `artifacts/scene-00.jpg`–`scene-12.jpg`，最终 Repo 截图为 `artifacts/repository-diff.jpg`，窄窗口为 `artifacts/repository-920.jpg` / `repository-390.jpg`。

## 验证边界

锁屏阻止了 native app 的 AX/屏幕目视检查；原生系统视图启用由模块与 renderer 就绪日志确认，不把它当成桌面视觉验收。macOS 27 未运行。没有执行真实 Git、读取凭据、调用在线 AI、连接 Presence、代码 commit/push 或远端部署。旧 MAIN 工作目录保持 clean。

## 独立 macOS 包复核（2026-10-06，IMPORT-07-package）

- macOS 26.6.2 / arm64，两轮0.4.0原生应用加载包内file页面、设置与内置服务可用，nativeGlass=true；不依赖4173。没有连接或保存真实账号，本轮不是钥匙串持久化验证。
- 经应用自身调试UI调用实际preload/IPC，观察macOS系统目录窗口，取消返回null，选择本项目目录精确匹配true；没有调用关联保存或Git写操作。验证面板已关闭，第二包留在正常设置页。
- 最终第三包包含账号编辑修正、设置全宽、文件树胶囊轮廓；源码摘要与当前输入一致，native main/preload与已测包字节相同。签名/ZIP/内容检查通过，149/149测试通过；再次启动时Mac已锁屏，未绕过，最新包的原生界面再次复核仍等待解锁。
- 已实测第二包的正常界面与系统窗口截图在 `_builds/gittogether-0.4.0-macos-arm64-PMMf1g/desktop-native.png` 和 `desktop-picker.png`（项目容器目录）。最终包在 `_builds/gittogether-0.4.0-macos-arm64-7QUMia/`，不是截图中的第二包。
- 没有Developer ID/Apple公证、macOS27、真实授权/远端内容或真实本地关联的新验收。

## 授权回调等待状态（2026-10-07）

- 隔离测试回调在远端响应未结束时已呈现「正在完成 GitHub 授权」、状态文字和返回按钮，页面不是空白；history 已清除查询参数，截图为 `github-callback-progress.png`（本任务可视证据目录）。测试数据不作为真实 OAuth。
- HTTP 流回归验证成功/失败追加结果与 nonce CSP；原无效回调、取消和凭据隔离回归通过。关闭测试服务后错误页触发浏览器工具策略拒绝，没有绕过；最终状态目视不据此验收。
- 用户重新配置后，真实应用按钮进入「等待 GitHub 授权」，没有本机连接错误，截图为 `github-system-network-waiting.png`。最终 GitHub 同意由用户完成，用户确认成功，服务核对为 GitHub38 + Gitea20仓库，原实例保持。
- `github-oauth-connected.png` 显示用户已进入新 GitHub 仓库并在侧栏看到38仓库，授权弹窗已关闭；该截图另有此前已登记的远端内容接口未更新提示，不能将本次账号目录导入称为分支图/内容读取或主服务所有功能已接通。
- 随后00:42–00:47主预览4173停止监听、PID75051退出。只读查看「sol_app」当前任务确认这是用户另行允许的远端内容接入/重启，任务实际停止主进程；4174授权助手仍在线。没有把停止前的2账号/58仓库快照当作新实例当前数据，没有自行启动第二份主服务或重放账号授权。

## 品牌行侧栏开关与图标列（2026-10-07，UI-04-sidebar-collapse-rail）

- 最新反馈取代此前隐藏整栏：展开按钮位于 GitTogether 名称右侧，顶部只有红绿灯；收起保留56px浮动图标栏，品牌身份隐藏而同一个按钮保留。公开控件和19px导航图标共用中心线，设置入口固定在底部，文字隐藏但按钮仍有名称和提示。
- 当前769×853设置页热更新后原表单和测试输入未丢失；Enter收起、Space展开均保持按钮焦点和表单值，测试后恢复原空值。红绿灯全屏按钮仍在x=60/y=18，品牌开关展开在x=163/y=63、收起在x=22/y=63；品牌图标在收起时没有布局矩形。
- 隔离生产App验证账号折叠跨全局开关保留、图标列可打开仓库/Dashboard/设置；仓库选择src/app.ts和docs目录收起状态跨开关保留，Presence角标跟随图标。没有触碰真实账号或写入用户Git；隔离Git未改变，退出后已清理。
- 390×844、920×640、1201×853均实测两态：收起56px，展开196px，品牌与按钮不重叠，没有根页面横向溢出，设置入口可见。临时尺寸覆盖已恢复。当前页及隔离生产页console warn/error为空。
- strict含QA入口、181/181测试、4/4静态包装、生产构建和差异检查通过。原0.5.0服务PID23078及实例c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1未变，catalog仍为0账号/0仓库/0关联；没有重启或改版本、授权和凭据。原生源码布局共享，但没有运行验收旧桌面包或重新打包。
- 当前页的展开/收起完整截图为 `/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/sidebar-brand-expanded.png` 和 `sidebar-brand-collapsed.png`；截图中的既有授权助手版本提示不属于本次侧栏变更，也没有在本次被处理。

## 红绿灯可见尺寸（2026-10-07，UI-04-traffic-light-size）

- 旧Phosphor圆形图标框为12px，但路径只覆盖208/256，实际圆点直径9.75px。浏览器改为直接填充12×12px圆形，不再让图标内留白缩小圆点；颜色、8px边缘间距和全屏行为保留。
- 当前769×853设置页实测三个圆点矩形x20/40/60、y18、直径12px；收起到56px栏、再展开后位置与尺寸不变，连接表单、空名称、页面与按钮焦点保持，没有页面横向溢出，console无warn/error。未刷新或重启服务。
- strict、182/182回归、4/4静态包装、生产构建与差异检查通过。原服务PID23078、实例c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1、版本0.5.0和catalog0账号/0仓库/0关联不变；既有授权助手版本提示保留。
- 原生仍使用系统窗口按钮，没有改Electron坐标或绘制网页副本。Finder AX与截图区域不一致，原生实际像素比较未可靠完成；不把浏览器验收当成原生或macOS27验收，不重打包旧本地应用。
- 完整当前页截图为 `/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/traffic-lights-corrected.png`；保留品牌和窗口上下文的顶部裁切为同目录 `traffic-lights-header.png`。

## 仓库三栏独立收起（2026-10-07，R-05-column-collapse）

- 分支图、更改与Diff、文件树各有独立的公共静默图标按钮；默认展开标题同为44px。每栏收起为44px窄栏，保留竖排名称和展开按钮，平面材料不增加阴影；其余展开栏自动扩宽。
- 当前真实用户仓库agent-done、769×853暗色预览，按1→3→2→6→7→5→4→0（分支图/更改/树对应位1/2/4）逐个键盘操作，全部8种组合可达、没有根横向溢出，收起标题填满栏高；Enter/Space保持原按钮DOM与焦点，名称和aria-expanded正确变化。灰码循环中的提交选择、3个远端禁用输入和远端树来源逐字段比较均保持。热更新前后用户另行选中merge提交，不把它误报为布局丢失选择。
- 独立真实临时Git的亮色6任务预览：main、task/search填入不同草稿，选本地src/app.ts显示值0→10的实际Diff，收起main的docs目录并选择本地来源。三栏全部收起时辅助树只有三个标题与展开按钮；再用Space展开，两个草稿、文件选择、全部目录状态及本地来源逐字段比较完全一致，跨既有心跳也保留。没有连接真实账号、改动用户Git或启用Commit；关闭QA页后临时Git退出报告HEAD/index不变、测试仓库已清理。
- strict、191/191测试、4/4静态包装、生产构建与差异检查通过，主页面与隔离页面console无warn/error。主预览未刷新或重启，版本0.5.0、PID23078、实例c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1保留，最终catalog为1账号/38仓库/0关联。已恢复当前工作台全部展开、横向位置0。
- 当前用户仓库完整截图为 `/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/repository-columns-collapsed.png`（分支图和树收起、更改栏扩宽）及同目录 `repository-columns-expanded.png`。浏览器验证不等同原生包或macOS27验收；没有改版本、打包、Git提交/推送或发布。

## 历史详情移入中栏（2026-10-07，R-05-history-details）

- 左栏只有历史图，不再附加提交详情；中栏对应任务底部用原平面排版显示选中提交的说明、作者、时间和完整SHA。输入与Commit在历史模式隐藏，原composer保持挂载，取消选择恢复原输入。选中时移除远端任务顶部重复摘要；并行任务移除的远端文件预览没有恢复。
- 当前真实agent-done、1280×720亮色预览：Enter选择48d8c769后，main卡片底部显示完整合并说明、Taobe、2026/3/12 09:48:46与完整40位SHA；图底部详情数量0，聚焦main后可见composer数量0。再次Space取消，原输入重新可见，详情数量0；再选后恢复正确详情。显示的说明没有省略，沿用现有summary数据，不声称新增commit body读取。详情底部700px、宽约416px、scrollWidth=clientWidth、box-shadow=none。三栏按钮与文件树保留。
- 独立真实临时Git的6任务浏览器：main/search输入不同草稿、选择src/app.ts后聚焦本地main；选Document workspace layout后输入不在辅助树、DOM中的原草稿仍在，历史信息位于中栏，工作目录Diff与文件选择保留。中栏Enter收起/Space展开保持详情；再次Space取消提交选择恢复原草稿。显示全部任务后两份草稿逐字段不变；亮暗色均保留状态，warn/error为空。该工作目录Diff仍是未提交内容，不冒充历史Diff。
- 新增5项组件/样式回归，strict、200/200测试、4/4静态包装、生产构建与git diff --check通过。窄视口覆盖未作用到本次详情标签（实际仍1280×720），因此仅确认换行样式回归，不声称新详情的窄尺寸视觉验收；临时覆盖已reset。隔离标签关闭、测试服务退出，报告HEAD/index未变和临时仓库已清理。
- 主服务PID23078、0.5.0、实例c24d4f14-3f2a-4504-a9e5-32ec0a0f25d1、1账号/38仓库/0关联及授权助手PID31840保持。原用户页在并行热更新期间观察为Dashboard，本轮没有重新加载它；实际仓库验证在独立标签进行，不声称原热更新前仓库选择已保留。结果截图：`/Users/taobe/.codex/visualizations/2026/10/06/01a1103e-9b92-79b3-8d62-61e3c65dc3a2/history-details-middle.png`；本地暗色隔离截图为同目录`history-details-local-dark.png`。未原生打包/验收，未Git提交/推送/发布。

## 最新：JetBrains 外围与内嵌卡片（2026-10-08，0.8.6，IMPORT-18-shell）

### Findings / 对照迭代

1. [P1，已修复] 用户指出只换 Dashboard 控件、仍保留玻璃浮动导航与整页大外壳，缺少附件的「外围包住内部面板」关系。位置为 App / Dashboard。取消侧栏玻璃、阴影和旧22px圆角，使用官方 Ring 主题的不透明外围和8px内嵌导航/统计/仓库面板；工具行和统一七列表格共用一个面板，Dashboard 本身透明、没有大外壳。完整对照中保留8px外围/间隙，外框可在面板之间连续看见，卡片不再叠加悬浮效果。
2. [P2，已修复] 390×650 的旧6px外框断点会让红绿灯及面板偏移2px，不符合固定控制条与统一边距契约。第一次手机菜单证据 `dashboard-ring-shell-phone-menu.png` 中首点x18/y16。具名 `.app-frame.ring-app-frame` 固定 `--window-inset: 8px`，同尺寸、暗色、56px图标栏、滚到最后一行并打开原操作菜单复拍 `dashboard-ring-shell-phone-final.png`：三个圆点矩形x20/40/60、y18、12×12px，侧栏x8/y48/w56。DOM与前后图共同确认修复。该发现时暂为blocked；修复后再次将源图、最新完整暗色实现和手机前后证据放入同一比较输入，后又用归一化源图+最新亮暗截图复核，无待修P0/P1/P2。

### Source、截图与归一化

- 原视觉来源：`/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/codex-clipboard-8949b57a-7ca2-4d7f-9584-49d0d1b70ea8.png`，2480×1300px。只按用户明确要求比对外围/卡片关系，功能、账号、仓库内容不复制参考 IDE 的会话、编辑器、应用列表、图标工具条或底部状态栏。
- 原图实际DPR与CSS视口未知；按2x密度推定做50%等比例副本用于关系对照，未把该推定称为实测DPR或像素级克隆。副本 `/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-ring-shell-reference-normalized.png` 为1240×650px。实现明确CSS视口1240×650、截图1240×650px、实测截图密度1x；无额外浏览器/设备框架。
- 最新实际生产App暗色：`/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-ring-shell-dark-final.png`；亮色：同目录 `dashboard-ring-shell-light-final.png`。两者1240×650，搜索为空、过滤全选、菜单关闭、表左端/页面顶部，导航展开；数据来自隔离AccountService和实际HTTP，2账号/7仓库/2不可用本地路径，行内明确「隔离筛选验证，不是你的仓库」。自动检查对目录作正常排序，不能把排序时的行序变化当作筛选状态丢失。
- 响应式补充：`dashboard-ring-shell-narrow-menu.png` 为769×853；`dashboard-ring-shell-phone-menu.png` / `dashboard-ring-shell-phone-final.png` 均390×650、暗色/收起栏/操作菜单打开。手机图是浏览器窄窗口回退，不是原生移动应用或截图中的 IDE 手机版。
- 当前真实主预览空态：`/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-ring-shell-current-preview.png`，恢复默认视口1235×954、亮色、0账号/0仓库/0关联。不是合成目录，不为让截图填满而连接或写入用户账号。
- Full-view comparison：源图与第一次1240×650暗色截图同一输入观察；修正手机边距后，源图、最新暗色及手机前后图在同一输入复核；最终1240×650归一化源图和同尺寸最新亮暗实现再次放入同一输入。源图与实现的应用内容/auth状态不同是预期产品范围，评价限于包围层级、平面材料、导航/内容间隙及控件密度，避免虚假精确度。
- Focused regions：本次要核对的面板边缘、圆角、间隙、导航行与工具行在1240px完整对照中足够清楚；固定圆点、56px栏及菜单边界在390px全图清晰可读，并有对应DOM矩形核对，无需另外放大裁切，也不从源图小字推断未确认的字体型号。

### 五个必查面

- Fonts / typography：官方Ring系统字体与既有系统回退，导航品牌14px、导航主字保持原尺寸、工具/表12px、次行11px、统计28px/500；实际中文与英文都可读。仓库名/路径按既有规则截断且有完整可访问名称，主体不复制参考会话文本或编辑器等宽排版；中性搜索焦点保留，菜单/checkbox键盘焦点可见。
- Spacing / rhythm：外围/面板间距8px、导航196px或56px、顶部控制条32px+8px间隔；统计独立8px卡片，工具行12px内缩、28px控件，表头36px/行56px。暗色导航与表连续到底部，不留旧纸面外围或额外分割统计条；窄窗统计变2列，表保留880px内部横滚而不是挤掉七列，菜单落在视口内。
- Colors / tokens：官方外围亮色247/248/250、暗色43/45/48；内容卡片亮色255/255/255、暗色30/31/34，实测无blur/shadow。减少透明度开启仍是同一不透明卡片；未把Ring语义颜色注入整个app-content，设置账号组暗色仍为原OpenGlass 43/48/51。错误/链接/选中使用官方语义颜色，不以颜色单独代替状态文本。
- Image / asset fidelity：范围不需要新增照片、插图、纹理或参考图会话logo；保留实际Phosphor导航/文件图标与GitTogether品牌，官方Ring控件，无占位资产或装饰性仿制图。原生仍保留系统红绿灯，不画新副本；已有浏览器窗口预览仍遵循原尺寸契约。
- Copy / content：保留应用自身账号、搜索、来源、目录状态、空态和失败消息；不把用户评论或参考图中的执行指令加入UI。合成仓库清楚标记，不宣称真实provider内容或Git写操作成功；Git四项继续禁用并说明未接入。

### 交互与验证

- 搜索shared得到1行；收起/展开均保留查询、相同按钮DOM与焦点，清空恢复7行。Ctrl-K可从收起栏聚焦实际搜索输入。
- 官方账号菜单方向键打开、End选择同名Bob身份得到2行，Escape/选择后关闭并恢复触发器焦点；账号全选恢复7行。仓库菜单连续取消本地、Original、Added得到2个远端Fork，连续勾选不关闭，恢复并Escape正常。组织/账号/位置/类型仍用原筛选状态和自动检查路径。
- 两组仓库操作四个Git入口禁用、工作台/配置可用；配置仍打开原「配置本地仓库」弹窗并可取消，不调用保存或系统授权。设置仍可打开，颜色偏好通过真实设置控件切换。
- 769×853根无横溢出，内表549/880px，操作菜单右764/下844在边界内；390×650根390px、表310/880px，实际横滚570px、页面纵滚107.5px，公开按钮仍可达。文档、页面、表与侧栏均`scrollbar-width:none`，没有禁用内容滚动。
- 严格类型检查、313/313完整测试、4/4静态包装、生产构建、差异检查通过。新增两项断言限制外围主题/卡片/8px边距及工具行+七列表格的同卡片结构。最终隔离页console error/warn为空，主页重载后的新error/warn为空。
- 0.8.6版本同步前已核对主实例74ccf3f5-f8cf-4fe3-910b-a04ee98091c0、目录0/0/0且没有活动弹窗或授权流程，先热更新再按既有测试就绪授权重启自有统一开发入口。新主实例b0b6c04c-c098-44c7-846b-2ef7dd1297f7与授权助手均HTTP200/0.8.6，目录仍0/0/0，助手configured=true并恢复加密应用配置；不声称实例未变，也没有读取/重放账号凭据。
- 临时隔离服务正常退出、测试标签关闭、viewport覆盖清除；4173主预览与4174依赖保留运行，主标签留给用户。未重打包/替换原生应用，未真实账号/关联验收，未对用户仓库执行Git写操作、提交/推送或线上部署。

### Implementation checklist / 结论

- [x] 外围/卡片层级、主题范围与五个必查面已核对。
- [x] P2手机边距修复后同状态复拍并完成联合比较。
- [x] 主交互、窄窗可达性、自动回归和最终控制台已检查。
- [x] 本机测试依赖恢复并留开，隔离验证已清理。
- Open questions：用户对新层级的视觉接受待反馈；参考图没有对应亮色/空态，这是基于同一官方令牌体系的补充检查，不声称有源图逐像素验收。
- Follow-up polish：无阻断性P3任务；未扩展为整个应用内部控件迁移。原生运行验证和重新打包不在此轮范围。

final result: passed

# H5 侧栏背景与卡片层级 QA（2026-10-08，UI-07）

- 参考图：`/var/folders/x1/nj8gw6sj3tz36zt026sy8h2m0000gn/T/codex-clipboard-5955f072-0671-4712-8b70-d6af7d05cb77.png`，原图 2660×1540px（用户消息中缩放展示为 2048×1186px）。目标是 GitTogether 首页与仓库页的整体层级，不复制截图里的其他产品文案或工具项。
- 实现范围：只给非桌面 H5 预览增加连续背景上的透明侧栏，以及首页统计/仓库列表和仓库页顶部信息/三栏内容组的细边缘与轻阴影；不改变 Electron 材料、数据、交互、侧栏手动收起和仓库三栏的窄窗横向滚动行为。
- 自动验证：`npm run check` 通过；`npm test` 310/310；`npm run build` 通过并生成 client、worker 与 hosting metadata；`npm run test:sites` 4/4；`git diff --check` 通过。现有 4173 预览 HTTP 200，Vite 返回的样式模块包含 H5 规则；未重启预览或账号服务。
- 目视证据：实现截图未捕获，视口、页面状态和设备密度未记录；H5 首页/仓库页的五个保真面（字体、间距布局、颜色令牌、图片资产、文案）及主要交互未作浏览器实测。Codex 本机浏览器安全策略拒绝检查 `127.0.0.1`，现有标签也不可读取；没有尝试其他浏览器、Playwright 或协议绕行。HTTP 200、构建和源码测试不替代截图对照。
- 比较：无法把参考图与同视口实现截图放在一起比较；Focused region 比较同样未进行。当前没有足够视觉证据列出或排除 P0/P1/P2 差异，需用户复核预览并补充可见截图后完成。
- 原生应用未打包/替换，未提交、推送或部署，未触碰账号凭据或 Git 写操作。

final result: blocked

## 2026-10-08 OpenGlass 回退（IMPORT-18-revert）

- 用户要求撤回 Ring UI 试用，恢复0.8.4外观；此次新交付版本0.8.7。四个入口/组件与HEAD b5ce18cb0e逐字节一致，依赖和样式入口不再包含Ring；试用文件已移出运行目录并备份，当前设计已另行归档。
- 基线 strict、307/307测试、生产构建、4/4静态包装、git diff --check通过。并行变更出现后再跑 strict、310/310测试通过，但不据此接受另项视觉试验。
- 隔离生产App仍为2个合成账号/7仓库/2关联，截图保留原悬浮侧栏、平面统计/统一表与表外工具行。亮暗外观、搜索fork得到2项/清空恢复7项、同名访问账号选择bob得到2项/位置仅远端得到1项、原两组操作菜单（4项Git禁用）、原目录弹窗取消、设置0.8.7和侧栏收起/展开完成。
- 769×853收起栏56px；表视区641px/内容840px。769×480访问最后一行操作后，内部横滚199px、页面纵滚217px；两轴scrollbar-width=none，根无水平溢出。QA console无error/warn，临时viewport恢复，隔离标签/服务正常退出。
- 预览在版本热更新时主服务自动变为0.8.7、助手仍0.8.6；确认主目录0/0/0和无活动弹窗后按已有测试授权重启自有统一入口。最终主实例fead0bc8-c050-4969-a84e-46b9b8491305，主/助手HTTP200同0.8.7、configured=true。主页面设置版本匹配，未修改用户主题或授权配置。
- 主页console留有14:20:23移动Ring文件触发的两条旧HMR错误；统一重启/重载后未观察到新错误。实际空态截图为dashboard-openglass-restored-current.png；隔离亮/暗截图为dashboard-openglass-restored-light.png和dashboard-openglass-restored-dark.png，均位于项目容器_builds/qa，不是实际用户仓库。
- 收尾时发现并行UI-07 H5试验已写入styles.css、AGENTS/DESIGN/REQUIREMENTS和独立测试，使浏览器侧栏透明、主要内容加边缘/阴影；我没有写这些样式，也没有覆盖。四个回退文件仍等同基线。上面的生产截图早于该试验，不能代表当前浏览器已完整恢复原外观。
- 用户随后进入真实GitHub授权等待弹窗；不取消、不导航、不再重启。主预览保留，真实授权结果未代验。
- Ring UI回退代码与基线检查已完成；当前外观与原版本完全一致的验收因并行H5覆盖而待用户选择。未提交/推送、原生打包、生产发布或真实远端新验收。

final result: Ring rollback verified; exact live appearance awaits the user's choice about concurrent UI-07.

## 2026-10-08 侧栏图标按钮（UI-04-sidebar-icon-buttons）

- 范围：用户明确要求只借鉴附件侧栏的按钮形态，保持应用整体设计。当前H5透明导航/卡片与原生外壳规则保留，不对参考图的主内容、棕色色板或额外入口做复刻；不是前述H5整体风格或Ring完整恢复的验收。
- 原参考图与最新真实主页面截图在同一次比较输入中打开，检查整体侧栏和按钮近处。用户页为849×853暗色、当前1账号/38仓库/0关联；最终截图：[真实主预览](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-icon-buttons-main-dark.png)、[展开与键盘聚焦](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-icon-buttons-main-expanded.png)。
- 隔离生产App由现有AccountService/HTTP承载，2个合成身份/7仓库/2不存在的测试路径，不使用用户账号。截图：[亮色图标栏](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-icon-buttons-qa-light.png)、[390px展开](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-icon-buttons-qa-light-390-expanded.png)、[暗色选中文件夹](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-icon-buttons-qa-dark-selected.png)。最后一图的远端格式错误是此目录fixture不提供Git内容的真实错误反馈，未伪造成功，不作为远端功能验收。
- 字体/文字：沿用系统13px导航，展开后保留名称与长名截断，收起不挤入文字；原title与可访问名称保留。文案/内容：没有引入参考应用的Rules/History等入口，原Dashboard/设置/账号/仓库含义不变，图标装饰不重复朗读。
- 间距/布局：收起栏56px，三个常驻按钮40×40、12px圆角、1px细边，同一中心；文件夹40×34点击区域的19px图标中心偏差0，无常驻边框。展开按钮槽32×32、10px圆角，补偿内边距后Dashboard中心与账号箭头同列，仓库保持9.5px子级缩进；品牌与开关不碰撞。保留上下常驻入口和独立可滚动账号列表。
- 颜色/令牌：使用原strong-line、muted、selection、blue、surface-hover；不使用参考图棕色/青绿色。亮暗模式中的边缘、选中和焦点可辨，参考配色差异属于用户明确允许的保留设计。
- 图片质量/图标：没有需要复刻的图片资产；全部沿用已有Phosphor标准矢量与Presence状态点，无自绘图标/位图缩放。19px图标无拉伸，轮廓和中心一致。
- 交互/响应式：390/769/1201×853两态均无根横向溢出、开关/设置可达；Enter展开、Space收起保留焦点，Dashboard与设置操作可用。隔离账号折叠后保留另一个账号的2仓库，侧栏展开后账号折叠状态仍保留；搜索fork的2行在收起后不丢失，点击对应仓库显示原工作区并选中无框文件夹。390×400侧栏scrollTop从0到160、scrollbar-width为none，设置仍固定可达。
- 新增3项回归；strict、313/313测试、4/4静态包装和生产构建通过，差异检查通过。主/隔离console检查无error/warn；临时viewport已重置，隔离标签/服务正常退出，真实主预览保持运行和保留。
- 主API与助手HTTP200同0.8.7，实例fead0bc8-c050-4969-a84e-46b9b8491305和1/38/0目录不变。没有服务/凭据/授权重启、Git写操作、提交/推送、部署或原生打包；原生源码样式已共享但旧安装包未更新。
- 比较历史：首轮实现与附件侧栏对照没有发现本次范围内的P0/P1/P2差异，未进行截图后的二次视觉修补。参考应用入口数量、原字体/色板、展开模式和保留状态点均是明确的产品范围差异，而非遗漏。

final result: passed

## 2026-10-08 收起侧栏不放大矩形（UI-04-sidebar-icon-buttons-shared-size）

- 根据最新明确反馈，删除40px/12px收起覆盖，两态直接共用32px/10px图标框令牌。紧凑常驻按钮本体也32×32并与装饰框同圆角，不保留40px外部点击区；仓库/账号也32×32，默认无描线、选中整块内描线。19px图标、56px栏宽、展开文字/34px全宽仓库行/9.5px缩进和原配色不变。
- 实际主页面仍为用户当前的收起Dashboard/折叠账号，主按钮和装饰框全部32×32；没有主动切换主页面、主题或账号展开。隔离生产App的亮色1280px展开→收起后，两个常驻框、开关/账号/仓库尺寸32×32、圆角10px，文件夹中心误差0，选择fork保持。展开仓库172×34不变。
- 暗色390×853同尺寸且根溢出0；32px选中仓库仍显示1px中性内描线与2px键盘焦点。390×400纵滚134px、scrollbar none，设置仍固定可达；Enter/Space收起和仓库导航正常。测试目录的原远端格式错误未伪造成成功，本次仅侧栏尺寸/交互验收。
- 截图：[实际主预览](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-shared-size-main.png)、[隔离32px图标栏](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-shared-size-32.png)。实际主截图已目视检查，描边/中心/颜色清楚，外部红绿灯与背景不变。
- 尺寸回归改为明确禁止紧凑态另设size/radius覆盖。strict、314/314、4/4静态包装、构建与差异检查通过；发现常驻外层仍沿用8px圆角后同步到共享10px，局部4/4及新构建再次通过。console隔离无warn/error，主服务/助手HTTP200同0.8.7，实例fead0bc8-c050-4969-a84e-46b9b8491305、1/38/0及助手configured=true保持。
- 临时viewport重置、标签关闭、自有91098服务quit退出；主预览保留。不修改版本配置或重启账号服务，不读取凭据、不执行Git写入、提交/推送、部署或原生打包。旧40px验收作为历史记录，当前尺寸以本条为准。

final result for UI-04-sidebar-icon-buttons-shared-size: passed

## 2026-10-08 侧栏展开仓库零缩进（UI-04-sidebar-icon-buttons-no-indent）

- 把全局侧栏专用level-indent令牌从9.5px设为0，沿用原逻辑内边距。文件夹及名称与账号对应列对齐；全宽34px行、选择描线、Presence和折叠行为保持。工作区文件树未修改，32px紧凑按钮及原色板不变。
- 隔离生产App亮色1280px展开的7仓库，相对其所属账号图标中心与名称左边的偏差均为0，行172×34。Enter选中fork、Space收起/Enter展开，账号Enter折叠/Space展开后选中仍在；紧凑栏56px、按钮32×32、图标中心误差0，原1px内描线保留。暗色390×853展开同样7行偏差0、根溢出0。
- 最终[暗色同列侧栏截图](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-no-indent.png)已目视检查，账号/文件夹中心线与名称左边一致，品牌/常驻框/选中轮廓不变。此图是独立目录fixture的侧栏交互证明，不是用户真实Git内容验收；原远端格式错误仍如实保留。
- 已更新层级回归为零缩进；strict、314/314、4/4静态包装、生产构建与差异检查通过。隔离console无warn/error，临时viewport重置，标签关闭，51400服务quit退出。
- 主页面保持用户当前收起Dashboard/折叠账号，仅只读确认热更新令牌0px，不主动操作主导航或账号。主/助手HTTP200同0.8.7，实例fead0bc8-c050-4969-a84e-46b9b8491305、1/38/0及助手configured=true不变。前端热更新未改版本配置、重启、读取/重放凭据、Git写入、提交/推送、部署或原生打包；历史半图标验收保留为旧规则。

final result for UI-04-sidebar-icon-buttons-no-indent: passed

## 2026-10-09 Dashboard 逐仓库分支行（IMPORT-13-branches）

- 范围：依照本次明确要求移除独立默认分支列，保留原统一表、统计、工具行、H5背景/卡片和原生材质。仓库左侧增加独立公开展开按钮，真实远端分支一行一个；默认仅作分支属性，不加入演示或猜测数据。分支行只读，仓库名称仍打开工作区。
- 布局/文字：仓库父行58px，子行34px，24×28px轻量箭头；六列顺序为仓库、组织/用户、账号、本地目录、状态、仓库操作。分支内容跨六列以保留长名空间，共享10px图标间距，默认标记10px。沿用现有系统字体、原矢量文件夹tile/分支图标、颜色令牌与隐藏滚动条，没有新卡片、色板或图片资产。
- 实际用户数据：当前GitHub账号、38个仓库、0关联。展开3D_ChineseInkPaintingStyleShader读取main，展开agent-done读取main、codex/create-chrome-extension-for-ai-tab-tracking、codex/create-chrome-extension-for-ai-tab-tracking-p1um8l；两个仓库同时展开，仓库计数仍38。未关联本地仍读取真实分支，主/助手同0.8.7、主实例fead0bc8-c050-4969-a84e-46b9b8491305保持。
- 实际用户窄窗849×853：根横溢出0，内表840px/视区579px；实际横滚261px后右侧28px操作按钮落在790–818px，恢复到左端后长分支名仍逐行可读，两轴滚动条保持隐藏。最终[真实预览截图](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-branches-main.png)已目视检查。侧栏保持当前展开/账号折叠状态，没有为了QA改动主页面主题或偏好。
- 隔离生产App/AccountService：2个合成账号同名但身份独立、7仓库、2不可用测试本地路径。展开前无分支读取；Enter/Space分别展开不同身份的仓库，各自main/feature分支不串线。刷新与搜索fork→清空保留展开选择，计数不包含子行。原本地目录弹窗可取消、两组菜单的4项Git写操作禁用，Escape返回触发器焦点。
- 异步/错误：403显示实际错误而非空分支；恢复后收起/重新展开读取成功；已有数据失败时明确标记保留上次分支。空数组显示真实空态，不补main。延迟读取显示加载状态，收起取消一次请求，释放迟到响应没有发布，重新展开恢复正确分支。自动回归另检查失去账号权限与分页上限只读提示。
- 真实临时Git/Gitea形状服务：从隔离Git仓库实际读取main、task/review、task/search，与refs一致；Git写状态验证未变。分别生成[临时Git截图](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-branches-isolated-git.png)、[合成目录亮色](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-branches-light.png)、[合成目录暗色](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-branches-dark.png)。这不是用户真实Gitea服务器或原生包验收。
- 隔离页实际视口1280×720；尝试viewport覆盖390/769后页面仍报告1280×720，已重置覆盖，不将它记录为手机测试通过。窄窗结论只依据上述真实849×853；未修改历史QA的独立尺寸记录。
- strict、325/325全套、4/4静态包装、生产构建及差异检查通过，新增11项分支回归；最终主/两隔离页无console warn/error。自有57261/57266服务正常quit，测试标签关闭，临时Gitfixture清理时gitUnchanged=true/userDataChanged=false；用户4173和4174依赖继续运行。
- 当前源码与浏览器预览已更新；未改版本/凭据、重启主或助手、对用户Git写入、提交/推送、生产发布或原生打包。保持0.8.7是防止版本依赖更新触发服务重启清空账号会话的本轮开发例外，不作为新发布版本。

final result for IMPORT-13-branches: passed

## 2026-10-09 文件夹图标直接展开（IMPORT-13-branches-folder）

- 按最新标注移除独立箭头，原文件夹圆角底板直接承接公共按钮的展开/收起与aria状态；名称仍单独导航到仓库工作区。仅有一个文件夹svg，不改变六列、真实分支读取、子行样式、计数、筛选或侧栏。
- 实际隔离生产App/AccountService从临时Git读取main、task/review、task/search；click展开、Enter收起、Space再展开以及名称导航均通过。实测底板36.34375×36.34375，等于两行文字总高；19×19图标居中，10px间距，父行58px。公共small按钮原先会缩到28px，已通过局部特异性覆盖修正，静态回归同时验证这一边界。
- 实际849×853主预览的agent-done文件夹展开后读到main及两个codex分支，没有展开错误；38仓库计数不变。[最终主预览截图](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/dashboard-folder-disclosure-main.png)已目视检查，原底板保留，前方多余箭头已消失。未更改用户主题或侧栏偏好。
- 项目check、直接strict类型检查、326/326回归、生产构建、Sites包装4/4及差异检查通过。旧测试禁止所有border/box-shadow声明不再适用于公共按钮重置，改为验证border:0/box-shadow:none；不存在的check:strict调用失败后已纠正，不冒充有效验证。隔离console无warn/error。
- 自有测试标签关闭、39917隔离服务quit，fixtureRemoved=true/gitUnchanged=true/userDataChanged=false。主和助手均HTTP200/0.8.7，主实例fead0bc8-c050-4969-a84e-46b9b8491305、1账号/38仓库/0关联/失败账号0保持，助手configured=true。没有服务重启、凭据迁移或原生包更新；源码提交/main推送由IMPORT-13-main单独记录。

final result for IMPORT-13-branches-folder: passed

## 2026-10-09 侧栏顶部单图标（UI-04-sidebar-header-icon-only）

- 按最新指示删除顶部品牌图标与GitTogether文字，只保留公共32×32收起/展开按钮，没有常驻文字。原brand相关CSS和Icon导入删除，sidebar-header行仍60px，外部红绿灯、Dashboard/账号/仓库/设置位置与主体布局不变。
- 实际849×853主预览：展开按钮与Dashboard图标框均x=23.5，左边缘差0，按钮32×32；紧凑栏宽56px，两框左边缘差仍0，尺寸32×32、圆角10px。两态header只有一个按钮/一个svg、textContent为空，没有品牌节点；当前截图与原整体配色/材质一致。
- 主页面先保留agent-done已展开的三个真实分支，再暂时搜索agent-done。鼠标收起→Enter展开→Space收起→鼠标展开均通过，搜索和三个子行始终保留，开关焦点连续。最终恢复原空搜索、展开侧栏及顶部滚动位置，账号分组状态未变。没有为了QA切换用户主题。
- check、直接strict、327/327回归、生产构建、Sites4/4及差异检查通过；[最终实际主预览截图](/Users/taobe/Projects/GitHub/Personal/git-together/_builds/qa/sidebar-header-icon-only-main.png)已目视检查。此图证明浏览器当前状态，不作为旧安装包或原生桌面目视验收。
- 主/助手HTTP200、0.8.7、实例fead0bc8-c050-4969-a84e-46b9b8491305，1账号/38仓库/0关联/失败账号0及configured=true保持。只做前端热更新，没有重启、版本依赖更新、凭据迁移、Git提交/推送或安装包生成；此前main推送已完成，本次更改仍在本地。

final result for UI-04-sidebar-header-icon-only: passed

## 2026-10-10 本地提交与提交区反馈（R-05-local-submit）

- 生产App与实际AccountService/受保护HTTP、本轮临时Git worktree共同运行，provider是合成传输；AI使用本机已登录Codex CLI 0.162.0-alpha.2。真实生成 Summary/Description、取消及重新生成成功，不作为用户真实远端账号或安装版验收。
- main提交钩子拒绝时保留两个字段、原HEAD和更改数量；移除本轮临时钩子后成功创建c2c10545，立即清空该目录更改，图中标记未推送。task/search的HEAD、更改与草稿保留，远端引用未推送。
- 逐目录草稿、选择/取消历史、收起/展开栏目、Dashboard分支Commit定位，以及仓库页Commit自动展开提交区均经实际点击核对。
- 1280×720亮暗与920×640短窗口核对，根无横向溢出，短窗口提交区底部619px低于640px；输入未聚焦中性色、聚焦主色边框/标签，字段尺寸不变。AI32×32圆形，左邻Commit8px；选中行两端8px圆角、右侧辅助文字12px留白。工作目录圈2/2虚线、未推送圈实线空心，本地连接3/3虚线跨行连续。
- 效果图：macos/artifacts/local-submit/after-light.jpg、after-dark.jpg、after-narrow.jpg。截图是临时仓库的实际UI；测试页面/仓库已清理，临时viewport已恢复，最终QA控制台无warn/error。
- 最终strict、481/481业务测试、Sites4/4、生产构建及差异检查通过。共享源码当前0.19.1；本轮功能递增minor至0.18.0，后续其他任务的0.19.x保留。4173账号服务与4174授权助手均200/0.19.1，后者configured=true；主预览0账号/0仓库/0关联保持，未重放凭据。未执行源码commit/push、原生打包或安装更新。

生成忙碌时补查提交快捷键：先填有效旧摘要，启动真实Codex生成，Meta+Enter不会中断生成或提交；Commit仍禁用，临时main和task/search的HEAD与3+1更改保持，取消后摘要保留。修正后strict、481/481测试和构建重新通过。

## 2026-10-10 输入框描边后续反馈（R-05-commit-composer-thin-outline）

- 0.19.2共享单行/多行输入取消聚焦时的内阴影叠线，保持单层1px边框、主色标签与错误色规则，字段几何不变。
- 隔离实际App亮暗主题核对：聚焦1px主色、未聚焦1px中性色，box-shadow:none与outline:none；Summary/Description高度40/56px均不变。Tab进入多行字段后主色焦点可辨识，控制台warn/error为空。亮暗截图位于macos/artifacts/local-submit/input-outline-light.jpg和input-outline-dark.jpg。
- 类型检查、生产构建及14项现有相关回归通过，差异检查通过。未执行AI/Commit，临时Git HEAD不变且已清理；生产主预览/助手状态与catalog均HTTP200/ok:true，未重启账号服务，未更新安装版。

## 2026-10-10 Graph选中行上下留白（R-05-graph-local-states-vertical-padding）

- 0.19.3图中文字上下各6px，选中与未选中均42px行高，SVG与键盘翻页同步42px。保留横向内缩、8px选中圆角及真实本地节点样式。
- 隔离实际App亮暗主题：选中工作更改/普通历史及未选中行都测得上下6px；所有行/SVG为42px，SVG顶边与行顶一致，相邻SVG间隙0。ArrowDown实际切换选中历史行后留白不变，控制台warn/error为空。截图macos/artifacts/local-submit/graph-row-padding-light.jpg和graph-row-padding-dark.jpg。
- 类型检查、生产构建、25项相关回归及差异检查通过。更新3处旧36px期望，没有新增镜像测试。未执行AI/Commit/Push，临时Git HEAD不变且已清理；主预览/助手状态及catalog均HTTP200/ok:true，未重启生产服务或更新安装版。

## 2026-10-10 官方M3字段与顶部搜索（R-05-commit-composer-official-m3）

- 0.20.3使用官方Material Web 2.5.0与Lit React 1.0.8。中栏与逐分支提交弹窗共用官方描边字段，Summary必填单行、Description选填多行；浮动标签、4px圆角与默认焦点描边保留。搜索由官方填充字段和图标按钮按M3 Search bar组合，官方Web库没有独立Search bar。
- 隔离生产App/AccountService/有限HTTP与真实临时Git核对，AI为确定性测试预填。搜索输入→空结果→清空恢复、清空后焦点、Cmd+K、中文及多行编辑、必填按钮状态、逐task草稿独立、取消/重开保留弹窗修改、Tab及Escape焦点恢复均通过；未执行真实AI、Commit或Push。
- 亮暗1280×720：搜索360×56px，输入正文16px/24px，字段含计数区高度76px/100px。移除外部overflow裁切后浮动标签及内部纵向调整把手正确显示。920×640含错误提示：字段独立滚动，Tab可滚入Description，操作区底边607px，文件列表保留42.5px，根横溢出0。短窗口中的字段不会同时完整展示，底部按钮保持可见；弹窗末尾字段可滚入视区。
- 实际截图：[亮色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/macos/artifacts/official-m3-inputs/official-m3-light.png)、[暗色](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/macos/artifacts/official-m3-inputs/official-m3-dark.png)、[窄窗](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/macos/artifacts/official-m3-inputs/official-m3-narrow.png)、[提交弹窗](/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/macos/artifacts/official-m3-inputs/official-m3-submit-light.png)。截图使用隔离仓库；最新并行Git同步接入尝试读取合成远端而收到证书错误，原样保留提示，并据此验证短窗口布局，不表示用户账号错误。
- 类型、生产构建及19项直接相关回归通过。扩展45项中38通过，7项旧操作名称/禁用/数量断言在修改前基线同样失败。构建保留大于500KB的chunk提示，不称全套检查通过。当前54521页无新增控制台warn/error，较早52262页的诊断服务不可用警告单独保留。
- 主预览4173与授权助手4174均HTTP200/ok:true/0.20.3，主实例ae62d238-3a38-4397-878b-6d8f3043e5ca，目录0账号/0仓库/0关联，助手configured=true。开始时两个端口没有监听，已从既有统一入口恢复；没有重放账号凭据，保留源码/运行预览与安装版边界。

收尾复查：并行Git操作任务修正旧断言并将共享版本递增至0.21.0；最终类型、生产构建和46/46相关回归全部通过。主与助手均HTTP200/ok:true/0.21.0，主实例d9420ab4-4059-447d-af56-20e163b6b639、0账号/0仓库/0关联，助手configured=true；复用已恢复的匹配服务，未再停止其它任务服务。两临时Git的HEAD不变、3+1更改保持，临时仓库与测试标签已清理，viewport恢复；差异检查通过，安装版未更新。


## 2026-10-10 最近需求交付核对（0.21.0）

- 最终501/501回归、Sites4/4、类型检查、生产构建和git diff --check通过；18项真实Git smart HTTP/LFS验证实际fetch、ff Pull、Clean保留HEAD/index、Get Latest真实旧对象和历史LFS回收、共享worktree/未推送提交/嵌套仓库/锁/失败保护，以及精确选中SHA Push。
- 生产App以隔离账号/真实临时双分支运行：Submit手工修改关闭重开保留；两分支各自Commit→Push，远端摘要回读；中栏只提交选中main，Push后显示已在远端。修复后台fetch与Commit/Push抢锁导致失败，改为git-common-dir等待队列，重验连续链路通过。
- 真实Codex CLI先因忽略用户配置请求401，恢复正常模型/provider/login配置后，main生成README修改说明、feature生成新增文件说明；实际官方字段预填、手工追加已核对、一次确认后远端两分支的完整消息与最终编辑一致，两个目录干净。错误分类不再把普通login字样误报为登录过期。
- 表头/胶囊中心实际分别1167、1239、1296、1380px，一致；无额外Dashboard批量toolbar。侧栏32px且上下padding为0；真实800×588窄视口Submit弹窗边界150/22.6/650/565.4px，按钮底541.4px，均可见。暗色实际截图artifacts/release-audit/real-ai-submit-narrow.png；官方字段shadow root已加载。隔离数据不冒充私有账号或安装包验收。
- Pull预览补齐remote-arrival.txt并实际ff完成；Clean确认删除新增临时文件；linked Get Latest得到depth1/count1，其他主目录count3历史保留。超过十分钟预览会拒绝并重新预览，实际重新预览成功。QA服务器/renderer及临时仓库已关闭清理，未写用户项目。
- 主预览/授权助手恢复0.21.0，账号服务0账号/0仓库/0关联，configured=true；没有重放凭据。正式签名/公证/公共更新与安装验收另记RUN-01-recent-delivery。

## 2026-10-10 提交字段紧凑字号（R-05-commit-composer-compact-type）

- Summary与Description继续使用官方Material Web描边字段，仅通过公开字号令牌将输入/空态从16px收至13px，浮动标签/字数提示从12px收至11px；未改变搜索、字段行高、内缩、描边或容器几何。
- 隔离生产App/AccountService/有限HTTP与真实临时双分支Git，亮暗1280×720实际核对中栏及Commit/Submit弹窗空态、中文/多行正文、Tab焦点和逐分支编辑。实际shadow root输入与placeholder为13px，静态标签13px、浮动标签11px、counter11px，Summary/Description含计数区仍为76px/100px；空Summary禁用Commit，填写后恢复。
- 截图位于macos/artifacts/commit-field-type：empty-dark.png、popup-empty-dark.png、popup-filled-dark.png、popup-filled-light.png、empty-light.png和filled-light.png。AI采用确定性测试预填；合成远端的证书错误提示保留，未冒充真实账号或安装版界面验收。
- 类型检查和生产构建通过；保留既有大于500KB的chunk提示，不新增镜像测试。QA控制台无warn/error；取消后mainChanged=false、featureUnchanged=true、3+1更改保持，临时Git及页面已清理。未点击提交确认、未执行真实AI或写入用户仓库。
- 原生签名、公证与公共更新源验收另见本次agent-log；依最新持续授权只验证最终包与更新源，不操作用户已安装App。

final result for R-05-commit-composer-compact-type runtime: passed
