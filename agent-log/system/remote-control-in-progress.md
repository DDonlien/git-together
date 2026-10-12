# 远端控制实现

- 用户原始prompt：「那就开始实现吧，先打通同账号多设备的远端控制，commit、submit 和两种 abort 都接上；团队权限按明确纳管的项目限定。」
- 模型：gpt-6；环境只暴露此版本标识。执行者：taobe。
- 开始：2026-10-12 08:40:52 UTC+8；结束：进行中；提交：尚未。
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
