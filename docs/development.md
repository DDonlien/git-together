# 本地开发

客户端位于 `macos/`。`npm run dev -- --port 4173 --strictPort` 启动 Vite 浏览器预览，`npm run desktop` 打开同一界面的 Electron macOS 窗口。先启动 Vite 再启动 Electron；开发窗口只加载 localhost。

`npm run check` 检查 TypeScript；`npm test` 运行账号/本地只读服务测试及保留的历史契约测试；`npm run build` 构建客户端。`npm run test:sites` 验证静态包装。0.2.0 不提供演示场景，旧 scene 参数会从 URL 移除且不加载 fixture。

左下角设置是独立账号页面，另有外观与使用指南。账号初始为空，用户自行在该界面输入访问令牌；不会自动读取系统中的 GitHub/Gitea 凭据。Dashboard 读取远端仓库，弹窗关联已有 Git 目录。浏览器账号只存于 Node 服务会话，桌面账号使用系统安全存储加密持久化；两者相互独立。网页存储只含外观与折叠偏好，旧演示存储不自动清理。

本机 macOS 26.6.2 可以验证原生 Liquid Glass 插件；macOS 27 原生运行需在该系统另行验证。浏览器版本呈现同一 TS UI 的玻璃效果，不能称为 AppKit 原生控件。

## 账号导入验证（0.2.0，2026-10-04）

- TypeScript strict、22 项测试（11 项新账号/只读服务测试 + 11 项历史契约）、4 项静态包装测试、生产构建。
- 新服务测试涵盖 GitHub/Gitea 分页、同 host 多身份、重复身份、错误令牌、加载失败保留/重试、存储失败原子性、损坏存储拒绝覆盖、API 来源限制、含空格本地目录与错误远端拒绝。临时 Git 仓库测试前后 index、HEAD、文件和状态不变。
- 浏览器用 loopback 假 Gitea 服务实际填写表单，验收多账号读取、弹窗错误/成功、侧栏折叠、真实临时仓库 Diff/历史、失败重试、筛选、Cmd+K、Escape 焦点恢复、外观与窄窗口。测试服务不进入应用，也没有新增内置演示入口。
- 桌面已重启并报告 native glass / renderer bridge 就绪。系统锁屏导致最新桌面目视、系统目录选择器和真实凭据持久化/重启验证尚未完成；不得把注入式存储测试称为实际系统钥匙串验收。
- 真实账号授权、组织 SSO 与实际 Gitea 版本尚需用户提供令牌后验证。没有克隆、修改或推送真实仓库，没有提交代码、推送或部署。静态 Sites 部署不支持本机账号/Git 服务，需本地版或桌面版。

## 历史验证结果（0.1.2，2026-10-03 至 10-04）

- `npm run check`：TypeScript strict 通过。
- `npm test`：11 项业务测试通过。
- `npm run test:sites`：4 项静态服务/构建产物测试通过；没有部署到 Sites。
- `npm run build`：生成生产客户端与 bootstrap 所需的服务包装。
- 浏览器：本轮打开并审查全部13个场景，检查亮暗色、减少透明度、1600×900、920×640/740及390×844。复查平面分组、Split Diff、Graph/Tree、详情收起、Commit预览、AI生成时禁用、失败保留、菜单方向键/Escape、弹窗关闭焦点恢复和Cmd+K。前一版33项业务流程检查是历史证据，不冒称全部已在本轮重跑。
- Electron 39.8.10：实际窗口重启，输出 `native Liquid Glass: enabled` 和 `renderer mounted; native bridge connected`。本轮前段已截图确认悬浮导航与平面内容；最后重启后Mac已锁屏，最终桌面截图及原生最小窗口尺寸尚未复查。未声称macOS 27兼容验收。
- 本轮截图与修复记录见根目录 `design-qa.md`；没有接入真实Git/AI/Presence，也未提交、推送或部署。

上述 0.1.2 场景/模拟操作是历史证据，0.2.0 已移除其运行入口。

若 npm 安装策略未执行 Electron 的安装脚本，需要先完成官方运行时安装。本次环境的自动 ZIP 解压未完整结束，使用官方缓存 ZIP（校验 SHA-256 与包内清单一致）完成依赖解压，没有修改任何用户应用或真实仓库。
