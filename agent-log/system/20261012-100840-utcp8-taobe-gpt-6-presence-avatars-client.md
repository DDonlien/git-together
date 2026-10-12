# Presence 仓库与分支头像角标

- 用户原始 prompt：仓库的文件夹图标左上角需要一个圆形头像框，略大于现有角标，最多三层；点击弹出全部正在操作此仓库的人员与操作分支，展开仓库后每个分支只展示该分支人员。实线表示 Commit 尚未 Push，闪烁表示 Presence 识别的 editing，虚线表示未 Commit change；远端领先不放头像角标。同账号跨仓库头像一致，边框颜色区分仓库，通过 Presence 账号同步。
- 用户补充确认：编辑闪烁优先，其次未 Commit 虚线，最后未 Push 实线。
- 模型 gpt-6（环境可提供的最具体标识）；执行者 taobe。
- 开始：本轮消息后开始预检，首次可核对工具时钟为2026-10-12 08:43:46 UTC+8；接入与界面交付结束：2026-10-12 10:08:40 UTC+8；预检 main/b491264e30，0.23.0，fetch 后0/0；本轮提交尚未执行。
- 已读根/macOS规则与在线模板（通用前缀一致）、Presence协议/Bridge/服务器、实际图标与Popover调用；保留未提交的Windows、图标及远控工作和其他任务暂存区，不操作用户安装版。
- 成功标准：真实服务器下发统一账号头像与未推送计数；仓库/分支正确聚合、同账号去重、三头像上限与完整清单；环状态遵循已确认优先级；离线/过期不冒充正在操作，远端领先不生成角标；类型/Cargo/构建和实际部署、界面分别留证据。未请求测试，不新增或运行项目测试套件。
- 首轮实现：18px头像环，7px层间偏移，沿用Material弹出层和关闭/焦点/点击外部/Escape行为；头像点击与仓库导航分开，读取及Push反馈继续占右下角；仓库颜色由逻辑repositoryId稳定派生。
- 事实扩展：GitPresence远端协议2包含server-authoritative avatarUrl与Bridge计算的unpublishedCommits；现有本机编辑器协议1保持。NAS须支持协商v1并剔除新字段，避免正在交付的0.23客户端被新状态格式断开。只读Git计数依据已知remote refs，不Fetch/修改用户文件或发布文件正文。
- 同期远控任务也在GitPresence服务器增加独立control配置；头像流程不授权远控，部署与暂存须排除其未完成改动。其他任务已修正CLI grant的control默认字段，保留其归属。

## 实际结果

- GitPresence类型检查已通过；此前检查遇到同期新增的control输出字段，后由该任务补齐默认false，不改变头像令牌权限。GitTogether类型/Cargo核验进行中。


## 用户完整原文

仓库的文件夹图标左上角需要一个圆形的头像框，具体设计与交互要求如下：

1. 尺寸与样式：
尺寸应稍微大于我们现在的角标，但也不要太大。

2. 堆叠规则：
允许多层堆叠，最多三层。也就是说，当超过 3 个人时，也只显示 3 个人的头像框。

3. 交互与展示逻辑：
(a) 整体展示：点击后会展开一个简单的 pop-up，显示所有正在操作这个仓库的人员清单，以及他们对应的操作分支。
(b) 分支展示：如果展开了仓库文件夹，会在每一个具体分支角标的左上角也显示对应的信息。点击展开时，单独展示该分支上的操作人员。

4. 状态显示：
角标文件头像框的圆环有3种状态
实心：代表这个人已经Commit 了一些内容，但还没有提交到远端
闪烁：代表这个人的操作正在 editing，是由 presence 服务器识别到的。
虚线：代表这个人本地有一些未 commit 的 change。
如果有些人已经有东西提交到远端了，那就认为他并没有在修改这些东西，而是远端比你更新，我们就不用左上角的头像角标来处理了
同一个账号的不同仓库，用头像角标的边框颜色做出差异，但头像应该是一致的，通过我们的presence账号同步

## 最终交付与实际证据

- 功能源码：GitTogether 6fa089a105（0.24.0）及0ee8b0022a已提交/推送；GitPresence f2cde7c（0.3.0）、232a7a9编辑器重连活动复位及2425f5a多观察者连接均已提交/推送。保留了同期Windows、状态表头/排序、图标及远控未完成改动，未将其纳入本轮提交。版本为新增兼容能力而递增minor；本轮修正仍属同一次未发布能力交付，不另开版本。
- scoped快照核验：GitPresence类型/构建、GitTogether类型/Cargo --locked/277模块生产构建通过。保留既有大分块建议。未新增或运行项目测试；原有state/network fixture仅同步必需字段和消息版本，不能称为测试通过。隔离快照没有纳入未提交的远控实现。
- NAS最终从2425f5a精确归档构建，healthy与正常TLS health返回远端协议2；镜像sha256:07fb1d05afd927ad604c78e0a5a7a7b60ccd455bf1a6fe769ebd2a26bdb19f89，源归档SHA256 1746e81d8c6f935cfd3a9f553c1da9ad8d6af7eb11c2d3f682a1fd26ad20e6df，deployment-info.json已记录。原源目录与配置作可恢复备份；服务器仍非root、只读、限loopback和原HTTPS路径，未增加仓库grant或control权限。仅将原taobe账号两份grant的公开头像统一为已由GitHub API读回的头像URL。
- 独立Bridge升级并启动，真实上报GitTogether/GitPresence两个工作区；Rust观察者与loopback读回均connected，账号Taobe头像及main、真实changed和unpublishedCommits已读回。观察时两个项目未推送计数均0，与直接只读Git计数相同；变化数量属于瞬时事实。未在本轮启用UE/Godot编辑器来源，不把样式示例当成真实编辑器editing或多用户上报。
- 协议1/2实际并发读回：两个observer使用与Bridge相同的设备标识仍能同时保持OPEN，Bridge的两项目仍可见，v1没有avatarUrl/unpublishedCommits新字段。观察者不再替换发布会话；Publisher同设备替换仍保留。证据在GitTogether ignored macos/artifacts/presence-avatars/concurrent-observers.json与live-profile-proof.json。
- 浏览器最终核对：真实头像18px且坐标在文件夹左上，两个仓库环颜色不同而头像一致；四人独立样式示例露出3头像、弹窗4人；feature/ui弹窗仅Alex/Bella并且仅列本分支。指针为pointer，关闭回焦点、Enter重开、Escape关闭正常。real-popup.png、stack-popup.png、branch-popup.png为对应实际页面；虚构人员只存在ignored设计预览，未发布到NAS。预览4193/Rust4196使用任务独立数据目录，跳过授权助手启动，未操作安装版或清空主预览账号。
- 修复预览发现的CSS覆盖：官方Disclosure默认relative会盖过低优先级的绝对定位，增强Avatar专属选择器；初版独立预览漏基础CSS造成弹窗静态/页面滚动，按正式入口补齐后重新核对。弹窗名册变动重新计算共享定位，关闭显式回焦点。另补协作端未Push新分支的只读可见行，标为仅协作端；下载仍须真实远端分支，本机Git动作仍只依赖本机关联目标。
- 本轮未打包、公证或发布桌面更新，不能称为用户安装版已更新；三平台发布仍按Windows/macOS既有流程和PRESENCE-04-release独立跟踪，不操作已安装GitTogether、不请求解锁。保存已运行的Bridge和预览，不注册新的系统启动任务。收尾仅提交本轮需求/使用说明/日志，推送与远端回读完成后结束。
