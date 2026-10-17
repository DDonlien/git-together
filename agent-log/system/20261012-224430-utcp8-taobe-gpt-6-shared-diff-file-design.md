# 工作区、历史与弹窗文件清单统一

- 用户原始prompt：「中间的 diff 页面、历史的 diff 页面，应该和 popup 里的一致设计；另外你左边既然有加号了右边就不用这个 A 的字了吧」
- 模型：gpt-6（运行环境提供的最具体标识）。
- 开始时间：2026-10-12T22:44:30.221355+08:00
- 结束时间：2026-10-12T22:51:10.514945+08:00
- 启动分支及版本：main，0.31.0，00959e0188fcba7bfec666b685e6d1fdaaf8d3b9
- 提交：未执行；本次未要求打包或发布。
- 需求：R-02-shared-file-design。

## 上下文与成功标准

已读根/macOS规则和当前文件清单、提交弹窗、Diff上下文与样式契约；模板通用前缀一致，fetch/prune后main与origin/main无分歧。旧记忆中的历史Diff占位已被当前真实历史文件读取取代，不按旧占位状态修改。保留其他账号、诊断、历史分页与提交者筛选WIP。

当前三处Diff视图呈现的是RepositoryChangedFiles文件更改清单，弹窗使用RepositoryCommitFiles。本轮共用状态符号与路径呈现和已有弹窗样式；不恢复已移除的内容预览。工作区分Tracked/Untracked，历史文件已提交且属于Tracked；保留按新增/修改/删除/其他分组的选择。右侧重复状态字母移除，状态及旧/新路径继续可访问；弹窗选入/移出范围、全选、分组选择及禁用行为保持。只修改必要前端呈现与记录，不运行自动化测试或操作用户安装版。

## 技能

使用vercel:react-best-practices检查多组件修改：共享组件在模块作用域，派生列表不新增effect状态，字面文本安全渲染、稳定文件path键、实际选择回调和键盘按钮保留，不新增依赖或异步读写。

## 实现

新增模块级RepositoryFileChangeLabel，共用状态符号和完整路径提示；Popup及中栏工作区/本地历史/远端历史均引用相同呈现。中栏文件行复用submit-file-row/choice的34px总行距、12px文字、绿色加号/黄色圆点/红色减号、删除线和圆角悬停，保留中栏当前文件的选中背景。只删除列表中的右侧重复A/M/D/R，右侧完整文件树原有状态提示不属于本轮范围。

中栏按真实tracked布尔值分组，提交详情没有tracked字段时代表已提交文件并归入Tracked；原状态分组切换、完整列表内部滚动、未知状态其他组、搜索和empty/loading/error入口保留。Popup复选和范围算法未改；未知状态显示问号及原状态提示，不冒充已知修改。按钮语义、原始状态和previousPath仍可访问。

版本从0.31.0递增至0.31.1：修正现有文件清单的视觉一致性与重复标记，属于patch。macos/package.json为权威来源；npm根锁、Rust crate及锁记录同步。Tauri继续从package.json读取版本。README入口与数据/服务契约没有变化；DESIGN同步当前共同几何、Tracked分组和符号方向。移除本轮替代后无人引用的readonly-file及旧状态组标题样式。

## 检查与交付

npm run check、npm run build及限定文件的git diff --check通过；生产入口737.42kB并保留既有500kB分包警告。Cargo离线locked元数据确认当前前端及Rust版本为0.31.1，没有运行Rust编译。未新增或运行测试、没有浏览器或用户安装版交互验证，没有提交/推送/打包。

react-best-practices检查完成：共享组件在模块作用域，不在父组件内定义新的React组件；列表、分组及状态直接派生，不引入同步effect或额外状态。文件path及分组key稳定、disabled/aria-pressed/按钮type保留；Popup包含范围仍由原算法控制，已提交历史没有冒造untracked或额外提交复选项。新增文件、搜索空态、空更改、未知状态及重命名旧/新路径继续有明确呈现；无dangerouslySetInnerHTML、新依赖或后台改动。此为源码检查及编译证据，不称为实机视觉验收。

更新需求R-02-shared-file-design；DESIGN更新Commit/Submit文件清单以及共同行高、间距、跟踪分组和状态符号约定。先前提交者筛选及其他共享工作区WIP保留。
