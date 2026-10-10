# 本地历史提交差异接入

- 用户原始 prompt：「什么意思，本地的差异功能你还没做?做掉」；附件显示「本地历史提交差异尚未接入」。
- 模型：GPT-6；运行时仅披露家族标识，未提供可核实的更具体版本。
- 开始时间：2026-10-10 09:12，UTC+8；结束时间：2026-10-10 09:36:25，UTC+8；提交：未执行。
- 工作区：codex-standalone-ts；分支 codex/standalone-ts；同步后HEAD fcc93b344a，ahead/behind均0。
- 已读：根/macOS AGENTS、README、REQUIREMENTS的R-05、DESIGN、ARCHITECTURE、最近三条相关日志；记忆用于定位当前独立客户端，实际源码重新核对。远端模板版本v1.9.1-260916-010202与本地一致。
- 初始仅REQUIREMENTS已有其他任务改动，执行期间其他聊天并行修改Dashboard提示、刷新、设置/日志、授权迁移、共享样式和版本；全部保留，不切换分支。
- 成功标准：本地历史提交的真实文件列表、逐文件Diff与正文进入实际服务/客户端，首个提交与合并语义明确，历史与工作区选择/草稿隔离，错误/快速切换不串数据；临时Git的HEAD/index不变。
- 需求：R-05-local-history-diff及-test。本次用户明确要求实现，覆盖旧文档不扩展本地历史Diff的限制；不授权代码提交、推送、打包或发布。
- 现状：工作区差异已有读取，历史选择仅显示占位；需要增加有限localCommit方法及已有diff的可选commitId。4173无监听，4174由已安装App的助手占用，不停止该App。
- 进展：已登记需求，开始实现只读历史读取与前端上下文隔离。

## 行动与判断时间线

- 09:12–09:16：登记需求，确认附件是历史占位而非已有工作区Diff。复用完整列表/底部详情，新增localCommit及diff.commitId，历史只读对象内容。
- 09:16–09:20：实现服务/DTO、缓存、task/SHA/path上下文与树叠加。strict发现诊断白名单和类型收窄顺序遗漏，修复；三处旧占位断言改为真实加载/当前SHA契约。真实浅克隆测试发现pretty-format隐藏parent，改读原始对象parent头并明确拒绝缺失边界。相关104项先通过。
- 09:18–09:23：组件隔离浏览器确认历史+1与工作+10不同；根提交5文件，merge与第一父提交比较。两个目录草稿/工作Diff在取消后恢复。99文件分组97A/1M/1D、末行滚动、搜索1文件通过。
- 09:23–09:28：增加partial clone缺blob真实回归，禁止隐式fetch且pack不变。9项新回归通过。独立QA入口strict补入正式environment.d.ts后通过。版本从并行最新0.14.1递增minor至0.15.0：新增兼容能力，lock同步；历史版本记录不批量替换。
- 09:28–09:31：最新生产App/真实AccountService/HTTP验证正文新行、缩进、转义；树HEAD60ad200c与历史13f66c03分离，later.ts/new.ts仍在，历史删除条目不可打开。快速root/新提交/merge/Update切换仍显示当前补丁，取消恢复工作+10和草稿。临时QA日志服务补齐，当前端口无error/warn，旧端口历史warning单独区分。
- 09:30–09:33：720px窗口长正文把补丁挤为27px；仅is-history-diff为补丁分配3份、正文上限30%，保留工作区/远端原布局。最新界面补丁约98px，列表/补丁/正文独立滚动，真实增删行可见，截图保存。重跑类型、112项相关回归与生产构建通过。
- 09:32–结束：按根AGENTS持续授权更新已确认的4173；重启前后均0账号/0仓库/0关联，页面/账号API0.15.0，实例d4d54130-331b-4e9f-97d8-0075b585992a，PID66396留运行。主设置实际显示0.15.0且无error/warn。4174仍由安装版0.12.0/PID76681提供且configured=true，保留该App/配置，不声明助手同版本或统一npm dev全就绪。三个自建标签关闭，两个临时服务器/Git清理，HEAD/index不变。
- 09:35–结束：补齐需求/设计/架构与执行记录。一次较长文档脚本出现stdin编码错误，未写入文件；显式UTF-8后完成，需求和日志重新回读。

## 最终改动与验收

- 产品/架构：README、DESIGN、ARCHITECTURE、R-05-local-history-diff及-test同步。最新任务取代历史占位/不接入注记，不接入Git写动作或恢复远端文本预览。
- 服务：repository-reader真实commit/patch，AccountService有限入口，import-model/import-api验证与diagnostics方法；HTTP/原生IPC沿用原分发。只接受已关联worktree/仓库、完整SHA及提交更改列表中的字面路径，检查可达提交、账号/关联身份，取消传至Git；禁用外部diff/textconv、可选index锁及lazy fetch，10秒/8MB限额。
- 前端：local-commit-model、use-local-commits、RepositoryView/ChangesColumn/Changes。工作/历史选择隔离，缓存最多64份，结果匹配当前SHA，composer挂载不卸载；树基准不替换。共享styles只新增两条本地历史选文件规则。
- QA：新增local-history-diff.test.ts的9项真实回归；更新两个旧历史断言。预览夹具/入口增加本地历史、正文与真实逐文件读取，默认行为保持。
- 验证：npm run check通过；独立预览入口strict含src/environment.d.ts通过；12个相关套件112/112通过；4/4 Sites通过；Vite生产构建通过；Electron main/preload内存编译通过；git diff --check通过。未跑全仓库所有测试，不将其他聊天修改称为已全部验收。
- 实际浏览器：生产构建/真实服务链路；99文件、根/merge及两目录草稿由组件隔离补充。截图macos/artifacts/local-history-diff/local-history-diff.png，回归输出同目录regression.txt。临时数据删除，不读取/重放用户凭据，不保存用户仓库关联。
- 结束HEAD仍fcc93b344a，跟踪分支ahead/behind均0；未暂存/提交/推送/打包/发布。大量其他聊天dirty改动保留，不将其功能或测试归到本任务。
- 边界：源码/4173预览接通；网页目前无账号/本地关联，不冒充实际私有仓库验收。安装版仍0.12.0；0.15.0原生包与真实已保存目录原生验收未执行。助手版本不匹配仍是统一开发入口限制，未为此关闭正在使用的安装App。
