# Presence 插件

GitTogether 0.23.0 提供首轮 Presence 接入。「设置 → 插件 → Presence」可启用、停用、配置服务器和重新连接；NAS、服务器会话与此电脑的状态分别显示。停用会关闭本应用的连接，不停止独立的本机 Bridge 或服务器。

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
