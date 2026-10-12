# GitTogether 侧栏恢复文字品牌

- 用户原始prompt：`不用出现在这里，应用图标和仓库图标能有就行`，附图指出侧栏GitTogether名称前的图标。
- 模型：gpt-6；起始时钟2026-10-12 13:11:55 UTC+8。
- 起始main：948338f609；工作区有其他任务的未提交改动，保留其状态。
- 需求：CONTENT-01-icon-sidebar-text，属于已交付品牌图标的视觉纠正。
- 按当前持续授权执行main提交/推送、Mac公证和Windows双架构联合发布；不操作安装版。
- 范围：仅移除SidebarHeader中的品牌图片及仅服务该图片的样式；保持导航、按钮、名称与原尺寸。应用图标和仓库原图不重绘或替换。
- 记录：读取当前实现、DESIGN、REQUIREMENTS、发布规则及记忆中的验收边界；重新核对当前main和公开版本，按新反馈更新设计规则。
- 结束时钟：2026-10-12 13:40:40 UTC+8；检查、main推送和v0.28.1三平台联合发布完成。没有把发布称作安装版已更新。

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

## 最终交付

- 0.28.1正式发布：https://github.com/DDonlien/git-together/releases/tag/v0.28.1；最终冻结来源3ad94fdc08f69953b8fb5459e5145d453322006c，三个平台一致。
- 恢复脚本先确认六组应用输入与冻结commit一致且无未提交改动，验证保存的Mac版本、唯一主程序、Developer ID签名、公证票据和Tauri更新签名，再复用38207754941的成功Windows x86/x64报告；没有重新生成Mac字节或混用来源。
- build-info.json为publicUpdateVerified=true；latest.json包含三个平台。两种Windows应用的PE架构、完整摘要、临时安装、WebView2启动、卸载和八项原生核心检查通过；x86运行环境为Windows Server 2022 x64/WOW64，不冒称纯32位设备验证。Windows安装器没有Authenticode配置，版本绑定更新签名验证通过。
- Mac公证Accepted，ID3f063262-6145-4bed-8b6c-a6ae5e5bd81c；原应用ICNS与仓库三种品牌原图、ICO和favicon逐字节未改动。原导航按钮、品牌文字间距和主题规则未改动。
- 发布说明补入本轮侧栏纯文字修正并回读；保留已有功能和平台边界。需求子项按完成结果标记已完成。
- 无自动测试新增或旧测试运行；没有操作、替换或重启用户安装的App。只关闭本轮隔离预览，保留其他任务的工作区改动及原有服务。
