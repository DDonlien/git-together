# GitTogether Lite

这是 `DDonlien/main/desktop-lite` 分支的精简试用版：以 Tauri 2 / Rust 提供日常 Git 工作流，使用 GitTogether 已更新的 Material 界面。它不是官方 GitHub Desktop 的完整移植，Git 执行由 Rust 调用本机 Git / Git LFS。

## 当前范围

- 绑定 GitHub、GitHub Enterprise、Gitea、GitLab、Gitee 账号，侧栏列出账号可访问的全部仓库。
- Dashboard 浏览全部仓库，展开多个分支，手动隐藏/恢复、置顶、筛选和排序。
- 浏览提交历史、差异与文件树，关联已有工作目录或下载分支。
- Commit、Fetch、Pull、Push 及标准分支操作。提交说明可编辑，选中文件之外的暂存内容保留；推送单独执行。
- 非 GitHub / GitHub Enterprise 仓库可通过已登录的本机 Codex CLI 生成提交说明。
- Presence 插件连接、工作区观察、在线人员与协作状态显示。

已移除自定义 Submit / Get Latest / Clear、AI 拆分提交与分支整合、文件管理写入、远端控制、权限巡检和基于贡献的自动隐藏。Dashboard 后台只读取分支元数据，进入仓库后加载历史和文件树。

## 试用包

`GitTogether Lite` 使用独立应用标识 `com.gittogether.standalone.lite`、独立数据目录和钥匙串项，需要正常重新绑定账号。它不会覆盖稳定版，也不从稳定更新源安装完整版本。已有 Git 工作目录可以关联，所有实际 Git 写入仍以用户在应用中的操作为准。

本轮目标是 macOS Apple Silicon 独立试用 ZIP。构建命令：

```sh
npm run package:trial
```

脚本复用既有 Developer ID 和 Apple 公证配置，产物包含来源分支、提交、工作区摘要及文件摘要。此次分支试用不发布 main 或稳定更新源。

## 开发与验证

需要 Node.js 22–24、Rust 1.90+、Xcode Command Line Tools、本机 Git；LFS 仓库需要 Git LFS，AI 提交说明需要已登录的 Codex CLI。

```sh
npm run setup
npm run dev
npm run check
npm run build
npm --prefix macos run test:lite
```

桌面开发使用 `npm run desktop`；浏览器预览与桌面开发共用 4173 端口，择一运行。试用范围和验收记录见 [GitTogether 精简试用版](issue/issue-00007_GitTogether%20精简试用版.md)。

界面规范见 [DESIGN.md](DESIGN.md)，运行架构见 [ARCHITECTURE.md](ARCHITECTURE.md)。历史 `desktop/` 参考代码和 `ios/` 项目不进入此次 Tauri 运行包。
