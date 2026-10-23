# Presence 插件

Presence头像位于仓库名称和具体分支名称的右侧，与名称垂直居中；18px账号头像环最多显示三个重叠头像，点击查看全部对应人员及操作分支。侧栏收起隐藏名称时头像也隐藏，展开后恢复。头像来自服务器统一profile；头像环颜色按Presence服务器、账号身份和设备ID稳定派生，不包含仓库或组织范围，因此同一个用户/设备在不同仓库中颜色一致，不要求不同设备颜色一致。

圆环优先级为编辑中闪烁、未Commit更改虚线、未Push提交实线；已Push且没有其他编辑/更改、只有远端领先、离线或过期的会话不占头像。弹窗逐分支说明实际状态，减少动态效果时编辑圆环保持静态。当前头像客户端使用远端协议2，NAS继续向旧客户端提供协议1；编辑器上报仍为本机协议1。未Push依据Bridge最近读取的remote refs，不执行Fetch，不能提前识别尚未读到的其他设备更新。

GitTogether 0.23.0 源码提供首轮 Presence 接入。「设置 → 插件 → Presence」可启用、停用、配置服务器和重新连接；NAS、服务器会话与此电脑的状态分别显示。停用会关闭本应用的连接，不停止独立的本机 Bridge 或服务器。

NAS 服务已实际部署；当前源码与网页预览已连接。0.23.0 桌面更新尚未正式发布：按照 2026-10-12 最新发布规则，需在同次交付中补齐 Windows x86/x64，当前公开 macOS 版本仍为 0.22.11。未操作用户已安装的应用。

首个服务器为 `https://git.freshli4.com:10443/presence/`，运行在 NAS 的独立 Docker 容器。初次只登记 `github.com/ddonlien/git-together` 和 `github.com/ddonlien/git-presence`，不是自动共享全部账号仓库；其他成员、仓库和设备需在服务器中独立授权。

## 首次连接

本轮已在当前 Mac 的 `~/.config/git-presence/` 准备私有访问配置并启动独立 Bridge。`gittogether.local.json` 保存仅观察的 NAS 授权，当前机器的新插件可直接读取；客户端默认配置在其他机器上是停用且未授权。访问文件不进仓库、日志或安装包。

应用保存设置后将配置写入系统加密的 `presence-v1.encrypted`，不返回密钥给界面。配置中可填写其他成员自己的服务器和密钥；空密钥保留原值，更换服务器必须填写新密钥。不要使用 GitHub/Gitea 的账号令牌作为 Presence 密钥。

## 本机状态与团队状态

独立 [GitPresence Bridge](https://github.com/DDonlien/git-presence) 检测已登记工作区，并接收 Unreal/Godot 编辑器插件的状态；GitTogether 不启动 Node sidecar、不执行 Bridge 的 Git 写操作。Bridge 可以在 GitTogether 窗口关闭后继续运行。

此电脑状态通过受保护的 loopback API 读取；团队状态通过 Rust 原生 WebSocket 观察者读取，网络心跳与重连由 Rust 管理，不随页面切换重置。当前会话只观察 GitTogether/GitPresence 的真实工作区；尚未在本轮启用 UE/Godot 项目的编辑器来源，因此界面显示「编辑器未接入」，不能据此认定编辑器内存没有修改。

仓库文件夹上的圆点与实际在线会话相符。工作台展开 Presence 可查看工作区/分支与文件的 Git 修改、编辑器未保存状态；两个状态独立，保存不会清除 Git 修改。服务器断开、来源失联或扫描未完成会显示未知，保留上次记录用于识别，不当成当前 clean。

## 运维入口

NAS 服务配置：`/vol3/docker/gitpresence/config/server.local.json`；只包含授权令牌的 SHA-256。源码与 Compose：`/vol3/docker/gitpresence/source/`；容器 `gitpresence`，镜像 `gitpresence:0.2.0`。健康检查位于 `/presence/health`，不需要账号；会话读取必须认证。

容器非 root、只读、移除 capabilities、禁止提权、自动恢复；主机端口只监听 loopback，由已有 HTTPS 反向代理传递 WebSocket。没有挂载 Git 仓库、文件正文或本机/Git 凭据。进程重启清空在线快照，Bridge 重新上报；本轮不包含强制文件锁、持久化审计或其他机器的安装验收。

正在协作端操作、尚未出现在本机或已读取远端中的分支，会以「仅协作端」加入展开清单供查看人员；不会因此获得本机Git操作或下载尚不存在的远端分支的能力。NAS支持同账号多个只读订阅并存，编辑器重连后等待新报告才认定editing。
