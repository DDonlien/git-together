# Presence人员卡片的远程操作

- 用户原始prompt：「这里应该显示可执行的远程操作」。附件为协作人员姓名、main分支和未Commit状态的卡片。
- 模型：gpt-6，环境提供的最具体标识。
- 任务开始：2026-10-14T02:12:43.346613+08:00;结束：2026-10-14T02:51:17.039371+08:00；源码交付完成，正式发布被公证读取阻断。
- 基准：main，ba98095406d79c7e52e0300fcf16a079531010af，0.30.11。沿用本对话干净main副本，fetch确认与origin/main一致；共享工作区WIP和索引不动。
- 需求：PRESENCE-05-remote-actions。

已阅读根/macOS协作规则、README、Presence需求与架构、此前设备名日志、Presence聚合、远程控制Provider/工作区/确认弹窗及共享Popover实现；模板通用前缀与远端v1.9.1一致。采用React Best Practices技能检查本次多个TSX组件的hooks、类型、复用和键盘交互。

当前弹窗丢弃了设备/工作目录身份，远程入口只在详情下方。将服务端授权的操作接到每个人员对应的具体分支下，按server/device/user/identity/repository/organization/worktree匹配；同名不能授权。本机不作为远程目标，离线和等待时禁用动作；工作目录标识仅为路径hash，不上报真实路径。旧设备无worktreeId时，仅允许唯一分支目标，歧义不选。

复用现有预览、说明编辑、确认、执行结果、重试推送和备份恢复；把动作按钮及结果抽成详情与弹窗实际共用的组件。确认弹窗放在Popover外部，打开后收起人员卡片，取消回到头像入口，防止点击Modal时outside-click拆掉会话。沿既有三头像、设备括号和圆环状态。弹窗操作按实际权限显示，不依据Presence编辑状态伪造可提交文件。

成功标准：人员分支有授权操作，精确目标匹配、离线禁用、预览/确认与详情同源；类型/Cargo/生产构建通过；NAS可接收并保留可选worktreeId；同源macOS ARM/Windows x86/x64正式包及公共更新源分别核验。依本轮约束不新增或运行测试，不操作用户安装版、不要求解锁、不为验证实际执行用户Git写操作。沿持续授权自动提交推送发布，复用公证配置。

版本由0.30.11修订为0.30.12：补上现有人员入口缺失的远程操作及精确关联，按patch递增。

类型检查与生产构建实际通过；客户端仅保留既有500kB分包提醒，不把提醒记录为失败。当前没有新增或运行测试，远程操作和真实Git写入未作为本轮验证动作。

兼容审阅发现旧服务器announce采用strict Schema，新字段不能无条件发送。补充state的worktreeIdentity能力声明，客户端只在true时发送标识；旧服务器保留原字段与唯一分支匹配，新NAS支持精确工作目录。未用猜测的版本号判断服务器能力。

最终客户端类型、前端生产构建及locked Cargo检查均实际通过，未运行测试。React技能审阅：所有hooks在早退之前调用，动作/结果共用组件，无新网络读取层；使用精确来源键及既有语义按钮、禁用状态、独立Modal和焦点返回。弹窗和Modal阻止点击穿透，保留三人堆叠、状态优先级及每分支筛选。

## 候选包及发布阻塞

客户端源码f935173c4df9db382d05a84f76df8b988d7032a2已提交推送main。NAS 9eee311708cc422854130e64b9ab90b6b22f8e63已部署0.6.2 healthy，imageId sha256:3a981ae87042cb09c30822a8d4e20958f8855360d46b82021a4847fcc6d2a038，配置/数据库挂载、UID/GID及只读root不变，正常TLS健康、Gitea和Ink均200。部署文档及最终记录另由GitPresence提交。

标准发布预检的notarytool history返回69/No Keychain password item found for profile: gittogether-notary，多次默认读取一致。登录钥匙串仅查属性，没有同名公证条目；标准API以禁止交互模式查DataProtection元数据返回-25300，正确用户session查询亦未返回条目，标准备用目录没有API密钥或额外profile。仅能确认当前不可读，不能把它推断为永久丢失，也不能要求用户重复配置或解锁。Apple TN3147明确默认profile来自DataProtection钥匙串，登录文件型钥匙串的属性查询不证明默认profile被删除：https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool 。没有输出密码/令牌、改钥匙串配置或安全设置。

为继续完成可独立工作，临时构建入口只跳过历史预检，保持main、源码摘要、更新公钥、真实submit/Accepted、签名/staple与全部正式发布门槛。官方类型/Cargo及原生arm64构建实际通过，最终App只有gittogether主程序，Developer ID deep/strict通过。实际submit也返回相同69，尚无提交UUID/Accepted/staple；没有发布或把未公证ZIP加入更新源。临时入口在交付时清理，不改变正式打包脚本。

Windows工作流38446052848使用同一f935173c源码，x86/x64实际构建、安装、启动、有限平台验证及卸载通过；两个最终下载包已用既有更新密钥签名并通过版本、PE架构及更新签名校验。未配置Authenticode，不将更新签名混同Windows系统签名。公共latest仍为v0.30.11，不把新源码/候选包称为用户已更新。

候选目录：_builds/_builds/gittogether-0.30.12-macos-arm64-Rrt4k0，build-info.pending-notary.json包含来源、摘要及Windows记录，明确notarized=false/publicUpdateVerified=false。

| 候选资产 | 字节 | SHA256 |
| --- | ---: | --- |
| macOS ARM ZIP，尚未公证 | 6537325 | 9ce811b61dac5ccc6bf9f0b503e807fa326ae6356f533f8b007520b2d3f4aef9 |
| Windows x86 | 5619450 | e9250bfdb534fdb2337ebc0aed936a94cfe170227879d83c0048d29c60cec44f |
| Windows x64 | 6024810 | 018321af5651d26784a46f0ea5e3c82806fc582c8de47d3492607ab2ae186f4b |

未新增或手动运行测试，不操作/启动/更新用户安装版，不要求解锁，不代执行Git写操作。只清理本任务临时构建入口及自己所有的发布锁，保留最终候选和来源记录。源码可审阅；剩余门槛是既有公证配置恢复可读后，对同源Mac包取得Accepted并staple，再完成三平台正式发布与完整公共回读。安装版人员卡片及真实双设备执行尚未验收。

收尾推送遇到另一对话正常推进main：398a6358/e429aaee实现操作收起，已包含本次f935173c并将minor递增0.31.0。只重放本任务尚未公开的文档提交到最新main，保留两边源码与记录，没有force push或触及共享WIP。0.30.12同源候选作为历史保留，未来正式发布使用包含本修复的0.31.0主线；另一任务也独立观察到相同公证读取错误。全局发布锁仅在确认属于本任务后移除，不继续阻挡其他交付。
