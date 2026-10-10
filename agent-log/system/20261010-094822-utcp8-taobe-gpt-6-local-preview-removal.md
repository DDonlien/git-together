# R-05-local-preview-removal：取消文件列表下方内容预览

- 用户原始要求：下面不需要显示修改内容的预览，可以预见大部分要修改的内容无法预览。
- 工作区：codex-standalone-ts，当前分支 codex/standalone-ts。fetch 后 ahead/behind 为0/0；已有多项并行未提交修改，按本轮开始时的临时基线核对局部改动，不回滚其他工作。
- 规范预检：上游模板与本地版本元数据均为v1.9.1-260916-010202。根需求/设计/架构为权威文档。
- 成功标准：本地工作更改及历史提交在选择任何文件后均不出现下方内容面板，不发起选择文件的Diff轮询；文件列表、状态、选择、分组/搜索、树基准和历史叠加、底部提交说明及草稿保持。
- 范围：删除本地预览组件状态、读取回调和调用链、相关CSS；更新既有回归和隔离预览入口。远端已取消内容预览，有限后端Diff/提交读取接口保持。
- 版本：0.16.0→0.16.1，递增patch，理由为删除用户不需要的内容预览、修正显示方式；同步package-lock的两处根包版本，没有硬编码新增版本。
- 删除RepositoryChanges的Diff状态、刷新调度、文件标题/关闭按钮/补丁/预览错误占位及is-history-diff样式，删除View→Column→任务和隔离入口的readDiff回调；原任务和composer仍保持挂载，历史详情读取与选择状态保留。
- 既有测试更新，没有新增自动化测试文件或用例。85/85相关回归、npm run check、npm run build、4/4 Sites、git diff --check通过；全仓前端和隔离入口搜索确认没有readDiff/ReadTaskDiff/内嵌预览类残留。有限后端接口通过原本地历史与文件打开真实Git/服务/HTTP回归继续验证。
- 浏览器：实际组件、生产模式打包与真实临时Git的隔离入口，默认1280×720。工作更改与历史文件选择后预览DOM为0；历史列表99文件，滚动末行docs/notes.md可见；列表高度243.515625px与body可用高度一致。分组中文、透明背景和8px内部padding保留，根页面不横向溢出。亮暗截图已目视检查。
- 取消历史恢复src/app.ts选择和主目录草稿；切换task/search、返回main、中栏收起/展开后两个不同草稿保持。文件树保留当前HEAD，历史着色和取消后的工作状态联动正常。CDP Network事件完整记录（无截断/遗漏页）只有workspace与local-commit读取，没有fixture/diff请求；控制台warn/error为0。
- 截图：macos/artifacts/local-preview-removal/{working-light,history-light,history-dark}.jpg，为隔离数据验证，非真实账号/已安装App验收。
- 当前预览：4173页面、受保护status/catalog、热更新RepositoryChanges组件HTTP200；新组件无预览标记或useAutoRefresh，实例52f5f2fd-c7cf-4915-8449-71ca08b5715c与0账号/0仓库/0关联保持，API仍0.15.1。4174受保护状态HTTP200，仍由已安装0.12.0提供且configured=true；本轮纯前端调整不重启用户会话，不能把API/助手版本不匹配记为统一环境完全就绪。
- 临时验证标签已关闭，服务已退出；真实Git的HEAD/index保持不变并已清理。需求及README/设计/架构说明按最新反馈局部同步，旧补丁验收记录保留为历史。未打包、更新安装版、提交、推送或发布。
