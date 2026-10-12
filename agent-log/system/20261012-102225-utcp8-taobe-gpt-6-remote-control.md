# 远端控制实现

- 用户原始prompt：「那就开始实现吧，先打通同账号多设备的远端控制，commit、submit 和两种 abort 都接上；团队权限按明确纳管的项目限定。」
- 模型：gpt-6；环境只暴露此版本标识。执行者：taobe。
- 开始：2026-10-12 08:40:52 UTC+8；结束登记：2026-10-12 10:22:25 UTC+8；功能提交：8a0df4aacf48e9e4c5179c9660436f664b37b368已推送main，收尾记录单独提交。
- 分支：GitTogether codex-standalone-ts/main；GitPresence main/main。两个仓库fetch后均未落后upstream；保留已暂存的Windows发布工作及同期Presence信息增强，不改动其归属。
- 需求：COLLAB-01-personal/team/identity/dispatch/abort-operation/discard-changes。

## 计划与验收边界

- 复用已授权的Presence账号，签发独立设备凭证；服务端强制共同用户或明确纳管项目内更高团队角色，目标端还需显式开放项目与操作。
- 控制使用独立版本的有限HTTPS请求和设备轮询，不改变现有编辑器/只读WebSocket协议。设备上线时广播可控工作目录；命令与结果持久化，目标端有独立执行日志，重启中的不确定事务不自动重做。
- 远端Commit/Submit复用Rust Service的确认状态、文件选择、每分支AI说明和Commit/Push流程；中止与丢弃分开，丢弃有文件预览及本机备份恢复。
- 关闭窗口可在托盘后台接受操作；明确退出或设备离线时不可操作。没有注册新的开机服务。
- 按当前指令不新增或运行测试；执行类型、Rust编译和构建检查。隔离运行、真实双设备、源码提交、NAS部署及三平台发布分别记录，未完成不冒称通过。

## 进展

- 已读当前AGENTS、协议、Rust/前端Presence、提交模型与NAS说明。远端模板通用部分一致。
- 已增加独立控制协议与服务器SQLite设备/命令表，默认旧账号没有控制权限；纳管项目与团队角色检查在请求和认领时重复验证。
- 当前共享源码有其他任务同时更新GitPresence字段、Windows平台与发布脚本，后续仅提交本轮明确归属的改动。

## 源码与部署结果

- Rust有限控制器与执行日志、M3设置/逐工作目录确认弹窗、每分支可编辑AI说明、Commit/Submit、具体任务中止、merge/rebase abort、文件丢弃及备份恢复均已接入源码。写入复用operations提交/推送和git-common-dir队列；队列获取后重新验证服务端权限与文件内容。
- 变基中的游离HEAD保留中止能力，工作目录ID基于仓库身份与物理目录的摘要，不把绝对路径发给服务器。新控制协议不会去掉合法仓库名的.git后缀，也接受合法URL转义。
- 目标编辑器未保存/失联事实已接入写入阻止；没有编辑器集成时只处理已落盘文件，界面明确这一边界。单实例防止同机重复执行器；关闭窗口保留托盘后台，明确退出则离线，没有安装开机任务。
- 首轮沿用服务器已授权的Presence账号。独立登记密钥与当前只读授权的userId必须一致，再签发独立设备凭证。当前Mac仓库外control-access.local.json已准备；旧只读授权保持不变，没有自动登记设备、开放仓库或对用户项目执行Git写操作。
- GitPresence 11b93dc的0.4.0已推送，并通过git archive精确部署NAS。只新增独立data卷；容器healthy，公开health为protocolVersion=2/controlProtocolVersion=1，镜像sha256:7db3e3e81bcc8a42fb158570a48178d549323ac39e5948c91549f72749f311bd。
- 同期代码多次进入main或改变产品版本。使用私有任务索引仅提取本任务的文件与hunk，排除其他任务的源码和版本修改；将任务补丁干净应用到最新main后提交，不重写历史或清空实际index。

## 检查与未完成边界

- 当前共享源码0.27.0的TypeScript/Cargo --locked和285模块生产构建通过。仅本任务补丁组成的隔离0.25.0源码也通过TypeScript、283模块生产构建与Cargo --locked，证明不依赖其他未提交功能。构建保留既有大分块建议，未误报为失败。
- GitPresence 0.4.0类型/构建及实际NAS Docker构建/启动、健康回读通过。未新增或运行测试，未执行真实双设备Git写入、托盘交互或Windows本功能运行验收；未启动、替换、更新用户安装版。
- 本次只完成代码与命令服务部署；正式三平台安装包和公共更新源尚未交付本功能，COLLAB-01-runtime/release仍未完成。网页登录Presence和跨平台账号绑定单独保持未完成，登记凭证不作为OAuth已接入的证据。
- docs/remote-control.md提供使用与准确边界；REQUIREMENTS维护源码完成与实际验收区分。README/视觉DESIGN未改动，保留其他任务相关变动。
