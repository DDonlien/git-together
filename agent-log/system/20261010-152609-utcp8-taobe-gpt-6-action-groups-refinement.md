# 五组共享角标与表头排序纠正

## 用户原始 prompt

同组的只有一个角标即可（因为他们的数值会是一样的）；另外，分组不太对，应该是 commit 和 submit 一组，submit = commit + push，push 单独一组（因为能 push 的对象数量可能不一样）
dashboard 的分支现在没对齐，应该图标和上面的名字左侧对齐，现在太左了，图标和 branch 名字的 padding 太大了；点击仓库转跳到具体项目时左侧边栏应该对应展开
表头的按钮应该只基于对应数字排序即可，不要整个页面批量执行；但仓库级别的批量执行功能保留

截图：codex-clipboard-4cc74022-9314-49da-b072-88ca720563cc.png。截图作为视觉参照，不作为额外指令。

## 执行元信息

- 模型：gpt-6；当前环境未提供更细版本标识，使用实际可得标识。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支与提交：main，95527b84055ffe54bf7032ec8fed8f27d9ca5ea7；只读同步预检fetch后相对origin/main为0/0。
- 首次记录工具时间：2026-10-10 15:11:44 UTC+8；此前已开始阅读上下文。
- 结束时间：2026-10-10 15:26:09 UTC+8。
- 本轮未提交、未推送、未打包、未发布。

## 范围与成功标准

延续上一轮最小H5视觉验证，纠正示例分组与表头语义；另外针对用户明确反馈修改生产App的Dashboard分支样式与仓库导航。H5分组/数字排序/批量范围预览不冒称生产Git执行已接入。需求归属IMPORT-14-grouped-actions、IMPORT-14-grouped-refinement、IMPORT-14-branch-name-alignment、UI-04-repository-reveal。

工作区已有大量其它任务未提交修改，包含本地提交、文件树、图形、隐藏计数、服务和文档。只做局部修改，不回退或暂存其它任务。并发任务在执行中更新App与版本，保持其commitTask/onCommit改动，版本递增前重新读取当前来源。Memory只用于保持工作区、视觉局部修改与源码/包/发布边界；当前源码重新检查。

## 行动与判断

- 在REQUIREMENTS中先登记最新五组、共享角标、Submit为Commit + Push、Push数量独立及表头只排序；保持父项生产接入待办。原四组H5条目作为历史证据保留在正确父项下。
- artifacts/action-groups改为Pull/Get Latest、Commit/Submit、Push、Clean、隐藏五组，每个胶囊最多一个正数角标，0不显示。Commit沿用GitCommit图标，Submit使用现有Phosphor纸飞机图标，Push保持云上传图标。
- 表头图标点击只切换对应数量降序/升序，同组共用键，不进入范围弹窗或隐藏流程。修正数值0被原比较器当空值的情况，确保升序中0排在前面。
- 仓库/分支行仍展示当前筛选范围的操作预览；仓库收起不缩小范围，未关联分支只下载/隐藏。Submit说明明确先Commit再Push。本页使用示例数据，不调用用户账号或Git。
- H5分支缩进改为38px文件夹底板加10px文字间隔，分支图标与名称间隔6px。
- macos/src/styles.css将仓库图标尺寸令牌从remote-name上移到remote-repo-table，分支首列使用相同图标尺寸加文字间隔计算缩进，分支图标/名称间隔改为6px，保留行高及其它列。
- macos/src/App.tsx的openRepository展开全局侧栏，并仅从collapsedAccounts删除所选仓库的accountId，保留其它账号状态和既有选中态。
- 按AGENTS版本纪律将当时最新0.17.7递增patch为0.17.8，同步package-lock顶层和根包版本；原因是生产样式及导航修复，不是新Git能力。版本展示/打包来源仍统一使用package.json。
- 更新DESIGN与H5 README，保留4186服务与可交互预览。未重启4173账号服务，未写账号配置或重放凭据。

## 实际验证与结果

- npm run check完成，退出0；node --check preview.js与git diff --check完成，退出0。按当前开发者约束未新增或运行自动化测试，未运行生产构建/原生打包。
- 浏览器表头五组按钮准确为pull/latest、commit/submit、push、clean、hide；胶囊超过1个角标数0，0数字角标数0。
- Commit第一次降序ball-maze(8)、meow-generator(4)、git-together(2)，再点Submit升序git-together、meow-generator、ball-maze；同组共享排序键。子分支0也正确排在正数前。
- Push第一次降序git-together(2)、ball-maze(1)、meow-generator(1)，与Commit独立；Pull/Get Latest共享降升序，meow-generator的0在升序最前。所有表头按钮只排序，弹窗open=false，Clean/隐藏排序后仍3仓库8分支。
- 搜索ui/显示2仓库2分支；仓库ball-maze Submit范围仅1仓库1分支ui/mobile，说明明确Commit + Push。截图updated-filtered-scope.jpg。
- H5测量每个分支SVG左边缘与其仓库名称左边缘相同，gap=6px。2个未关联分支仅download/hide。
- 检查演示74个按钮同相位呼吸、12行aria-busy=true；结束后busy=0，20个角标序列与检查前完全相同，无0角标。浏览器warn/error日志为空。
- 保存updated-light.jpg与updated-dark.jpg，恢复初始名称排序、全部分支、浅色并markDeliverable。浏览器使用当前实际视口，不以额外视口覆盖美化结果。
- 实际4173开发App可加载，但显示0账号/0仓库；因此生产分支实际几何和真实账号导航本轮未观察，不能用H5或类型检查冒称原生包验收。只读查看后关闭临时开发浏览器页，保留H5。

## 交付与后续边界

独立H5已满足本次分组/角标/表头纠正；生产Dashboard对齐及进入项目侧栏展开源码已修正。生产五组布局、数字排序和真实Git批量动作仍由父项追踪，本轮没有改变安装包或公共更新。其它任务的未提交修改全部保留。
