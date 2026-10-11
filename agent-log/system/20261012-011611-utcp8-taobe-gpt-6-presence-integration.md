# Presence 插件与首个 NAS 服务器

- 用户原始 prompt：「把 presence 作为一个插件放到我们的设置选单里面，开始尝试把 presence 系统接入到 git together 第一个 presence 服务器，并在我们的 NAS 上创建一个 Docker 去部署」
- 模型：gpt-6（当前环境可获得的最具体标识）；执行者：taobe。
- 开始：2026-10-12 00:31:54 UTC+8；接入与部署核验结束：2026-10-12 01:16:11 UTC+8；起始 main/329cbe2eaf，fetch 后 0/0；实现提交：d84730f4df6f1d186515c1d63966db814e98edbb，已推送 origin/main。桌面正式交付仍未完成，见收尾记录。
- 已读：根/macOS AGENTS、当前 README/REQUIREMENTS/DESIGN/ARCHITECTURE、更新至 0.22.10 的交付与原生验证日志、GitPresence 的协议/Bridge/服务器/部署说明。通用模板仍 v1.9.1-260916-010202。
- 需求：PRESENCE-01-plugin、PRESENCE-02-state、PRESENCE-03-nas、PRESENCE-04-release；用户此次明确授权 NAS Docker 部署与 GitTogether 接入。沿用自动交付、复用公证和不操作用户安装版的持续授权。
- 其他对话正在修改提交范围/推送反馈、Rust Git 服务和图标设计；保留其改动，仅提交本轮内容。按照开发约束，不新增或运行项目测试；类型、Cargo、构建和真实部署连接分别记录。
- 已确认：GitPresence 是独立 Node 24/TS monorepo，协议 v1、Bridge 为本机唯一发布者；本机默认私有配置尚不存在。NAS SSH/Docker 可用，目前没有 Presence 容器；既有 gitea-caddy 提供 git.freshli4.com:10443 HTTPS。
- 决策：App 使用 Rust 只读观察者，不打包 Node sidecar；Bridge 继续独立检测 Git 与接收编辑器来源。服务器增加兼容 v1 的 observer 握手，禁止观察者发布快照。首轮登记 GitTogether 与 GitPresence 两个真实仓库，不自动共享全部账号仓库。
- 成功标准：设置可启停且秘密留在本机；NAS 独立容器健康；TLS 与鉴权正确；Bridge 的真实快照可在 Rust 客户端和 UI 读取；断线不变 clean；正式包和公共更新源通过既有验证。

## 实现与真实连接

