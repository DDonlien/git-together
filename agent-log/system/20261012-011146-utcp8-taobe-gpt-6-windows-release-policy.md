# Windows x86 / x64 后续发布范围

- 用户原始 prompt：下一个版本开始一并打包 Windows 的 x86 和 x64 版本
- 模型：gpt-6（当前运行环境仅提供此模型标识，未获取更细版本，不推测）；执行者：taobe。
- 启动分支/提交/产品版本：main，d84730f4df6f1d186515c1d63966db814e98edbb，0.23.0。
- 任务开始：2026-10-12 01:08:54 UTC+8（首次记录的时钟时间；此前已开始只读预检）。
- 任务结束：2026-10-12 01:11:46 UTC+8（文档核验收尾）；交付前完成本任务范围的提交、推送与远端回读。
- 本轮提交：按2026-10-10持续授权，仅提交/推送本轮规则、两条需求与本日志；不递增版本或发布安装包。
- 需求ID：RUN-01-windows-policy、RUN-01-windows-packaging。

## 已阅读上下文与行动

- 阅读根与macos的发布规则、现有需求、Tauri配置、Rust平台实现及package-desktop.ts/desktop-release.ts。主工作区已有其他任务的REQUIREMENTS.md修改及图标/远端控制日志；保留这些改动并排除在本轮提交之外。并行Presence源码已正常提交为d84730f4df，当前产品版本0.23.0；不挪用该任务的发布成果。
- 模板源https://raw.githubusercontent.com/DDonlien/agent-template/main/app-agent-template/AGENTS.md的通用内容与本地一致；git fetch --prune后main与origin/main为0/0。修改仅加入项目专用约定，不改通用模板。
- 向用户说明当前发布入口仅支持macOS，后台存在Unix专用实现；将请求理解为下一次及后续正式发布的持续平台范围，而非立刻为规则变更单独生成一个版本。没有追加许可问题。
- 将macOS Apple Silicon、Windows x86（32位）和Windows x64（64位）列为同一版本、同一已推送main源码/tag的正式发布必备交付。Windows沿用React/Tauri/Rust客户端、独立架构NSIS安装包及同一Release，公共更新清单包含windows-i686/windows-x86_64。

## 当前构建缺口与后续验收

- macos/scripts/package-desktop.ts明确限制darwin/arm64，并仅生成darwin-aarch64更新条目；现有发布验收围绕macOS ZIP/tar。
- credentials.rs的非macOS加密存储仍返回不支持；git.rs、ai.rs、operations.rs、preferences.rs、diagnostics.rs和presence.rs有无条件Unix导入/权限或进程调用。util.rs的用户目录/PATH及service.rs的/usr/bin/open也需要Windows实现。此次未修改这些运行代码，未把Windows支持标为完成。
- 根据Tauri官方文档，x86使用i686-pc-windows-msvc、x64使用x86_64-pc-windows-msvc；优先Windows原生构建环境。文档明确跨平台构建存在额外条件，不能用两次同架构重命名冒称两包。来源：https://v2.tauri.app/distribute/windows-installer/。
- 公共更新键按OS-ARCH，Windows使用windows-i686和windows-x86_64；签名是生成sig内容，必须与实际完整资产对应。来源：https://v2.tauri.app/plugin/updater/。
- RUN-01-windows-policy只标记规则已登记；RUN-01-windows-packaging保持未完成，要求下一次正式发布补齐平台实现、双架构原生构建、主程序/包内容、版本/来源、摘要和公开下载/更新签名校验。保留macOSDeveloper ID、公证及旧版过渡资产、仓库外更新私钥和不操作已安装应用的边界。

## 验证、完成工作与边界

- 根AGENTS.md新增Windows双架构发布章节；macos/AGENTS.md首段加入对应最新约定；REQUIREMENTS.md在既有发布需求下新增两条稳定ID，保留历史发布记录。
- 本次纯规则/需求文档更新：未添加或运行测试，未构建/公证/发布Windows或macOS安装包，未读取签名私钥，未操作已安装GitTogether。
- 局部差异与git diff --check核对通过；暂存仅包含本轮两条需求，其他任务的图标与远端控制需求/日志保持未暂存。交付前检查暂存文件清单、提交范围及远端提交。
- README、DESIGN、ARCHITECTURE无需修改：本轮登记未来发布范围，不改变现行已交付功能、外观或运行契约，也不向公开README宣称Windows已可用。
