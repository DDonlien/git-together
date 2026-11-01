# GitTogether Lite 运行架构

本分支使用 React / TypeScript / Vite 展示现有 Material 3 GUI，Tauri 2 连接同进程 Rust 服务。Rust 调用本机 Git / Git LFS；生产包不包含 Electron、Node 业务进程或 GitHub Desktop 原版执行器。

## 保留的工作流

账号 Provider 负责验证身份、读取全部可访问仓库及远端分支/历史/文件。侧栏和 Dashboard 使用同一 Catalog；目录关联保存实际 Git worktree，不能从目录名猜测分支。本地 Git 沿用已保存的认证方式；新导入的本地目录默认使用系统 Git/SSH，首次从应用下载的仓库使用绑定账号，设置页不再列出逐仓库认证选择。

Dashboard 的后台 remoteWorkspace 使用 summaryOnly，只读取完整分支列表和提交位置；打开仓库后才读取历史与文件树。手动隐藏、恢复、置顶、筛选和排序均为本地偏好。贡献、推送活动、创建者和权限巡检不再产生后台请求。

Commit 创建本地提交，Push 单独执行，Pull 使用标准快进路径；不悄悄覆盖用户工作。标准分支操作保留真实预览、旧状态核对与必要确认。提交文件范围、用户 Git 身份、钩子、签名与未选暂存内容继续受保护。

Codex CLI 只为非 GitHub / GitHub Enterprise 的选中更改生成可编辑 Summary / Description；服务端和 GUI 同时限制平台范围，不自动提交、不拆分提交、不执行 AI 分支整合。

Presence 保留本机插件监听、在线工作区、远端观察及人员显示，继续沿用公开协议。客户端不再注册远端控制、远程 Git 写入或后台托盘执行器。

## 移除的运行入口

自定义 Submit / Get Latest / Clear、AI 提交分组与合并、远端文件/目录写入、远端控制、权限巡检和贡献自动隐藏均从有效请求路由或模块中移除。历史协议类型或参考文件不代表功能仍可执行；未知命令返回明确错误。

## 独立试用身份

试用应用标识为 com.gittogether.standalone.lite，账号、Presence 会话、偏好和钥匙串项与稳定版隔离。账号由用户正常登录，不复制稳定版令牌。Lite 只读取自身的 GitHub 开发者应用配置，不读取旧版授权目录。配置缺失或不可读取时直接使用 GitHub 设备验证码登录；有有效配置时保留浏览器回调，端口冲突时也可使用设备授权，不抢占其他应用端口。

试用更新器不访问稳定更新源。package:trial 只生成本地已签名、公证的 macOS Apple Silicon 包，记录来源和摘要，不发布稳定版本或替换已安装应用。功能检查、签名公证和真实用户试用分别记录。
