# 真实客户端操作分组、Submit 与所选提交 Push

- 用户原始 prompt：看看其他对话的实现，更新 icon，移除 reconcile，增加 submit；全局：hover 在这些图标上时指针应该是按的样式而不是默认箭头；下面中间对未 commit 的 change，需要 submit 和commit 两个选项，已经 commit 变成 push，submit 移除；顶部的是针对所有筛选出来的仓库的操作，和 dashboard 一致；下面中间的只影响选中的 change
- 执行者：taobe；模型：gpt-6。当前运行环境仅暴露此标识，无法核实更具体版本；未推测型号。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支 / HEAD / 源码版本：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7 / 0.19.3。
- Git预检：本轮已fetch --prune，origin/main相对0/0；保留全部并行修改，没有切换、重置或清理工作区。
- 任务开始时间：2026-10-10 16:16:39 UTC+8（本轮首次可核对时钟）。
- 任务结束时间：2026-10-10 16:55:49 UTC+8。
- 结束版本：0.20.0；新增真实Push及Submit串联能力，按兼容新能力递增minor，package.json与lock根版本同步。
- 是否提交：否。没有源码Commit/Push、原生打包、安装更新或发布。
- 需求ID：IMPORT-14-production-submit；真实运行验收另列IMPORT-14-production-submit-runtime。IMPORT-14-grouped-actions保留Pull/Get Latest/Clean/普通后台Git fetch未完成边界。

## 上下文和决策

- 读取其他对话“更新列表日期列与排序”“完成本地差异功能”“sol_app (2)”及相关H5/图谱/输入/栏目日志，仅参考实现和人类确认内容，没有向其他任务发送消息或启动子Agent。
- 原H5确认Pull向下、Push向上，Get Latest云下载、Submit云上传，未关联下载独立箭头加托盘；五组胶囊、一组一个正数角标，移除Reconcile和手动Fetch；表头文字只排序，批量操作另放顶部。
- 后续并行H5纠正明确AI必须按每个branch/worktree自身更改生成说明，不能共用仓库整体说明。本轮生产弹窗逐目标生成、绑定说明与对应文件清单，一次统一确认。
- 可选澄清询问仓库页顶部是当前仓库分支筛选还是跨仓库Dashboard筛选；本轮未收到回复，已向用户说明采用Dashboard顶部覆盖筛选仓库、仓库页顶部覆盖该仓库筛选分支/工作目录。中栏只处理选中的task/提交。
- 使用记忆中的窄范围与源码/安装包证据边界指导；实时核对当前版本、源文件和预览，未修改记忆。模板版本核对与现有v1.9.1-260916-010202一致，无模板同步。

## 生产实现

- RepositoryActions、ui和styles统一成对图标与五组胶囊，取消可见Reconcile/Fetch；可执行图标及禁用执行wrapper悬停均手形，保留按下/键盘/名称/真实读取呼吸及独立异常提示。操作列296px，分支行46px容纳34px胶囊与上下6px留白，两种关联状态等高。
- Dashboard顶部按实际筛选仓库和分支/路径生成批量目标，不依赖展开；仓库行覆盖其筛选任务，分支行只处理自身。远端内容/本地内容/待提交/隐藏四个文字入口仅数量排序。隐藏批量一次写入偏好，保留原分支偏好、目录与文件。
- RepositoryGraph向父级传递真实分支筛选；RepositoryView顶部按该范围打开批量弹窗，中栏Submit只冻结当前task，Push绑定所选SHA与对应分支。已发布判断按对应远端分支可达集，不把其他远端分支上的同一SHA视为已发布。
- RepositoryActionDialog冻结真实task/文件/指纹清单并按路径去重。Submit每task复用原有限AI接口，说明和文件一起展示，取消不提交；一次确认后顺序Commit→Push，失败停止批次。操作UUID保留，成功Commit/Push不重复执行；已有Commit的重试仅Push。Commit确认弹窗允许逐目录编辑说明，Push弹窗仅显示目标和SHA。
- RepositoryCommitComposer保留原Summary/Description、可编辑AI生成和草稿挂载；未提交提供Commit与Submit，已确认Commit后切到该提交的Push，隐藏Submit；已创建但刷新/钩子反馈有警告时仍保留提交身份与警告，不冒称提交失败或重复提交。
- 新有限pushCommit DTO与服务调度，只接受仓库/task/预期HEAD/所选SHA/UUID。AccountService验证已保存账号、仓库权限及真实关联目录，复用Commit的目录锁和成功请求缓存。
- local-push验证真实branch/HEAD与所选提交祖先关系，服务端构造精确HTTPS仓库URL。复用origin限定凭据helper，令牌不进入参数/URL/renderer/日志；非强制SHA→对应refs/heads推送，禁用跟随标签和递归子模块推送，保留用户hooks/LFS。ls-remote前后精确解析目标引用并确认SHA；无自动推送、回退、清理或重试。
- useWorkspace统一写操作后的读取失效、本地重扫及远端变化触发；只确认实际结果，刷新失败保留写入结果并提示重新读取。三个既有测试controller替身仅补齐pushCommit形状以通过类型检查，没有新增测试案例或运行测试。
- 官方Git push及ls-remote文档核对精确refspec、非强推、no-follow-tags及引用返回格式；文档不作为运行验收。

## 检查和预览

- 首轮类型检查指出Push类型收窄顺序及三个controller替身缺少新方法，修复后通过。
- 最终0.20.0 npm run check、npm run build、git diff --check全部通过；包含本轮收尾的分支发布判断、精确引用解析、Commit警告状态及分支行高度修正。
- 未新增或运行自动化测试。没有执行真实AI生成、用户仓库Commit/Push、hook/LFS或失败恢复验收。
- 预览读取得到0账号/0仓库/0关联。4173热更新已采用0.20.0而授权助手仍0.19.1；核对端口、项目cwd、进程父子关系和已知归属后，按现有测试环境自动就绪授权停止自有统一入口并重新npm run dev。
- 新统一入口会话58076保留运行；主服务及助手均0.20.0，主instanceId=79d2d24e-4940-4b4c-a5fb-0c82f8c596ad；助手configured=true，稳定加密开发配置恢复。Catalog仍0/0/0，无账号凭据读取/重放，未影响原生用户数据。
- 实际IAB标签7仍为127.0.0.1:4173，Dashboard空账号界面。只读computed style核对收起侧栏、Dashboard、设置图标cursor均pointer；账号为空，未以此声称仓库操作组/弹窗或Git链路实际验收。标签已重新markDeliverable保留。
- 本轮更新REQUIREMENTS、DESIGN、ARCHITECTURE和README的当前生产实现/待实现边界；旧H5及历史验证保留。一次文档脚本因stdin编码失败未写入，使用显式UTF-8后成功。
- 保留并行图谱行距、栏目拖动、目录打开、输入样式及其他历史修改；最终HEAD仍95527b84055ffe54bf7032ec8fed8f27d9ca5ea7，没有归属或提交其他对话改动。

## 未验收边界

真实账号和Git写入验收、Pull/Get Latest/Clean实际执行、普通后台Git fetch、原生安装包更新与发布均没有在本轮完成。现有主预览没有账号可供观察实际仓库控件，后续应通过用户正常连接账号与明确目标验收，不能用合成账号或H5消息替代。
