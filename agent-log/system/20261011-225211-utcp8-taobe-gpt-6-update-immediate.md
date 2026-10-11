# 更新确认后立即安装与提示归属

- 用户原始prompt：「有两个重复的提示，另外更新的重启已经 popout 提醒过用户了，不应该再等待什么操作完成了；另外什么操作呢？」附两张截图，显示0.22.4安装等待及顶部安装中/重新连接错误。
- 模型：gpt-6；环境仅可确认此版本标识。执行者：taobe。
- 开始：2026-10-11 21:51:28 UTC+8；结束：2026-10-11 22:52:11 UTC+8；是否提交：功能884db210fb及364504d37a均已推送main，交付记录另行归档提交。
- 工作区：codex-standalone-ts/main；同步预检后HEAD b1486c42c5，源码0.22.7，ahead/behind 0/0。保留已有REQUIREMENTS.md中IMPORT-13-main行序移动。
- 需求：RUN-01-update-immediate，归属RUN-01-update-quiesce，最新用户要求取代旧通用等待行为。

## 诊断与范围

- 已读当前根/macOS规则、README、REQUIREMENTS、架构、更新与服务/工作区调用链及上次更新任务日志；模板通用部分仍与v1.9.1-260916-010202相同。轻量记忆仅定位Tauri发布入口与安装版不操作边界，现规则已现场复核。
- Service.active统计所有请求和独立fetch任务。旧reserve_install关闭入口后最多180秒等待全部请求；新的周期status/catalog因关闭入口报错，useWorkspace将它当成连接错误，App又展示顶部红色Notice和重新连接按钮。更新卡片同时展示等待信息，形成重复提示。
- 只读本机保留日志：2026-10-11 04:02至13:55 UTC记录53211次localWorkspace、1110次fetchRepository，status/catalog约各1800次；未见submitCommit/pushCommit/applySync请求。仅证明大量自动读取，不能据此认定截图瞬间的具体在途请求。
- 改为确认后立即安装，暂停前端自动读取、取消原生后台读取与fetch；独立保护真实写事务，确认入口在前台操作期间禁用，原生并发写入仅返回具体原因，不作通用等待。安装失败释放预约、恢复读取并保留下载字节。
- 沿用持续授权自动完成main提交、推送、签名、公证、发布与公共包/更新源核验；不启动或操作用户已安装应用，不要求解锁。按当前项目规则不新增或运行项目测试，执行类型、Cargo、生产构建及必要的隔离实际运行核验。

## 实现与核验

- useUpdates由工作区持有，设置页只呈现状态与确认；确认同步设置安装ref，停用自动账号/本地/远端检查并屏蔽正常安装关闭连接的顶部反馈。轮询代次防止旧ready覆盖installing；IPC安装失败保留ready重试入口。
- 原生安装预约移除180秒active等待，只保护具体Foreground事务。后台token覆盖在途读取和独立fetch；预约Drop重建取消代次，失败后可继续读取/获取。确认弹窗说明立即安装重启，不再写完成当前操作。
- TypeScript、Cargo --locked、生产构建264模块及差异检查通过；保留既有大chunk提示，未新增或运行项目测试。
- 临时忽略目录中用生产Service和实际Git/HTTP运行隔离诊断：2个活跃fetch请求时安装预约0ms获得、入口关闭、实际fetch取消；释放预约后本地读取与新fetch恢复。临时pre-commit钩子暂停真实提交期间安装0ms拒绝，说明正在执行提交；拒绝自动释放门禁，钩子放行后提交成功及HEAD变化，后续可预约安装。所有写入均在临时仓库，未读真实凭据。probe首次用/var路径直接调用git::task遇到canonical路径契约，改用canonical临时根后通过，未因此修改产品源码。证据macos/artifacts/update-immediate/native-proof.json。
- 隔离浏览器预览用虚构更新桥接：一次确认后直接安装，顶部无重新连接；账号请求计数8在安装期间保持，换页不恢复调度。模拟失败后仅更新卡片显示失败/重试，按钮启用，计数由17恢复至39。证据ui-proof.json。预览不进行真实更新，不操作安装版。
- 同一工作区另一对话完成remote-first提交ec12786214，0.22.8独立发布；其源码、需求与日志已经提交，未纳入本轮暂存。本轮递增0.22.9，推送前核对既有全局发布锁，避免在另一发布期间改变远端main。
- 884db210fb已提交并推送main；保留独立REQUIREMENTS行序变动。隔离发布过程中复核发现：更新状态移至工作区后，重复的同值轮询会让整页每秒重绘。已停止本次自有发布进程；退出输出显示已完成签名并进入公证调用，未继续创建公开发布，不把此中间包当作交付。补充同值状态及重复状态读取错误复用后，从新main完整构建，不修改旧产物或套用旧来源记录。

## 正式发布与交付

- 最终源码提交364504d37a11b1da19981733c4b269c5dde01478已推送main，公开v0.22.9标签回读指向同一提交。冻结来源再次通过类型、Cargo --locked和264模块构建；发布不运行历史项目测试。
- 正式产物目录：`../_builds/gittogether-0.22.9-macos-arm64-gGH3dq/`。Apple公证41e82032-85ac-4147-8d7a-cf250e0ea4e0为Accepted；Developer ID深度/严格签名、staple/validate、版本绑定的Tauri签名核对通过。spctl识别Notarized Developer ID，本机已有security disabled未被本次修改，不宣称默认Gatekeeper或用户安装运行验收。
- ZIP 4230583字节，SHA-256 `3bd4c13214bc95654fdcfa2b69bcc6872d96ff7a0683d457245b6c09b1374d3c`；tar.gz 4229717字节，SHA-256 `f0dabded151341c4550419c82032e75ac1312a6d5646818437eccb1f9c3b0203`。正式入口公开GitHub stable/latest 0.22.9并完整核对ZIP、旧latest-mac.yml、Tauri tar/签名/latest.json，build-info.publicUpdateVerified=true。
- 另行无需登录回读公开latest.json并完整下载ZIP，摘要/字节数相同；解包核对0.22.9、原bundle ID、Developer ID团队86J7X3KZ5Z、深度/严格签名及公证凭证均通过。证据macos/artifacts/update-immediate/release-proof.json。
- 已关闭自有隔离浏览器页和4198预览服务；确认冻结来源无改动后移除自有发布clone，仅删除其依赖符号链接，未触及真实node_modules。保留正式_builds产物、忽略目录中的核验记录及独立REQUIREMENTS行序变动。
- README/需求状态与交付记录同步；未启动、操作、安装、替换或重启用户已安装GitTogether。旧安装版须升级到0.22.9后才使用新的更新逻辑；提供已核对的公开ZIP入口，不将发布冒充安装结果。
