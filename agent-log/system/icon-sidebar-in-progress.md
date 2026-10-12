# GitTogether 侧栏恢复文字品牌

- 用户原始prompt：`不用出现在这里，应用图标和仓库图标能有就行`，附图指出侧栏GitTogether名称前的图标。
- 模型：gpt-6；起始时钟2026-10-12 13:11:55 UTC+8。
- 起始main：948338f609；工作区有其他任务的未提交改动，保留其状态。
- 需求：CONTENT-01-icon-sidebar-text，属于已交付品牌图标的视觉纠正。
- 按当前持续授权执行main提交/推送、Mac公证和Windows双架构联合发布；不操作安装版。
- 范围：仅移除SidebarHeader中的品牌图片及仅服务该图片的样式；保持导航、按钮、名称与原尺寸。应用图标和仓库原图不重绘或替换。
- 记录：读取当前实现、DESIGN、REQUIREMENTS、发布规则及记忆中的验收边界；重新核对当前main和公开版本，按新反馈更新设计规则。
- 检查、提交和发布：执行中；结束时钟待记录。没有把源码变更称作安装版更新。

## 源码与界面验证

- 删除SidebarHeader的品牌图片、CSS import及只服务图片的13行CSS，回到已有sidebar-brand规则。开关、文字和aria语义不变；应用ICNS/ICO、favicon和仓库三种原图未改动。
- 干净main镜像分配0.28.1，TypeScript检查通过、285模块生产构建通过、diff检查通过；保留原有大chunk提示。
- 隔离静态页面确认header下0张图片、文字GitTogether、32×32开关；实测收起隐藏文字及展开恢复。截图artifacts/brand-sidebar/sidebar-text-only.jpg为208×96 JPEG。API不可用反馈属于无账号的隔离静态预览，本轮只验证侧栏，不代表真实账号/Git验收。
- 继续按持续授权推送、签名公证和三个平台的联合发布；不操作用户安装版。

## 推送与原生包阶段

- 图标移除修正已提交并推送：3ad94fdc08f69953b8fb5459e5145d453322006c，来源main。发布镜像固定0.28.1，不收录其他任务未提交的改动。
- package:desktop再次通过类型、Cargo --locked和生产构建检查。Mac输出/Users/taobe/Projects/GitHub/Personal/git-together/_builds/gittogether-0.28.1-macos-arm64-fSV1yX已完成Developer ID、staple/validate、严格签名验证及spctl。Apple公证Accepted，ID3f063262-6145-4bed-8b6c-a6ae5e5bd81c；Tauri tar版本绑定签名及解压结构校验通过。
- 核对Mac包内icon.icns与已选定源资源逐字节相同；仓库三种原图、平台图标及favicon文件也逐字节不变。主程序目录仅有gittogether，版本0.28.1。
- Windows同源码双架构运行38207754941正在原生构建与安装校验；还未正式发布，不将Mac阶段当作联合交付完成。

## 查询连接中断与恢复

- 收集Windows结果时GitHub API返回裸EOF，已有暂时错误正则只包含unexpected EOF，因此未进入重试；package:desktop在Windows收集阶段停止，Mac公证产物保留，尚未创建正式发布。
- 修复为匹配独立EOF词，沿用只读API最多三次重试和既有下载清理/重试；不会重放不确定的工作流派发。此修复只影响发布工具，六组应用生产输入不变。
- 从保留的Mac产物与同一3ad94fdc08main提交的Windows报告恢复收集/发布，继续完整签名、公证票据及公共更新验收；不重复构建或混用其他commit产物。
