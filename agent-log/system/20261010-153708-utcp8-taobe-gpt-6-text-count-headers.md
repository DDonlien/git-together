# H5操作表头改为文字与数量

## 用户原始 prompt

顶栏不要图标了，太啰嗦了，文字+数字（数字可以是角标）就好，文字分别是：
远端内容
本地内容
待提交
清理不需要排序，移除表头
隐藏

## 执行元信息

- 模型：gpt-6，环境当前可得标识。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 分支/提交：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7，沿用本对话已核对状态；所有其它任务未提交修改保持。
- 首次工具时钟：2026-10-10 15:32:10 UTC+8。
- 结束：2026-10-10 15:37:08 UTC+8。
- 需求：IMPORT-14-header-text，归属IMPORT-14-grouped-actions。

## 决策与实现

继续4186 H5视觉修订。把操作列的五组图标表头改成四个文字数量入口，依次远端内容、本地内容、待提交、隐藏。按Git动作口径沿用pull/push/commit/hide数量，即待拉取/待推送/未提交更改/已隐藏；在中途commentary说明该映射，未增加提问或审批流程。清理只从表头移除，仓库和分支行的五组、方向配对、共享角标、下载图标及Clean入口保持。

新增独立headerSorts呈现文字和正数角标；数字0参与排序，不画角标。表头没有SVG或方向图标，活跃排序用文字颜色和aria-pressed/aria-sort及可访问升降序名称反馈。第一次降序，重复点击升序。移除strip和actionButton中旧的表头图标分支、group-label样式；点击路径只排序，不调用执行范围弹窗。行内路径仍预览当前筛选范围。

修改独立artifacts/action-groups/preview.js、styles.css、README.md，以及REQUIREMENTS、DESIGN和本日志。没有更改生产App源码或版本，没有提交、推送、构建、打包、发布。Memory用于局部修改和预览/源码/包边界；未修改memory。

## 实际浏览器观察

- 表头文字顺序准确，初始正数为3、4、14；隐藏为0不画角标。SVG数0，表头Clean入口数0；行内Clean9个入口保持。
- 远端内容降序ball-maze/git-together/meow-generator，升序meow-generator/git-together/ball-maze，0在前。
- 本地内容降序git-together/ball-maze/meow-generator，升序ball-maze/meow-generator/git-together。
- 待提交降序ball-maze/meow-generator/git-together，升序git-together/meow-generator/ball-maze。
- 隐藏升降序各正常切换aria-sort，全部0维持原顺序。四个入口点击后执行弹窗均open=false。
- ui/筛选为2仓库2分支，文字数量为1、3、5；ball-maze仓库Submit范围为ui/mobile一分支。
- 亮暗截图及局部截图text-header-light.jpg、text-header-dark.jpg、text-header-detail.jpg已保存；恢复初始名称排序、全部分支、浅色，markDeliverable保留预览。
- 浏览器warn/error日志为空，node --check preview.js及git diff --check退出0。未新增或运行自动化测试。

当前交付仅H5文字表头，生产分组、数字排序和批量Git执行仍由父项追踪。
