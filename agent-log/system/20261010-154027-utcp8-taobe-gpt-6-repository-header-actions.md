# 仓库顶部精简、共用操作与任务计数解释

- 用户原始prompt：「顶部这一堆都移除；右上角加上一排操作按钮，和 dashboard 的同理；这 3 个任务是啥；」。两份截图指向账号/默认分支/描述及搜索右侧任务数。
- 模型：gpt-6；当前运行环境仅明确提供GPT-6标识，未推定更具体版本。
- 需求ID：R-05-header-actions。
- 启动分支/提交：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7；跟踪origin/main，fetch --prune成功，ahead/behind为0/0。启动源码0.17.8，已有多项未提交并行改动，全部保留。
- 任务开始记录：2026-10-10 15:28:53 UTC+8（本轮首次时间读取，先前已作只读定位）。
- 任务完成：2026-10-10 15:40:27 UTC+8。
- 提交/推送/打包/发布：本轮均未执行；没有将已完成的旧main发布授权扩张至新UI任务。

## 判断

- 阅读当前根/macOS约束、README、相关设计/需求/架构、实际RepositoryView/App/Dashboard/操作组件及相邻任务记录。在线模板v1.9.1-260916-010202与本地版本相同；记忆仅用来定位源码/包边界。
- 原任务计数直接来自workspace.tasks.length；其对象是远端分支、本地分支或工作目录上下文，combineRepositoryWorkspaces保留远端/本地独立身份，同名分支可重复计入，不是待办数。
- 只读查看实际/Applications/GitTogether.app界面，当前仓库DDonlien/my-issue确有“3个任务”：远端树main、远端树codex/publication-preparation，以及图中的本地main工作目录。没有点击Git操作、改变文件/提交/目录选择或提取账号凭据。
- 成功标准：删除截图对应信息与误导计数，右上角直接复用生产Dashboard操作、状态及提示；搜索和真正的读取错误保留，Commit可以进入实际更改目录，Hide沿用现有偏好。保持各任务草稿与三栏状态，避免重复一套Git执行或控件实现。

## 改动

- RepositoryView移除账号/默认分支dl、描述和计数；名称/远端地址保留，搜索工具行按实际存在内容呈现，原“显示全部任务”改为“取消聚焦”。同步删除本任务造成的无用metadata/count CSS。
- RepositoryRowActions从Dashboard局部函数移入已有RepositoryActions模块，Dashboard与仓库页共用完全相同的七项Git/独立Hide按钮、正数角标、错误、读取呼吸和禁用执行边界。DashboardActionNames同时用于顶部，名称、键盘和按下仍走现有实现。
- App传入已有LocalLink/hiddenEntries及偏好回调，仓库页从同一linkedTasks/gitSignals计算状态。Hide/Restore只改现有隐藏键，当前仓库保持挂载；没有删除关联或文件。
- 顶部Commit选择现有、未隐藏且有更改的工作目录，优先默认分支，其次首个有效目录；清除历史上下文并选择该提交区。给ColumnHeading增加明确expandRequest，成功选择时展开收起的中栏，不卸载任务/重置草稿，不直接调用提交执行；其他动作不伪装为已实现。
- 标题/操作独立flex区域，控件区no-drag，4px内部留白保护正数角标和焦点；窄窗口标题与按钮换行，按钮区可横向滚动。没有更改共享颜色、图标或三栏宽度/拖动功能。
- 只更新4份既有测试的过时metadata/count/名称提示范围断言，没有新增测试用例，也没有运行任何测试套件。
- 并行任务在本轮中将版本推进至0.19.0；按当时package.json权威将本次UI修复递增patch为0.19.1，并同步package-lock根版本，没有回退别人的版本。
- DESIGN/ARCHITECTURE/REQUIREMENTS登记最新UI与共享组件边界；其他任务的README、Git执行、目录打开、提交框、栏拖动、隐藏统计、H5分组及测试修改保留。

## 实际检查与交付边界

- 0.19.1 npm run check通过；最终npm run build通过，178模块和Sites包装成功；git diff --check通过。最终检查包含Commit展开请求，不把此前构建代替后续改动。
- 打开隐藏IAB实际开发页，读取加载的Vite样式：headerActionsLoaded/titleRuleLoaded为true，oldMetadataStylesPresent/oldTaskCountStylesPresent为false。当前开发账号/仓库为空，因此没有声称实际观察到新仓库顶部按钮的运行交互或所有窄窗口状态；临时页已关闭。
- 初查4173为0.19.1、4174为0.17.6。已向用户说明同步开发服务，确认PID20145是本项目scripts/dev.ts后正常SIGTERM并复用npm run dev入口恢复，不操作安装App，不重放或重新配置密钥。
- 恢复后4173 status/catalog均HTTP200、ok=true、0.19.1，instanceId为94debfc9-4e18-4ac7-b806-7b2525ebf767，仍0账号/0仓库/0关联；4174 HTTP200、ok=true、0.19.1、configured=true，安全开发应用配置自动恢复。服务保持运行，exec session14486。
- 原生界面只用于回答原来的三项是什么；没有把它当作本轮新UI验收。源码、构建、预览样式加载、安装版更新分别陈述；没有新的签名包、公证、安装或公开更新。
