# Git Together 线框布局 v0.1

本文件仅以当前对话中最近确认的界面要求为依据。不调用真实 Git、不连接 GPS，界面内容均为模拟数据。

## 如何打开与编辑

在 draw.io / diagrams.net 中打开 `GitTogether_Wireframes_v0.1.drawio`。也可拖入桌面版。

文件包含 13 个页面，画布全部为 1600 × 900（16:9）。它是未压缩的原生 XML，不是把效果图贴进 draw.io。
框、文字、按钮、勾选框、列表行和 Graph 连线均可独立编辑；页面内常用组件已分组。要改内部元素，可双击进入组或取消组合。

首页的页面导航、Dashboard 的展开箭头、仓库名称，以及 Repo 的右侧标签带有页面跳转链接。它们只用于查看线框状态，不是执行 Git 操作的原型。没有给所有按钮伪造可用动作。

## 页面索引

| 页面 | 内容 | 依据 |
|---|---|---|
| 00 | 阅读说明、已确认项与待定项、页面导航 | 文档说明 |
| 01 | Dashboard，所有仓库折叠 | 已确认列表结构；工具栏为方案 A |
| 02 | Dashboard，Ball Maze 展开三个分支 / 本地工作目录 | 已确认展开需求；工具栏为方案 A |
| 03 | Dashboard，选择三个工作目录执行批量操作 | 方案 A，待用户确认 |
| 04 | Dashboard，三项操作分别成功、失败、进行中 | 示例状态；未确定调度、重试策略 |
| 05 | Dashboard，仅选中或悬停行显示操作 | 方案 B，待用户确认 |
| 06 | Repo，Tracked / Untracked + Git Graph | 已确认结构 |
| 07 | Repo，Tracked / Untracked + 文件夹 | 已确认结构 |
| 08 | Repo，选中文件后的 Diff 展开 | 交互位置建议 |
| 09 | Repo，AI Gen 生成提交说明 | 示例状态 |
| 10 | Repo，Commit 本地提交成功 | 示例状态 |
| 11 | Repo，Commit 失败并保留输入 | 示例状态 |
| 12 | Repo，详情栏收起，中央区扩大 | 布局状态示例 |

## 已确认的界面要求

### Dashboard

- 顶部保留统计卡片，下方是列表，不是 grid；列表顶级行对应仓库。
- 同一仓库支持展开显示多个 branch / worktree。父仓库行与子行有明确的层级和固定列对齐。
- 点击仓库名称打开 Repo，不提供 Open Repo 按钮。
- 保留 Get Latest、Submit、Fetch、Pull。前两者是 Git Together 的特殊操作，使用两种克制的强调色；后两者使用中性色。
- 不再增加一个独立的 Workspace 产品层；仓库入口统一在 Dashboard 与左侧仓库导航。
- 按钮要轻量、对齐，不通过重复的大面积彩色按钮制造噪声。

### Repo

- 当前重点是仓库导航、中央文件 / 提交区域和右侧详情。
- 仓库导航集中展示分支和本地 worktree；正文不重复大标题或 branch Switch。
- 中央上方只保留 Files 与 Commit。Commit 独立页的具体内容尚未确定，本版没有将它擅自定义为历史页。
- 文件区域仅分 Tracked 和 Untracked，不再按 Staged / Unstaged 分成三个大区。
- 勾选框承担提交选择 / 暂存状态的表达；删除 Stage All、Unstage All、Add All 三个大按钮。
- 标准提交表单包含 Summary 与 Description，不保留 Commit / Commit with AI 子分栏。
- AI Gen 是 Commit 旁边的一个按钮，不是独立 Tab。
- 右侧本版只展开 Git Graph 与文件夹两种状态；Git Details 与 Terminal 暂不铺开。
- 文件夹是目录树，不是 File Inspector；彻底移除 Current File 下半区。
- Git Graph 中较旧提交在下，较新提交在上，并使用可编辑的实际节点与连线。
- 允许收起详情栏扩大文件区；切换布局不应改变正在查看的工作目录。

## 待确认的设计选择

### A 与 B 是备选，不是已确定的新需求

**方案 A（01–04 页）**：在列表顶部放一组统一操作，明确当前选择范围。列表行不再重复四个按钮。适合多个仓库批量管理。

**方案 B（05 页）**：只有选中或悬停的行显示轻量图标操作；图标位置固定。键盘焦点进入该行也应有同等可达方式。具体焦点 / 悬停行为仍需原型验证。

两者都保留四项功能，但并未要求最终产品同时采用两套。

### 仍需补充的行为定义

1. 父仓库行上的 Get Latest / Submit 针对哪个工作目录？选中父行是否选择全部已管理的本地 worktree？
2. 未检出的 branch 没有独立工作目录时，哪些操作可用？本稿示例子行都标记为已有本地 worktree，未假设每个 branch 都有文件工作区。
3. Fetch 的范围是仓库还是某个 remote？Pull 的默认合并 / rebase 策略不由线框决定。
4. Tracked 区域默认只显示有变化文件，还是允许切到全部 tracked 文件？本稿是 Changed files 状态，不把整个项目的所有文件强行列入。
5. 勾选框是立即操作 Git index，还是先保留“待提交选择”，提交时才执行？部分暂存和已暂存后再次编辑如何表达？
6. 新文件在勾选后是否从 Untracked 移动到 Tracked，或本次编辑周期内保留分类？本稿没有静默决定这一点。
7. AI Gen 能否覆盖用户手写的 Summary / Description，能否取消，以及生成时是否允许提交？09 页只是待调整的例子。
8. Commit 成功是否自动清空表单？本稿演示清空。Commit 只表示本地提交，不能伪装成已 Push / 已合并。
9. Files 页顶部的 Commit Tab 独立内容需要确认，未放入一个未经要求的历史页。
10. Diff 的位置、展开尺寸以及二进制资产预览方式需要后续原型确认；不能给 UE 二进制资产显示虚假的文本 diff。

## 稳定组件编号

- D-01：Dashboard 统计卡片。
- D-02：仓库列表，包含仓库行与分支 / worktree 子行。
- D-03：统一操作栏或当前备选的行内操作规则。
- R-01：仓库 / 分支 / worktree 导航。
- R-02：文件选择与 Diff。
- R-03：Summary、Description、AI Gen、Commit。
- R-04：右侧 Git Graph / 文件夹。

每个页面的 XML 元素 ID 均以页面编号开头，例如 `p06-R-03`。复制到开发任务时，可用“只修改 R-03，其余不变”限定范围。

## 版本边界

当前文件没有设计 AI 任务 / 对话、Presence 独立列表、GPS 管理等其他页面；这不表示删除那些产品能力，只是按本轮约定先做好 Dashboard 与 Repo。

图中的数据是演示数据：8 个仓库、11 个本地 worktree、3 个 Agent、1 个 Presence 提醒。分支名称、提交编号、人员活动均不代表实际仓库状态或强制命名策略。

预览图由与 draw.io XML 同源的几何和文字渲染，仅用于快速浏览；正式编辑以 `.drawio` 源文件为准。
