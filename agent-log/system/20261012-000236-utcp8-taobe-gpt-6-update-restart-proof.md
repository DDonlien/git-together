# 更新后的原生退出与重启核对

- 用户原始prompt：「还是无法正确的在点击重启更新后自动关闭应用并重启」，截图为0.22.4、旧等待文案及顶部重连提示；附件仅作故障证据。
- 模型：gpt-6，当前环境只暴露这一最具体标识；执行者taobe。开始：2026-10-11 23:51:36 UTC+8。
- 工作区：codex-standalone-ts/main，基准d67e0a84b2a6767385fddb9973dc915bb7256c7f，源码0.22.10；fetch后ahead/behind为0/0。保留原REQUIREMENTS中的IMPORT-13-main行序改动。
- 规则：已读根/macOS规则、更新架构、现时需求与本对话/更近的日志；模板仍v1.9.1-260916-010202。复用发布持续授权、不操作用户安装版、不新增或运行项目测试；只创建ignored临时诊断工具执行真实原生行为。记忆仅定位Tauri发布及验证边界，现状独立核对。
- 已确认：/Applications/GitTogether.app仍0.22.4；最新日志15:47:10Z启动版本0.22.4，目前进程列表没有GitTogether主程序。旧版没有原生update事件，不能据此声称已记录这次点击的底层异常。
- 既有修复：最新任务已发布0.22.10，真实官方安装器复现0.22.9包AppleDouble解压EPERM/errno 1，新公开包隔离安装通过；仅MockRuntime替换验证不覆盖macOS退出与LaunchServices重新启动。
- 成功标准：用独立bundle ID、无账号/数据服务/窗口的临时原生Tauri应用，真实安装替换后调用生产相同的AppHandle.restart，观察旧进程退出与新进程/version及新进程正常退出；只在发现新缺陷后修改生产代码及新发版本。
- 现时调用核对：0.22.4在reserve_install前显示截图文案，最多等待所有已接收读取/fetch180秒，之后才清除等待文案并调用安装/重启。因此这张截图能证明尚在旧等待阶段，不能证明已进入重启后失败。0.22.10沿用已发布的立即取消后台读取方案，安装成功后直接AppHandle.restart；没有prevent_exit或自定义退出拦截。官方Tauri2.12.2从异步线程发ExitRequested/Exit，再通过LaunchServices重新启动同一应用。
- 临时真实原生核对：artifacts/update-restart/probe使用锁定Tauri2.12.2/updater2.13.3，独立bundle ID com.gittogether.restart-inspection-20261011，两个仅含诊断程序的Developer ID签名bundle，无账号/数据服务/窗口。从异步worker调用真实Update.install后AppHandle.restart：旧PID3906收到重启退出码2147483647及Exit；LaunchServices自动启动同一路径新PID3929，读取已替换bundle版本0.22.10；新进程退出码0及Exit。两个PID均已不存在，替换结果deep/strict签名通过。events.jsonl/native-restart-proof.json保留证据。fixture为本地签名诊断包，未声称这是生产UI端到端升级；正式公开0.22.10包的真实安装及签名证据仍见既有update-install任务。
- 公共源本轮独立回读：latest.json=0.22.10；完整tar4608368字节，SHA-256 f1287da286bfc64736cddce4a2a7f46d325a4768f4c7be847360e38653f480f1，与正式发布记录一致；10个条目均在GitTogether.app下且没有AppleDouble。public-source-proof.json留存。用户/Applications安装版仍0.22.4，未操作、更改、启动或重启，也未访问账号或Git仓库。
- 恢复入口最终回读：完整公开ZIP4611547字节，SHA-256 22e02a23107538d3cd357dd5f435f070722099cdf98343c86955dfbb05a226eb，与正式签名公证发布记录一致；public-zip-proof.json留存。下载地址为https://github.com/DDonlien/git-together/releases/download/v0.22.10/GitTogether-0.22.10-macOS-arm64.zip。
- 结论与交付：此次补全原生退出/重新启动证据，没有发现需新增生产代码的重启缺陷，不为诊断文档重复发包。旧安装器内存中的等待逻辑及失败下载不会随发布变化；提供已公开0.22.10完整ZIP的一次替换恢复入口，升级后再使用应用内新流程。不能声称已让用户当前安装版自动退出重启，也不能将已复现历史包错误当成本次旧版未记录的实际安装异常。
- 收尾：本轮只更新此验证日志和RUN-01-update-restart-proof验收项，未改生产代码或版本，无新的需求或功能变化。保存独立原生诊断的实际事件及公共源回读证据；未新增或运行项目测试。保留同时出现的CONTENT-01-icon-candidates和agent-log/content未提交工作，不混入本轮；仅暂存本轮需求行与此日志。结束时间以最终日志文件名为准。

- completedAt: 2026-10-12 00:02:36 UTC+8.
