# 筛选范围与四组操作胶囊 H5 预览

## 用户原始 prompt

表头也加上这些按钮，代表对当前筛选出的仓库进行全局行为；同理，对仓库点了代表对当前筛选出的 branch/worktree 做全局同行为；操作按键稍微进行一些分组，可能套一个背景胶囊？做最简单的 H5 让我验证下视觉效果，分组逻辑是：pull, get latest 一组，push, submit 一组，clean 单独一组，隐藏也是，fetch 移除，我们的 app 应该自动触发式、定时式 fetch，否则远端可能会和本地脱节（但我理解为啥 git 要设置 fetch 这个功能而不是 pull = fetch + pull，只是我觉得它全自动更合理？）

## 执行元信息

- 模型：gpt-6。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支与提交：main，95527b84055ffe54bf7032ec8fed8f27d9ca5ea7；fetch后相对origin/main为0/0。
- 开始时间：2026-10-10 14:52:01 UTC+8为首次记录的工具时钟，之前已开始阅读上下文。
- 结束时间：2026-10-10 15:08:28 UTC+8。
- 本次提交、推送与发布：无。

## 上下文与成功标准

读取父子AGENTS、README、DESIGN、ARCHITECTURE、现有IMPORT-14需求、最近本对话发布日志、当前Dashboard/RepositoryActions/样稿和实际配色。Memory仅用于寻找工作区及保留预览/源码/包/发布的事实边界，当前main和动作定义重新核对。远端agent-template版本v1.9.1-260916-010202与本地一致。

最新用户要求先做最小H5视觉验证。本次只制作独立示例预览、登记后续实际应用方向。Submit按既有Commit解释为本地提交，Clean继承此前Clear的远端优先恢复语义；Reconcile和手动Fetch不进入本轮样稿。实际生产应用行为由IMPORT-14-grouped-actions单独追踪。

成功标准：四组胶囊与表头/仓库/分支同一套操作可见；筛选与收起后的范围正确；未关联分支只下载/隐藏；0角标隐藏，检查呼吸结束后计数稳定；预览服务已启动并在浏览器中打开。无需原生打包或发布。

## 行动记录

- 在修改前登记IMPORT-14-grouped-actions和grouped-h5，保留旧七项动作的历史完成记录。
- 新建artifacts/action-groups/index.html、styles.css、preview.js，使用3个仓库、8个分支，其中6个已关联、2个未关联；全部为明确标记的示例数据。
- 保留当前Material配色、无投影卡片、透明窄侧栏、日期列与表格结构，仅行尾操作增加轻量背景胶囊。四组顺序Pull/Get Latest、Push/Submit、Clean、隐藏；表头另有获取/提交/清理/显示标签。
- 从现有Phosphor依赖生成14个静态SVG到icons.js；不引入新依赖、CDN、账号服务或字体下载。
- 搜索及关联筛选决定匹配仓库与分支；折叠仅影响呈现。操作弹窗只展示实际当前匹配范围，Git动作无模拟执行成功。隐藏/恢复只改变页面内存，刷新恢复初始数据。
- 全局隐藏同样逐个应用于匹配分支，防止一个仓库匹配ui/时误隐藏筛选外main或未关联分支；没有独立父级隐藏状态与子级状态互相覆盖。
- 4186端口启动独立静态预览，未重启生产账号服务。在Codex In-app Browser打开预览并markDeliverable，保留服务供用户体验。
- 官网Git fetch/pull文档确认：Fetch更新远端跟踪引用及所需对象；Pull先Fetch再合入。后台自动Fetch与主动Pull的产品分工合理。现有生产远端API轮询不能冒称已经实现了本地Git fetch。

## 实际浏览器验证

- 默认1280px浅色及深色均观察到四组胶囊、两个日期来源、三个层级的操作和仅两个入口的未关联分支，截图为light.jpg、dark.jpg。
- 搜索ui/得到ball-maze/ui/mobile与git-together/ui/actions两个分支。点击git-together仓库Push，范围为1仓库1分支。
- 收起git-together后，表头Pull范围仍含2仓库2分支；收起不会缩小全局操作范围。
- 筛选未关联工作目录得到2仓库2分支；对应分支只有下载/隐藏，下载范围显示创建并关联worktree。
- 分支隐藏后从8降至7，显示已隐藏并恢复后回到8；全局ui/隐藏后清空搜索保留筛选外6个分支，恢复后回到8。filtered-scope.jpg保存全局匹配范围。
- 修改日期两次排序后aria-sort为descending，仓库顺序git-together、ball-maze、meow-generator，与示例日期相符。
- 检查演示中12个操作行/64个按钮同相位breathe，零数字角标0个。4.8秒结束后忙碌行0，检查前后数字数组一致；checking.jpg保存检查状态。一次等待器先于演示结束超时，随后实际读回确认完成与稳定，未把超时判作页面检查失败。
- 浏览器error/warn日志为空。预览HTTP200，git diff --check通过。未新增或运行自动化测试；未进行窄窗口或真实Git执行验证。

## 文档与工作区边界

- REQUIREMENTS登记父项待实际接入、子项H5已完成，并写入实际验证范围；预览README记录入口和示例边界。DESIGN/README/ARCHITECTURE的生产说明不由此样稿改写。
- 本预览位于既有忽略的artifacts输出目录，应用版本未由本任务递增。它不改变已安装App、公共更新或原生包。
- 开始工作区干净；结束时检测到其他并行任务修改多个生产文件和根文档，以及新增hide-counts、local-submit、tree-open-spacing等日志。保留这些修改，本任务只局部新增需求记录、预览输出及自身日志；未暂存、提交、恢复或覆盖其他任务内容。
- 未来真实接入、自动Git fetch与所有Git写操作均未由本预览完成，沿用对应父项及实际执行需求追踪。
