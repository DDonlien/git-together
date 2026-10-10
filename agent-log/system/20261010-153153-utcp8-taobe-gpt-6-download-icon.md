# H5独立下载图标

## 用户原始 prompt

下载应该用单独的图标

## 执行元信息

- 模型：gpt-6，当前可得具体标识。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支/提交：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7，沿用上一轮刚核对的HEAD；工作区并发修改全部保留。
- 首次工具时钟：2026-10-10 15:29:53 UTC+8；结束：2026-10-10 15:31:53 UTC+8。
- 需求：IMPORT-14-download-icon，归属IMPORT-14-grouped-actions。

## 行动与范围

延续用户当前4186 H5视觉纠正。先读取现有映射，确认下载曾复用Get Latest云下载。登记需求后，复用Phosphor regular DownloadSimpleIcon生成独立19px静态SVG，preview.js的download映射改为download。向下箭头加托盘区别于Get Latest云下载；下载范围弹窗同步使用该图标。下载名称、worktree语义、两按钮布局及其余成对图标保持。

更新DESIGN、REQUIREMENTS和预览README。生产源码/版本未更改，未提交、推送、构建、打包或发布。读取当前AGENTS并发差异，其Commit接入属于其它任务，本轮不改动。

## 实际观察

刷新浏览器后两个未关联分支均显示独立下载图标，可访问名称下载，19px，每行仍2个按钮；Get Latest SVG保持云下载且与download不同。示例仍3仓库8分支。保存download-icon-light.jpg和download-icon-detail.jpg，预览markDeliverable保留。node --check preview.js与git diff --check退出0；未新增/运行自动化测试。

Memory仅用于局部视觉修改与预览/源码/安装包状态边界，本轮没有修改安装包。
