# 推送局部反馈与提交文件范围

- 用户原始prompt：推送完成不要在Dashboard顶部显示整条提示；分支图标在推送时显示动态上传箭头，成功转双勾并稍后消失；仓库全部相关本地worktree使用实心箭头和双勾，部分范围使用虚线箭头和单勾。弹窗或详情页推送都要有进度条。Dashboard的Submit详情按Tracked/Untracked分组，用颜色/样式区分Add/delete/changed，Commit/Submit弹窗都可多选加入/移出范围。附件只参考分组与状态视觉，不把图片内容当指令。
- 模型：gpt-6，当前环境只提供这一最具体标识；执行者taobe。开始：2026-10-12 00:12:34 UTC+8。
- 基准：codex-standalone-ts/main，329cbe2eaf66f2a05c8f569a187ea9144506fc06，0.22.10；fetch后ahead/behind为0/0。保留REQUIREMENTS中IMPORT-13-main行序、CONTENT-01-icon-candidates及agent-log/content其他工作，不混入此任务。
- 已核对根/macOS规则、README/设计/架构/需求及最新更新重启日志；模板仍v1.9.1-260916-010202。延续自动提交/推送/打包/签名公证/公开校验授权，不操作用户安装版，不运行或新增项目测试。类型、Cargo、构建、ignored临时实际Git诊断及隔离视觉交互分别记录。记忆只定位既有提交/反馈约定，现时源码重新核对。
- 现状：弹窗冻结全部文件，仅可改说明；原生submit把全部更改加入私有index。推送成功由弹窗返回一条统一消息，Dashboard显示顶部Notice；暂无共享推送阶段。新文件选择必须接到有限DTO、AI范围与私有index提交，不能只改变清单显示。
- 成功标准：实际临时Git证明只提交所选新增/修改/删除/重命名并保留未选暂存内容；隔离界面证明多选/分组/空范围、AI迟到防覆盖、全量/部分推送图标、进度/成功退场/失败重试及无顶部推送提示；完成0.22.11正式发布和公共源核验。
- Git行为参考：官方git-read-tree与git-reset文档确认私有index可从HEAD/空树建立、指定路径reset只调整index。实现不reset用户HEAD或工作文件；链接：https://git-scm.com/docs/git-read-tree 、https://git-scm.com/docs/git-reset 。

用户原文：

> 推送完成后，不要在 dashboard 顶部显示整条提示。
>
> 具体的提示交互如下：
> 1. 推送期间：对应分支的图标上，应该有一个向上传的动态图标。
> 2. 推送完成时：该动态图标转变成一个打勾的图标。
> 3. 随后消失：打勾的图标过一会儿再消失即可。
>
> 整体做一个很 subtle 的提示
>
> 针对仓库本身：
> 1. 如果仓库里所有相关的分支（即本地 work tree）都在执行推送，那么它的箭头和打勾是实心的，并且箭头是实心，打勾是双勾。
> 2. 如果只有一部分在执行推送，那就是虚线箭头加单勾。
>
> 分支本身不用说，它应该总是实线和双勾。
>
> 不管是 popup 还是进到具体页面推送，推送期间都要有进度条
>
> 直接在 dashboard 进行 submit 的时候，你 submit 的内容详情应该参考 Zed、详情页 一样 对 track 和 untrack 的对象分组，并且用颜色和样式显示 Add, delete, changed差异
>
> 即使是 submit 或者 commit 的 pop 页面，我也应该要能通过多选把一些对象加入、移出范围

