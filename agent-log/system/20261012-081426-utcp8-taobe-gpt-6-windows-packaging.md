# Windows 原生适配与双架构打包

- 用户原始prompt：那就把 Windows 的适配和 x86、x64 打包流程做好，实际构建校验通过，下个版本跟 macOS 一起发布，不要只是记规则。
- 模型：gpt-6（运行环境提供的最具体标识，未推测其他版本）；执行者：taobe。
- 启动分支/提交/产品版本：main，caf1175002，0.23.0。
- 开始：2026-10-12 08:14:26 UTC+8（首次时钟记录）；结束：执行中，交付时追加。
- 本轮提交：按已有持续授权分段提交并推送，实际构建未通过前不标记需求完成；不操作用户已安装应用。
- 需求ID：RUN-01-windows-packaging。

## 上下文与实施

- 阅读根/macOS规则、上次Windows发布政策、Rust后台、Tauri配置和正式发布脚本；MEMORY.md仅用于定位既有Tauri生产边界，当前源码与发布条件重新核对。起始源码干净，fetch后main为0/0。通用模板前一任务核对一致，本轮不修改规则。
- 当前Windows平台实现缺口包括无条件Unix导入、macOS Keychain、HOME/PATH、进程组、/usr/bin/open和macOS-only更新tar校验。GitHub Actions仓库已启用，无已有工作流，采用Windows-2022原生MSVC双目标。
- 同一React/Tauri/Rust客户端增加Windows DPAPI用户级加密、私有ACL、KnownFolder数据目录、工具查找、普通文件no-follow/链接处理、Job Object进程组及系统打开/文件剪贴板；保留macOS旧账号兼容和更新数据路径。
- 独立Windows NSIS配置使用currentUser安装、嵌入WebView2 bootstrapper。Workflow只接收已推送main SHA，构建x86/i686与x64/x86_64；不上传私钥或Windows签名凭据到CI。
- 原生发布校验器只用临时目录和虚构凭据，实际验证DPAPI/篡改拒绝、ACL、Unicode路径Git、选中文件提交与未选暂存内容保留、进程树取消和日志。生产快照移除诊断bin目录后再打包，校验NSIS内主程序架构/摘要/无诊断工具，并实际静默安装到临时目录核对后卸载。旧项目测试未新增或运行。
- 本地类型/Cargo检查先通过，再分段推送工作流以执行真实Windows构建；真实构建、后续修复与发布证据待追加。

## 资料与边界

- https://v2.tauri.app/distribute/windows-installer/：MSVC x86/x64目标、NSIS/原生构建边界。
- https://v2.tauri.app/plugin/updater/：windows-i686/windows-x86_64静态更新条目。
- https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata：用户范围、非交互加密与完整性。
- https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects：子进程继承Job及整体终止。
- https://raw.githubusercontent.com/openai/codex/main/codex-cli/bin/codex.js：官方Windows原生Codex包为x64/arm64，提供vendor目标/bin/codex.exe；兼容已存在的vendor/codex布局。纯32位Windows中找不到受支持Codex时给出真实错误，不模拟AI。
