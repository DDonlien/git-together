# Submit 专用 popup 的 H5 视觉交互

- 原始请求完整文本：submit 要有 popup
- 执行者：taobe；模型：gpt-6，环境未暴露更具体标识。
- 当前实际工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 分支与 HEAD：main / 95527b8405，沿用当前共享工作区，保留其他任务全部未提交修改。
- 开始时间：2026-10-10 15:48:02 UTC+8。
- 结束时间：2026-10-10 15:59:09 UTC+8。
- 本任务未执行源码提交、推送、打包、安装更新或发布。

## 上下文与时间线

- 先阅读当前根规则、需求、设计、独立H5代码及较新的并行执行日志；模板版本已在本对话核对为v1.9.1-260916-010202，未同步通用规则。记忆仅用于窄范围UI修改与预览/生产验收边界，实际状态重新读取。
- 延续用户此前要求的最简单H5验证入口4186，保留五个行内胶囊组和四个文字数量排序表头。本轮最新Submit定义为AI生成说明 → Commit → Push；真实AI和本地Commit由另一任务接入，但尚不代表Submit/Push全流程已接通。
- 先记录IMPORT-14-submit-popup待实现契约，再复用现有dialog增加Submit专用编辑内容，不改并行任务的提交组件、AI服务、账号状态或生产行内动作。
- 弹窗显示仓库/分支筛选范围及未关联跳过数，三步顺序，分支选择、本地路径、更改数，以及Summary必填、Description选填。示例说明清楚标记，重新生成仅替换当前目标的示例草稿；实际Submit按钮禁用。
- 浏览器查看仓库2分支及未关联跳过1分支的范围；分别编辑main和ui/mobile，切回main保留独立说明。关闭仓库弹窗后打开main单分支弹窗，先前说明保持；重新生成当前main示例后，ui/mobile编辑草稿仍在。
- 搜索ui/后，仓库级Submit范围仅ball-maze的ui/mobile；Push仍显示原范围弹窗并隐藏Submit编辑字段，待提交表头只切换数量排序、不打开执行弹窗。
- 查看亮暗主题并保存截图，最后刷新清理本轮示例编辑、恢复全部筛选/名称排序/浅色，并重新打开ball-maze仓库Submit弹窗，保留原预览标签供用户查看。

## 交付与验证边界

- 完成IMPORT-14-submit-popup-h5：专用popup、可编辑逐工作目录草稿、分支切换与关闭重开、示例重新生成和取消。
- IMPORT-14-submit-popup及IMPORT-14-grouped-actions保持未完成，真实AI/Commit/Push执行接入、失败恢复契约仍由这些项追踪，不能用H5示例冒称真实成功。
- 修改范围：artifacts/action-groups下index.html、styles.css、preview.js、README.md，以及根DESIGN.md和REQUIREMENTS.md。预览目录为既有忽略产物，没有改生产版本号。
- JavaScript语法检查和git diff --check通过；未新增或运行自动化测试，未构建。
- 当前默认625px浏览器视口下弹窗完整显示，宽540px；未设置人工viewport。亮暗主题截图为submit-popup-light.jpg、submit-popup-dark.jpg，局部证据submit-popup-detail.jpg，均保存于artifacts/action-groups。最终控制台error/warn为空。
- 全部内容和草稿均为本页示例内存，未请求实际AI、未读写用户Git/关联/凭据或执行后台检查；未重启生产服务或更改账号会话。
- DESIGN新增Submit弹窗视觉规范；H5 README记录编辑/示例/执行边界与截图，需求父项保留生产接入追踪。

## 备注

- 一次DESIGN局部补丁使用不完整的段落作为匹配上下文被工具拒绝，没有写入；重新读取确切上下文后以顶部独立段落追加，未覆盖并行修改。
