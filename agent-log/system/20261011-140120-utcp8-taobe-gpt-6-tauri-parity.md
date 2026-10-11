# Tauri迁移实现一致性检查

- 开始：2026-10-11 14:01:20 UTC+8；模型可确认gpt-6。
- 用户原始prompt：「你再全局检查一下 Tauri 迁移有没有类似的实现遗漏，尤其是本地关联、自动刷新和远端读取，有问题就一起修复，自动推送、打包发布。」
- 范围：RUN-01-tauri-parity；对照既有TS契约与当前Rust实现，重点为本地关联、自动刷新、远端读取，并扫描有限协议与相关平台桥。Presence和新产品功能不在本轮范围。
- 工作区：codex-standalone-ts/main；开始只有其他任务留下的REQUIREMENTS.md行序改动，保留；正常fetch后与origin/main为0/0。
- 模板：沿用已核对的通用v1.9.1-260916-010202，项目最新规则要求Rust后台，不新增/运行旧后台测试作为Rust验收。
- 授权：用户本轮明确自动推送、打包发布；复用Developer ID、gittogether-notary及既有更新签名配置。保留不操作用户已安装应用、不输出或重放凭据、真实用户仓库只读的边界。
- 成功标准：记录检查范围和可重现差异，修复实际遗漏；分别记录Rust读取/刷新核验、源码检查、正式包与公开更新源证据，不将静态检查冒称全账户或安装版验收。
- 14:01—14:24检查：逐项对照30个前端有限API与Rust服务分派，均有实现；扫描原生桥、账号/加密兼容、OAuth、Git操作、Codex调用与后台刷新契约。未把旧TS测试结果用于Rust验收。Detached HEAD实际可读，与最初候选判断不同，未修改该逻辑；旧式单目录关联原TS也不自动纳入所有兄弟目录，未凭推测扩大关联范围。
- 已确认并修复：旧关联目录失效会阻止重新关联/下载/匹配；取消刷新被保存为账号错误；残缺SHA树/带警告提交被永久缓存；Gitea八进制UTF-8引用路径丢失patch；共享fetch被第一个调用取消连带中止；非origin引用名称被过度缩写；fetch失败阻断独立远端API读取；snapshot把任务失败当无更改；无效可选branch被当作缺省值扩大unlink范围。
- 隔离Rust诊断使用正常生产Service/Provider/Git，临时Git仓库、真实Git Smart HTTP和本地Gitea协议fixture，虚构账号令牌；正常Developer ID身份仅用于系统加密保存/读取虚构v2旧关联，不导出或重放真实账号，也不改变Keychain访问设置。诊断源和输出位于忽略的macos/artifacts/tauri-parity及artifacts/tauri-git-read，未增加项目测试文件。
- 修复前/后证据：relink失败→成功；取消刷新保存“操作已取消”→返回取消且原账号无错误；同SHA树完整性false→可恢复true；中文patch缺失→存在；两个fetch等待者原先同时失败→取消者失败、另一个成功；upstream/main→refs/remotes/upstream/main；失效snapshot拒绝且无效branch拒绝，关联保持1项。保留workspace的2个worktree，Detached HEAD前后都可读。
- 浏览器链路使用隔离42852页面、实际Rust服务与生产useWorkspace/useRemoteRepositories，模拟原生桥不可跨传AbortSignal；首次读取及保存/再保存/暂存/再暂存的远端请求次数依次1/2/3/4/5，生产5秒本地扫描及5分钟远端间隔保持。Git403后仍调用remoteWorkspace（第6次），页面保留真实远端内容并提示本地引用未更新。
- API403仍保留两个分支上次完整内容；仅隔离页面快进退避截止时间，恢复后第8次remoteWorkspace成功并清除错误。停止监测后的localWorkspace/remoteWorkspace次数保持45/8；已在途的catalog/status各完成一次，不继续启动远端读取。截图refresh-recovered.png及DOM证据保存在忽略的诊断目录，隔离浏览器/42852服务与Rust临时服务已关闭，临时前端文件已移除。
- 新共享fetch作业最后等待者取消后实际Git停止、active计数归零，随后再次fetch成功。最终诊断final-inspection.json确认cancelledFetchDrained/lastFetchCancelled/fetchAfterCancellationSucceeded均true。
- 0.22.5源码检查：npm run check、npm run check:rust、npm run build及git diff --check通过；仅已有Vite大chunk体积警告。一次调用误把脚本内已有--locked重复传入而被Cargo参数解析拒绝，纠正调用后检查通过，不计为业务失败或已通过结果。没有运行项目测试套件或旧TS后台测试；隔离运行诊断与类型/编译/构建分别记录。
- 版本范围：独立任务已在main交付0.22.4更新安装等待修正，本轮不覆盖该提交；补丁版本递增0.22.5，仅修改本轮代码/文档及包版本。REQUIREMENTS.md其他任务的行序调整保留不暂存。
- 状态：准备推送main及正式签名、公证、发布。
