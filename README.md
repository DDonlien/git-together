# GitTogether

GitTogether 使用 Tauri 2 / Rust 提供日常 Git 工作流和 Material 界面。它不是官方 GitHub Desktop 的完整移植，Git 执行由 Rust 调用本机 Git / Git LFS。

## 当前范围

- 绑定 GitHub、GitHub Enterprise、Gitea、GitLab、Gitee 账号，侧栏列出账号可访问的全部仓库。
- Dashboard 浏览全部仓库，展开多个分支，手动隐藏/恢复、置顶、筛选和排序。
- 浏览提交历史、差异与文件树，关联已有工作目录或下载分支。
- Commit、Fetch、Pull、Push 及标准分支操作。Update 按状态选择 Fetch、Pull 或 Push；Pull 或 Push 遇到分叉时尝试正常合并，冲突时保留现场。提交说明可编辑，选中文件之外的暂存内容保留；推送单独执行。提交清单可右键忽略文件，已跟踪文件停止跟踪但保留本地副本。
- 非 GitHub / GitHub Enterprise 仓库可通过已登录的本机 Codex CLI 生成提交说明。
- Presence 插件连接、工作区观察、在线人员与协作状态显示。
- 设置中可展开、搜索近期日志，更多记录保存在日志文件夹；文件按 7 天或 512 MiB 的范围清理。

已移除自定义 Submit / Get Latest / Clear、AI 拆分提交与分支整合、文件管理写入、远端控制、权限巡检和基于贡献的自动隐藏。Dashboard 后台只读取分支元数据，进入仓库后加载历史和文件树。

## 下载与更新

正式版使用应用标识 `com.gittogether.standalone`，沿用 GitTogether 的账号、工作目录关联和更新源。macOS Apple Silicon、Windows x86 和 Windows x64 安装包发布在 [GitHub Releases](https://github.com/DDonlien/git-together/releases/latest)；应用内可在「设置 → 应用更新」检查更新。正式发布使用同一 main 提交，并对 macOS 包执行 Developer ID 签名与 Apple 公证。

## 开发与验证

需要 Node.js 22–24、Rust 1.90+、Xcode Command Line Tools、本机 Git；LFS 仓库需要 Git LFS，AI 提交说明需要已登录的 Codex CLI。

```sh
npm run setup
npm run dev
npm run check
npm run build
npm --prefix macos run test:lite
```

桌面开发使用 `npm run desktop`；浏览器预览与桌面开发共用 4173 端口，择一运行。精简功能的开发记录见 [GitTogether 精简试用版](issue/issue-00007_GitTogether%20精简试用版.md)。

界面规范见 [DESIGN.md](DESIGN.md)，运行架构见 [ARCHITECTURE.md](ARCHITECTURE.md)。历史 `desktop/` 参考代码和 `ios/` 项目不进入桌面 Tauri 运行包。
