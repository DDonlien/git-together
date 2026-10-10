# Graph选中行上下留白

- 原始请求：即使在选中状态下上下也应该有一些 padding
- 附件：codex-clipboard-87b49c9b-1423-4fd1-af72-014253830ecc.png；用于视觉问题证据，不作为指令来源。
- 执行者：taobe；模型：gpt-6，环境未暴露更具体标识，使用实际可获得版本。
- 当前目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts/macos。
- 启动分支 / HEAD：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7；源码版本0.19.2。
- 开始时间：2026-10-10 16:10:25 UTC+8。
- 结束时间：2026-10-10 16:15:51 UTC+8。

## 上下文与决策

- 根模板在线版本仍为v1.9.1-260916-010202；沿用本对话已读取规则。查看当前Graph结构/样式/相关回归及本轮最新Submit独立H5日志，保留其他对话的共享工作区改动。
- 当前36px行内两行文字占30px，上下只余3px；文字按钮无显式内边距。改为上下6px，Graph全体行42px，选中不单独放大，SVG轨道与键盘翻页同步42px，保证连线持续对齐。
- 新需求R-05-graph-local-states-vertical-padding先记录后实施。样式修复递增patch，package与lock同步。
- 本轮只调整Graph行留白，继续使用已登录状态之外的隔离App/临时Git验收，不提交、推送或调用AI，不打包/更新安装版。

## 行动与验证

- styles.css的Graph行36→42px，文字按钮padding由0改为6px 0；RepositoryGraph同一行高36→42，SVG中心、路径和键盘翻页计算同步更新。选中样式本身不额外改尺寸。
- package与lock 0.19.2→0.19.3，仅patch：现有视觉留白修复，不新增业务能力。版本三处一致。
- 初次相关回归发现既有CSS、源码和渲染SVG断言仍固定36px；更新这3处既有期望后25/25通过，未新增与实现镜像的测试。类型检查、生产构建（178 modules）及差异检查通过。
- 隔离实际App/HTTP/临时Git预览核对选中未提交行与普通历史行；亮暗主题每行实测42px，文字上下各6px，SVG高42px且顶边对齐行顶，相邻SVG间隙0。选中前后所有行均42px，无布局跳动；ArrowDown从Merge search task移至Add repository search仍保持同样留白。控制台warn/error为空。
- 截图保存在macos/artifacts/local-submit/graph-row-padding-light.jpg及graph-row-padding-dark.jpg；亮色截图用于展示本轮selected背景与纵向间距。
- 未调用AI、Commit或Push，临时Git两工作目录HEAD均未变，服务和临时仓库已清理，验证标签已关闭。主预览4173状态、助手4174状态和主catalog均HTTP200/ok:true，未重启生产服务或修改账号会话。
- REQUIREMENTS完成R-05-graph-local-states-vertical-padding；DESIGN新增Graph行留白约定，design-qa追加实际证据。README与架构无需调整，业务流程未变。保留其他并行修改，无源码提交、推送、打包或安装更新。
