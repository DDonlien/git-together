# 本地开发

客户端位于 `macos/`。`npm run dev -- --port 4173 --strictPort` 启动 Vite 浏览器预览，`npm run desktop` 打开同一界面的 Electron macOS 窗口。先启动 Vite 再启动 Electron；开发窗口只加载 localhost。

`npm run check` 检查 TypeScript，`npm test` 验证选择、批量操作、提交、隔离与失败行为，`npm run build` 构建客户端。内置场景导航提供 ZIP 的 00–12 状态；`?scene=08` 等链接直接打开对应场景。

设置内可以切换颜色方案、减少透明度、提交失败和批量失败演示。数据保存在本机浏览器/Electron 的独立 localStorage。重置演示只清除此客户端演示数据。

本机 macOS 26.6.2 可以验证原生 Liquid Glass 插件；macOS 27 原生运行需在该系统另行验证。浏览器版本呈现同一 TS UI 的玻璃效果，不能称为 AppKit 原生控件。

## 当前验证结果

- `npm run check`：TypeScript strict 通过。
- `npm test`：11 项业务测试通过。
- `npm run test:sites`：4 项静态服务/构建产物测试通过；没有部署到 Sites。
- `npm run build`：生成生产客户端与 bootstrap 所需的服务包装。
- 浏览器：33 项检查通过，含 13 个场景、提交失败保留、成功移除选中项、工作目录隔离、取消、复制、搜索/筛选、创建演示分支/工作目录/仓库和刷新持久化。
- Electron 39.8.10：实际窗口启动，输出 `native Liquid Glass: enabled` 和 `renderer mounted; native bridge connected`。桌面目视检查被锁屏限制，未声称 macOS 27 兼容验收。

界面、菜单内的“演示场景”按钮会加载新的示例数据并取消旧任务。刷新同一个场景会保留草稿与选择，不再次重置。运行中的结果不写入历史。浏览器和 Electron 使用各自独立的存储空间。

若 npm 安装策略未执行 Electron 的安装脚本，需要先完成官方运行时安装。本次环境的自动 ZIP 解压未完整结束，使用官方缓存 ZIP（校验 SHA-256 与包内清单一致）完成依赖解压，没有修改任何用户应用或真实仓库。
