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
