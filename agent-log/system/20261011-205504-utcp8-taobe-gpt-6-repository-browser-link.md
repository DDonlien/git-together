# 仓库网址默认浏览器入口

- 开始：2026-10-11 20:55:04 UTC+8；模型可确认gpt-6；main/b1060ddb2713595163370400682af5f91b8d2cab，当前源码0.22.5、公开版本0.22.4。
- 用户原始prompt：「仓库连接的部分需要刻意点击，用默认浏览器打开对应仓库」；随后补充「这里的」，截图指向awesome-mac标题下的https://github.com/DDonlien/awesome-mac文字。
- 需求ID：R-05-repository-browser-link；将这里理解为网址可点击，不改变仓库标题/导航/本地关联或Git操作范围。
- 上下文：读取根/macOS AGENTS最新Tauri/Rust、持续推送打包发布授权及不操作安装版约定；实际RepositoryView仅p显示URL，native-bridge现有标题拖动排除a，Rust已有系统open复用。
- 工作区：开始只有其他任务留下的REQUIREMENTS行序改动，保留且不纳入本轮提交；未使用旧GitButler checkout或更改真实用户仓库。
- 实现：URL使用真实a，保留原字号/位置和颜色，新增悬停下划线及键盘焦点，防止标题拖动接管；桌面点击/Enter及中键由有限openRepository(repositoryId)触发Rust保存网址的http(s)系统打开，不接受用户传入URL/命令。浏览器预览保留普通新标签链接；不依赖本地关联或账号当前读取权限，失败用一处Notice反馈。
- 验证：TypeScript、Cargo --locked及生产构建通过；隔离Vite4268实际生产RepositoryView核对左键、Enter、中键各调用有限openRepository一次，输入只有repositoryId，WebView页未跳转；失败只有1个alert，重试成功后0个，11px原字号、pointer、hover下划线和2px键盘焦点确认。截图artifacts/repository-browser-link/keyboard-focus.png（虚构Catalog与桥回执，仅前端核对，不作原生默认浏览器或安装版验收）；开发Lit提示外无console error。已关闭本轮标签/4268服务并移除两项临时预览入口。不新增或运行项目测试套件，不操作用户安装版。
- 发布：本轮现有公证profile可读取；版本递增0.22.6，待main推送后走原完整签名、公证及公共资产核验。其他会话正在做批量Git读取诊断，不暂存其日志/改动，也不把其未完成修复纳入本轮。
- 结束/提交/发布：待记录。