- NAS /vol3/docker/gitpresence 部署 gitpresence:0.2.0；实际构建成功，容器 healthy，UID/GID 1001、只读、移除全部 capabilities、禁止提权、unless-stopped。配置位于 source 外、600 权限，只含 tokenHash。
- 既有 gitea-caddy 增加 /presence/ handle_path，验证候选后备份原文件并平滑 reload；HTTPS /presence/health 返回协议 1，Gitea / 和 Ink /ink/ 均为 200，未停止其他容器。
- 私有 Bridge、观察者与 loopback 密钥独立，生成于 ~/.config/git-presence，未打印、入库、写入用户安装版或放入包。该机器的 NAS 试用配置启用；其他机器默认停用且没有密钥。
- 独立 Bridge 真实扫描 GitTogether/GitPresence 两个工作区，正常 TLS 接入 NAS。真实原生 Rust 观察者与本机读取均为 connected，收到 1 个包含两个项目的真实会话；Git changed 数量随本轮文件变化更新。UE/Godot 来源尚未在本轮接入，界面诚实显示编辑器未接入。
- 原生与浏览器共用有限 Presence 命令，密码字段只输入、不回读；配置 generation 防旧连接结果回写，停用停止本应用的两个读取任务。读取错误与设置错误分开保存，定时刷新不清除保存失败说明。
- 设置、侧栏圆点和仓库的可展开文件状态接入单一 PresenceProvider；断线保留上次状态且撤销有效性，Git/editor 分开显示。没有动态插件执行或 Node sidecar，没有接入 Bridge 的 Git 写入口。
- 部署角色核对真实通过：观察者读取、观察者发布被拒绝、观察者冒充 bridge 被拒绝、无认证得到 401。首个探针曾错误假定服务会立即 close 而超时；改为按协议的 error 拒绝回读，未把该失败计为验收成功。
- 前端类型/Cargo --locked/生产构建通过（276模块，含同期提交范围/推送反馈；保留既有大分块建议）。未新增或运行项目测试。浏览器真实启用得到 connected；版本随后被同期任务递增造成旧预览版本提示，后续用当前版本重启本轮预览。
- 同期 0.22.11 的提交范围/推送反馈已独立提交 4eda68fc90；仅继承，不重归属。其发布持有全局锁，本轮先完成自身文档/部署，不在其发布过程中推送新 main 打断门禁。Presence 是新增能力，计划递增 minor 为 0.23.0。
- GitPresence 服务器源码 ff242f4 已推送 main，并从 git archive 精确更新 NAS；最终镜像 sha256:933b8a99ec1b797aa8a17089edad6b91fbd4e7454d7eff34cb41f8924023f8a0，deployment-info.json 记录 sourceCommit 与源包摘要。更新后实际 healthy，Rust/Bridge 两条读取恢复 connected，仍有两个项目、一个真实上报会话。
- 同期 0.22.11 已完成公开 stable/latest 回读，全局发布锁已释放。本轮 minor 版本 0.23.0 的所有权威入口同步，类型、Cargo --locked 与276模块构建再次通过，接下来仅提交 Presence 段落并从干净已推送 main 发布。

## 最终核验与发布依赖

- 实现 d84730f4df 已推送 GitTogether origin/main；同步 GitPresence ff242f4 已推送。NAS 最终使用 git archive 的精确 ff242f4 源码，源包 SHA256 b83ef4f91e8df6e028bf8c398cc867d310491cee2884f88331478c1c193f0f8c；最终镜像 SHA256 933b8a99ec1b797aa8a17089edad6b91fbd4e7454d7eff34cb41f8924023f8a0。01:14 UTC+8 再次读取 healthy 与正常 TLS health，未重复部署或操作相邻容器。
- 本轮旧预览已停止并以 0.23.0 重建/启动，未停止其他项目服务。实际浏览器设置开关启用、NAS 已连接、本机服务已连接，Taobe 在线含两个真实仓库，版本不一致提示已消失。截图 macos/artifacts/presence/settings-connected.png 为实际连接界面；final-integration-proof.json 为 Rust 同源接口的只读回读，当前 1 个在线会话、2 个本机项目。变化数量为观察时事实，不作为固定期望。网页预览留作用户输出。
- 01:11 UTC+8 发布预检读到同期最新根/macOS AGENTS，随后规则提交 85b201a737 已推送：下一次正式发布须同源码/版本交付 macOS、Windows x86、Windows x64。当前入口会自动公开仅 macOS 资产，Windows 加密存储、Unix 调用、两种原生架构安装包和公共更新条目尚未实现。因此没有启动该发布入口，也没有创建仅 macOS 的 0.23.0 正式 Release 或把公证/更新源写成通过。
- 已向用户说明发布依赖。PRESENCE-03 单独记录已完成的 NAS/源码部署；其原有桌面交付条件保留为新 PRESENCE-04-release 未完成项，并关联 RUN-01-windows-packaging。README/Presence 使用说明明确源码与公开 0.22.11 的区别，不把网页源码当成安装版已更新。
- 服务器和客户端的连接/部署部分完成；桌面正式发布仍未完成。后续补齐三平台交付时沿用已配置签名、公证及 GitHub 权限，校验完整安装包和公共更新源，不操作用户已安装应用、不请求解锁。此次没有访问公证凭据、读取更新私钥或写入安装版用户数据。
- 未新增或运行项目测试套件；先前类型/Cargo/生产构建、角色拒绝和本次真实连接分别作为对应证据。没有对本轮 UE/Godot 接入、其他设备、持久化历史或远端执行作完成声明。