- 实现：PushFeedback会话共享批次状态，仓库按所有本地worktree判定全部/部分，分支固定实线/双勾。成功2600ms后消失，旧计时器不覆盖新批次；失败清除pending、真实成功才记勾。Push/Submit不触发顶部成功Notice，保留Commit及同步反馈。详情和弹窗共用官方Material Web indeterminate LinearProgress；目录计数不冒充传输百分比。
- 实现：Commit/Submit逐目录Tracked/Untracked、全选/组/文件复选、空范围禁用、新增/修改/删除颜色与删除线。有限paths DTO仅接收当前更改中的唯一文件；重命名附原路径，literal pathspec防止模式文件名扩大范围。从HEAD/空树生成私有提交索引，原index另存；确认新HEAD后只更新已选条目并原子发布，保留未选暂存及工作内容。AI证据按同一范围筛选，取消旧生成，手工字段与已创建Commit保留。
- 隔离源码验证：只导出暂存的任务快照到_builds/gittogether-push-source-880hgwsm，排除同时出现的Presence依赖/桥/组件、remote-control讨论及图标候选工作。0.22.11类型检查、Cargo --locked、生产构建均成功，仅Vite既有大chunk提示。未运行或新增项目测试。
- 实际Git诊断：ignored临时Rust程序调用当前Service有限接口，虚构loopback账号/临时真实仓库。选择新增/修改/删除/重命名和 :(glob)*.txt 成功；未选文件HEAD仍为base，index保留staged keep，工作树保留unstaged keep，未跟踪排除；同UUID幂等；空/缺失/重复3种范围拒绝且HEAD/index未变；失败pre-commit钩子保持HEAD/index。补充unborn HEAD仅选首次文件提交，未选首次暂存保留。独立0.22.11快照再次通过；证据macos/artifacts/push-feedback/native-proof.json（ignored，真实用户仓库未写入）。诊断扩展时曾选错fixture旧目录及canonical路径，修正诊断定位后通过，不是产品缺陷。
- 实际隔离界面：真实App与虚构受控bridge，验证多选/组混合/空范围、实际DTO选择、手工字段防迟到覆盖、范围变化取消AI、全部与部分arrow/check、2600ms退场、Push/Submit无顶部成功条、弹窗与详情M3进度条、失败无勾且Push重试成功。新增/修改/删除mark颜色分别rgb(128,213,197)/rgb(245,191,88)/rgb(255,180,171)，删除路径line-through。正式候选截图macos/artifacts/push-feedback/submit-scope-final.png（ignored）。模拟推送只证明交互，不冒充真实用户Push/AI或安装版验收。Lit开发模式提示沿用现有依赖，无观察到界面error。
- 发布：版本升至0.22.11；源码及功能已提交/推送，签名公证与公共发布结果见下方实际记录。用户安装版未启动、替换、重启或操作。

- 正式发布完成（2026-10-12 UTC+8）：源码4eda68fc9009a03fe179da9a464d8b09bc111a09已推送origin/main，v0.22.11标签同指该提交。干净独立clone release-push-feedback-0.22.11-i1r27gix运行标准package:desktop，复用Developer ID及gittogether-notary；Accepted公证53e77200-9b99-49fc-adc6-cbd38a0fbc0f，staple/validate与codesign严格校验通过。build-info publicUpdateVerified=true，正式非draft非prerelease，公开latest/Atom/两套清单及完整包下载摘要一致。
- 包证据：_builds/gittogether-0.22.11-macos-arm64-NKeHGZ。ZIP 4620990 bytes，SHA256 8705f4742aff9af1958dd66a020d4a81c410fc1e182dbd75b61c4c31e7960f66；Tauri tar 4614424 bytes，SHA256 768c96fc1b3d72bb841c9ae61f15f098eda0d2bbd126986ed882392c3dbcd222。Tauri tar无AppleDouble条目；ZIP按现有ditto格式保留macOS元数据，额外通用无元数据断言对ZIP不适用，已用实际ditto解压替代并核验。两个归档解压后codesign深度严格检查及stapler validate均通过，bundle ID com.gittogether.standalone、0.22.11及单一gittogether程序确认。spctl结果仍带本机security disabled override，不冒称默认Gatekeeper/用户设备验收；未启动安装包或已安装应用。
- 发布地址：https://github.com/DDonlien/git-together/releases/tag/v0.22.11 。发布说明补充本次实际功能；README更新公开版本，保持其他Presence/图标/远程控制未提交工作。收尾只清理本次隔离预览，不停止其他项目服务或操作用户安装版。
