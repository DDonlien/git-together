# 官方M3提交字段与顶部搜索

- 用户原始prompt：那就换成官方 M3 组件吧，Summary 和 Description 用描边式，顶部搜索也换成官方的 Search bar。
- 执行者：taobe；模型：gpt-6。环境只暴露此标识，未推测更具体版本。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支 / HEAD / 版本：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7 / 0.20.2。
- 开始时间：2026-10-10 17:31:52 UTC+8（首个可核对时钟）。
- 结束时间：2026-10-10 19:05:44 UTC+8。
- 结束分支 / HEAD / 共享源码版本：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7 / 0.21.0（其它并行Git操作改动递增，本轮0.20.3递增保留为过程记录）。
- 是否提交：否。

## 已阅读上下文与成功标准

- 已读取根及macos规则、当前README/设计/架构/需求、上一轮Graph后所有新日志；记忆只用于保留紧凑界面和源码/预览/安装包证据边界。
- git fetch --prune完成，main相对origin/main无ahead/behind；模板source版本v1.9.1-260916-010202且通用规则完全一致。保留全部共享未提交修改，不切换、不暂存、不提交其他任务工作。
- 官方Material Web组件清单没有Search bar；本轮已向用户纠正上一条表述。Summary/Description使用官方md-outlined-text-field，顶部搜索用官方填充字段和图标按钮按M3 Search bar组合，不冒称存在官方md-search-bar。
- 成功标准：两处提交表单均使用官方字段，保留输入/生成/草稿逻辑；顶部搜索与清空、快捷键可用；亮暗、键盘焦点/弹窗和窄窗实际核对；类型、相关回归和生产构建通过。
- 不执行用户Git写入、真实AI、源码Commit/Push、安装包更新或发布。

## 对话与行动记录

- 17:31：登记R-05-commit-composer-official-m3；官方npm版本核对为@material/web 2.5.0、@lit/react 1.0.8；采用官方Lit React适配管理属性与原生输入事件。

## 完成工作、验证与剩余项

- 官方依赖@material/web 2.5.0及@lit/react 1.0.8按exact安装。material-inputs.tsx以官方React适配绑定Lit属性/原生input事件；两处表单的Summary/Description迁移，两个顶部搜索迁移，其他OpenGlass输入保留。
- host tabIndex与HTMLElement.focus保留Shadow DOM键盘委派、现有弹窗焦点管理与Cmd/Ctrl+K。主题映射现有语义令牌，官方正文16px/24px、圆角/浮动标签/默认焦点不收细。搜索56px胶囊，360px宽，公开令牌隐藏底线，官方搜索/清空按钮。
- 修正官方浮动标签的外部overflow裁切；短窗给字段与反馈独立滚动，操作保留，栏目在<=720px可缩至可用高度，保留至少一个文件行。920×640带错误提示实测文件列表42.5px、操作底边607px、根横向溢出0。
- 源码输入/依赖样式适配递增patch：0.20.2→0.20.3，无Git tag。REQUIREMENTS、DESIGN、ARCHITECTURE、README、macos规则与design-qa同步；只修改旧测试的原生input断言为官方字段可访问名称，未新增镜像测试。
- 类型与生产构建通过，19项直接相关回归全过；扩展45项38过/7失败，失败名称与修改前独立baseline相同（Dashboard旧七操作、禁用细节、overview操作数量），未将原有失败算作通过。Vite提示chunk超过500KB，最新记录650.81KB/gzip178.60KB；包安装报告已有依赖脚本未批准，没有额外批准脚本。
- 浏览器实际核对搜索/清空/快捷键、Summary必填/中文编辑、Description多行、逐task草稿、官方浮动标签/焦点、弹窗生成预填/编辑/取消重开、Tab陷阱与Escape焦点恢复、亮暗和短窗口。QA使用真实临时Git与生产App/服务，但provider及AI消息为合成测试传输；没有点击确认执行Git。
- 并行服务/UI持续变化，早期新前端与旧fixture不匹配出现读取错误，已重开对应新服务。最新fixture合成Git远端收到证书错误，保留提示并核对布局；控制台只观察到旧52262页面诊断不可用警告，54521新页面没有新增warn/error，不冒称全程无警告。
- 主4173/助手4174开始缺失，恢复既有统一开发入口并保留运行；最终HTTP200/ok:true/0.20.3，主instance ae62d238-3a38-4397-878b-6d8f3043e5ca、0账号/0仓库/0关联，助手configured=true。没有账号凭据重放、用户Git写入、源码提交/推送、真实AI验收、安装打包或发布。
- 实际亮/暗/窄窗/弹窗截图保存在macos/artifacts/official-m3-inputs，属于隔离生产UI证据；不代表用户真实账号或旧安装版验收。
- 收尾并行Git操作任务修正旧操作断言，增加一项回归并递增共享源码为0.21.0；最终0.21.0类型、生产构建及46/46相关回归通过，不再把早期7项失败报告为当前失败。最终bundle650.89KB/gzip178.64KB，保留chunk大小提示。
- 复查服务期间原拥有的开发进程已被并行任务替换，旧exec session/PID不可用；没有停止未知新进程。随后只读确认主/助手均HTTP200/ok:true/0.21.0，主实例d9420ab4-4059-447d-af56-20e163b6b639，0账号/0仓库/0关联，助手configured=true，复用并保留匹配的新服务。
- 两个临时仓库最终HEAD与首次读取一致，main/feature更改仍为3/1。早期fixture正常quit已移除；最后fixture在会话句柄未保留的情况下，经精确PID/路径/命令验证停止本轮拥有的服务并移除本轮临时目录。测试标签关闭，viewport恢复，用户官方文档标签保留。
- 最终差异检查通过。共有其它任务未提交工作保留，本轮未暂存、提交、推送、打包、修改用户Git或更新安装版。
