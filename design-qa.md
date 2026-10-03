# GitTogether 0.1.2 design QA

final result: passed

本轮验收范围：UI-04 的容器层级修正，以及 UI-03 统一控件的前端回归。结果只覆盖独立 TS 演示客户端；不表示真实 Git/AI/Presence、AppKit 原生控件或 macOS 27 运行通过。

## 本轮来源、环境与对照方法

- 用户三张截图依次为当前侧栏416×1706、系统设置侧栏476×1904、系统设置整窗1670×2122像素。源图DPR未知，不将设备像素当作CSS像素，也不按跨应用文字/头像/图标做逐像素验收。
- 主对照是整窗关系与左栏边缘：统一底色 → 内缩悬浮导航 → 右侧平面分组。将用户源图和本轮1600×900暗色Repo/生成中截图放在同一次图像输入中检查；亮色亦独立审查。保留GitTogether内容和密度，明确应用内容、纵横比例与参考不同。
- 浏览器为Codex In-app Browser；主截图1600×900，另查920×640/740、390×844，最后重置临时视口覆盖。系统macOS26.6.2，Electron39.8.10，OpenGlass UI0.4.0。
- 无外部占位照片或装饰图；用户个人账号照片/系统设置图标仅是参考，未复制到产品。保留系统字体、Phosphor图标和基于父子数据的Git Graph，不伪造二进制图片或文本Diff。

## 本轮发现与修复

| 级别 | 发现 | 修正与复查 |
| --- | --- | --- |
| P1 | 全局导航贴窗边，缺少悬浮外壳 | 8px内缩、22px圆角、完整细边缘与轻投影；13个场景均检查边界 |
| P1 | Dashboard/Repo用整页立体面板包住工作区 | 外壳透明，共享窗口背景；统计/仓库表与上下文/文件/Diff/表单/详情独立平面分组 |
| P2 | Repo分割列紧贴、文件名被压缩 | 12px组间距、文件列表最低240px；920px内部滚动，提交表单可见 |
| P2 | 批量栏仍继承库inline阴影，CSS未覆盖 | 用公开style设纯填充、boxShadow:none、borderWidth:0、blur:none，关闭该自有类光泽；重拍01–04、复查computed值 |
| P2 | 窄栏预览traffic lights贴边 | 缩小间距/内边距；920px三个按钮均严格位于侧栏内部；原生按钮随窗口宽度调整位置 |
| P2 | 新工具栏border简写与库borderColor触发React警告 | 改为borderWidth；最终浏览器错误日志为空，重新类型检查/测试/构建通过 |

上述本轮发现均已关闭，无已知未解决的前端层级问题。

## 本轮审查结果

- 字体/层次：系统字体，导航13px、文件12px、Diff11px；标题/正文/路径可区分，没有人为缩小以掩盖布局。来源是结构参考，未声称与系统设置字体逐像素一致。
- 布局/间距：左栏独立悬浮；桌面Repo各主要内容组 computed shadow/filter/border 为 none/none/0。1600px侧栏x/y=8、底部8px；920×640表单底部632px，固定控件可达；390px内缩6px、横排上下文与纵向内容，页面无水平溢出。
- 材料/色彩：暗色导航更深、内容稳定；亮色共享灰底与白色平面组。减少透明度关闭模糊且保留外边距/圆角，内部行分隔仍清楚。右侧内容不使用光学投影或玻璃折射。
- 内容/状态：00–12实际逐个打开并截图审查，包括批量部分失败、AI生成中表单禁用、成功明确“未推送”、失败保留输入与选择、Graph/Tree与收起详情。09首次截图落在生成完成后，重新实际触发生成后捕捉正在生成状态，未把完成截图冒称生成中。
- 交互/可访问性：实际点击Split、文件夹、收起详情、Commit预览；检查菜单方向键/Escape、设置Escape后恢复到打开按钮、Cmd+K聚焦搜索。实际失败提交后Summary和3个文件选择仍保留；恢复失败开关和空白草稿后交付。不是完整WCAG或所有快捷键重新认证。
- 源码验证：最终 `npm run check`、11/11业务测试、4/4静态服务测试、生产构建和 `git diff --check` 通过；没有部署。

## 本轮截图与运行边界

可信视觉证据：`artifacts/hierarchy-scene-00.png`–`hierarchy-scene-12.png`，`hierarchy-after-repo-light.png`、`hierarchy-after-repo-dark.png`、`hierarchy-settings-dark.png`、`hierarchy-repo-920.png`、`hierarchy-repo-390.png`、`hierarchy-settings-390.png`、`hierarchy-dashboard-920.png`。截图逐张目视检查，批量栏修正后01–04重新采集。

前段实际Native AX和截图 `hierarchy-native-current.png` 确认了悬浮导航和平面内容。最后桌面重启日志确认原生材料/renderer就绪，但Mac随后锁屏，最新桌面截图和原生最小尺寸尚未复查。最后恢复默认视口后的截图出现与同期DOM不一致的旧帧，`hierarchy-final-preview.png` / `hierarchy-repo-920-final.png` 不作为新验收证据；交付采用已核对的1600px截图，不冒称最终默认视口截图已通过。

临时视口覆盖已重置，浏览器回到scene=08的文件Diff，预览与桌面进程保持运行。未执行真实Git/AI/Presence、读取凭据、代码commit/push或远端部署；旧MAIN未修改。本轮只改变视觉容器/材料及窗口按钮位置，业务模型和存储结构不变。

# 历史证据：0.1.0（以下不是本轮重跑结果）

保留首次交付的记录用于追溯；本轮范围、截图及验证限制以上文为准。

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
