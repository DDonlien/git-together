# GitTogether v0.1 design QA

final result: blocked

用户反馈后的组件复查重新打开 UI-03。当前截图确认玻璃外溢、文字尺寸过小和组件状态不统一，原功能检查通过不能替代原生组件视觉验收。后续复查结果在本文件更新。

验收范围：独立 TypeScript 交互演示客户端。真实 Git、在线 AI、Presence 连接与 macOS 27 运行不在已通过结果内。

## 对照与环境

- 设计来源：用户 ZIP 的原生 draw.io、Notes、00–12 预览。主对照为 p01 / p06 / p08；全部页面都实际打开并截图。
- 浏览器：Codex In-app Browser；主对照 1600×900，窗口适应检查 920×740、移动视口 390×844。临时视口覆盖在交付前重置。
- 系统：macOS 26.6.2，Electron 39.8.10。native Liquid Glass 与 renderer IPC 就绪均由运行日志确认。
- 主题：系统字体与 Phosphor 图标。导航/控件玻璃、稳定内容材料，是用户明确要求的新视觉，不把线框白蓝主题当成逐像素外观约束。
- 原始图片没有产品插图，未添加装饰性 CSS/SVG 画作；SVG 仅用于由 commit parent 数据驱动的技术关系图。二进制/图片资产没有原内容，界面只显示说明，不伪造预览。

## 发现、修复与复查

1. 玻璃库默认 100% 高度撑大统一工具栏，且内容内部默认块布局。设置自适应高度并给内层明确的 flex 排列；复查 p01/p03/p05 与 segmented 控件通过。
2. Dashboard 的收缩 section 和大行高使底部行/页脚重叠。改为不可收缩的内容、44px 仓库行和自然纵向滚动；1600×900 折叠状态可见 8 个仓库。
3. 没有选中文件时，folder 的 undefined id 错误匹配，导致所有文件夹呈蓝色。匹配条件限定为实际文件；复查 p07，无文件时 active 数量为 0。
4. 原次要文字与错误色偏浅；加深语义 token 与占位文字，保留亮暗色 focus ring，减少透明度关闭内部滤镜。此次不是完整 WCAG 认证。
5. 场景切换可能留下旧任务和局部筛选状态。增加 generation 隔离、取消旧任务和视图重挂载；切换后无旧执行结果覆盖。
6. URL 场景初始化可能覆盖持久草稿。以 lastScene 区分显式载入与同场景刷新；通过真实刷新确认概要与选择仍保留。
7. 开发热更新增加自定义 Hook 时出现一次旧 Hook 顺序错误。重新载入恢复，并明确 App 的 refresh reset。最终重新载入后的浏览器错误日志为空。

## 必查视觉面

- 字体/图标：系统字体层次稳定，仓库/文件主文字为 11px；路径与图表辅助字为密集信息，不与标题争夺层级。单一 Phosphor 图标体系，无缺图。
- 间距/布局：全局仓库入口、branch/worktree 导航、中央文件与 Diff、底部表单、右侧 Graph/Tree 的顺序与线框一致；收起详情释放中央宽度。
- 材料/色彩：玻璃集中在导航、操作组与菜单。文件内容不透明；Get Latest 青绿、Submit 紫、Commit 蓝，状态同时提供文字/图标。
- 响应式：920px 保留可用三栏，Diff 必要时上下排；390px 使用图标导航、横排上下文、纵向内容。桌面窗口最小宽度 920px；移动仅为浏览器 fallback。
- 图片/内容：没有外部占位插图或假图片预览；所有 Git、AI、Presence 数据明确标注演示。Commit 成功始终说明“本地、未推送”。
- 交互/可访问性：原生语义按钮、带名称的 checkbox、indeterminate、焦点圈、弹窗焦点约束、Escape、Cmd+K、Cmd+Enter、减少动态效果；菜单与禁用/生成/成功/失败状态完整。键盘快捷搜索已实际验证。

## 结果

- 11/11 domain 测试，4/4 静态服务测试，TypeScript strict 与生产构建通过。
- 33/33 浏览器断言通过：00–12 场景、AI 覆盖确认与取消、失败保留、成功删除选中项并更新 Graph、详情折叠、减少透明度、搜索、来源空态、统计筛选、11 worktree 选择、Commit 预览、未检出分支边界、添加演示仓库/分支/worktree、Graph 详情、Split Diff/复制、Cmd+K、单项取消、场景复位、刷新存储。
- 额外人工点击验证：3 项 Submit 分别 1 成功 / 2 失败；Lebab 本地 commit 保留且未 Push，Must Be Human 因冲突阻止；其他工作目录隔离，二进制资产不显示文本 Diff。
- 图像证据保存在本地 `artifacts/scene-00.jpg`–`scene-12.jpg`，最终 Repo 截图为 `artifacts/repository-diff.jpg`，窄窗口为 `artifacts/repository-920.jpg` / `repository-390.jpg`。

## 验证边界

锁屏阻止了 native app 的 AX/屏幕目视检查；原生系统视图启用由模块与 renderer 就绪日志确认，不把它当成桌面视觉验收。macOS 27 未运行。没有执行真实 Git、读取凭据、调用在线 AI、连接 Presence、代码 commit/push 或远端部署。旧 MAIN 工作目录保持 clean。
