# 任务清单

## Phase - v0.1.0 - 原生远端客户端

### ios/main: 浏览远端与控制桌面工作区

- [ ] \[0.1.0-FE-A-001-remote] 使用真实 GitHub、GitHub Enterprise、GitLab、Gitee 和 Gitea API 连接账号、读取仓库、筛选置顶、浏览分支、提交图、更改和文件树。支持分页和错误反馈，手机不创建本地 Git 仓库。
- [ ] \[0.1.0-FE-A-001-presence] Presence 支持独立账号登录、服务器列表和跨服务器身份交换，按原协议登记观察设备、读取状态和远程请求。Commit、Submit、中止、丢弃保留预览与确认，执行结果、取消排队、重试推送和恢复备份可查询。
- [ ] \[0.1.0-FE-A-001-devices] 仓库详情按服务器、设备、组织和worktree显示分支、HEAD、Git修改、编辑器未保存、正在编辑及未推送计数；同分支不同目录不合并，离线/断连保留记录并标记未知。
- [ ] \[0.1.0-UI-A-001] 底部导航和搜索采用 iOS 26 系统 Liquid Glass；正文沿用现有M3配色、实体卡片、筛选、标签、圆形操作和中英文文案；支持深浅色、Dynamic Type、VoiceOver和键盘安全区。
- [ ] \[0.1.0-FE-A-001-test] 验证提供方解码、路径编码、请求边界、设备及worktree隔离、陈旧预览和真实协议JSON；Xcode构建与Mac交互分别记录，未实测不勾选。
- [ ] \[0.1.0-FE-A-001-mac] 用户在Mac完成Xcode编译、Simulator/真机、Liquid Glass视觉、真实账号和双设备远程操作验收。
