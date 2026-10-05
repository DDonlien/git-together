# TypeScript 客户端架构

0.2.0 的 React 客户端由 App shell、账号 Dashboard、独立 SettingsView、LocalRepositoryModal 和只读 RepositoryView 组成。`import-model.ts` 定义有限 API 方法与 DTO，`import-api.ts` 验证响应形状，`use-workspace.ts` 管理账号目录、异步操作和外观偏好。旧 `domain.ts` / `data.ts` 仅保留历史测试契约，运行入口不导入场景或模拟操作。

`ui.tsx` 是 OpenGlass UI 的薄适配层，统一按钮、字段、分段选择、菜单、弹窗和开关契约；`theme.ts` 管理公共令牌。App shell 只有一个共享窗口 canvas，CSS 区分全局悬浮导航与右侧平面内容组。账号导航在桌面最小宽度仍保留可读名称，760px 以下使用浏览器图标栏回退。仓库图标上的空心角标明确表示 Presence 未连接，不伪造在线数据。

## 账号服务与凭据边界

`server/account-service.ts` 是浏览器/Electron 共用的只读服务。GitHub 请求固定 `api.github.com/user` 与 `/user/repos`；Gitea 请求指定 HTTPS origin 的 `/api/v1/user` 与 `/user/repos`。来源参照 [GitHub 仓库接口](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user)、[Gitea 接口](https://docs.gitea.com/api/operations/user-current-list-repos/) 及 [Gitea ListMyRepos 实现](https://github.com/go-gitea/gitea/blob/main/routers/api/v1/user/repo.go)。GET 仓库接口包含账号/组织/协作范围，但仍受令牌权限限制；分页构造本机 URL，不向 Link 提供的第三方 URL 转发令牌，不跟随认证重定向。

账号 ID 独立于 host，仓库 ID 为 accountId + remoteId，因此同 host 多身份以及同一共享仓库不相互覆盖。身份重复检查 provider/host/login。状态变更串行、保存成功后才发布新状态，响应携带递增 revision，迟到响应不能覆盖新目录；不同账号可并行读取。加载失败保留上次列表与本地关联；失去访问权限的已关联仓库保留为 unavailable，不静默删除。

Vite 只监听 loopback，HTTP 中间件要求本机 Host、同源 Origin / Sec-Fetch-Site、专用请求头、JSON POST 及大小限制，无 CORS 放行。静态 Sites 包装不运行这个本地账号服务，UI 会明确报不可用，不把 HTML 当作导入成功。

Electron main/preload 只开放有限 import、目录选择器、系统主题与原生玻璃检测；检查发送窗口/main frame/origin，不开放 Node.js 给 renderer。`credential-store.ts` 使用 [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage) 将完整账号存储加密，系统加密不可用时拒绝保存，不明文降级；开发版未签名可能触发系统钥匙串询问。浏览器服务使用内存会话存储，两者账号数据不共享。

## 本地关联与只读查看

账号设置中没有仓库路径字段。Dashboard 的弹窗输入绝对路径或 ~/ 路径，桌面还可以使用系统目录选择器。服务识别 checkout 根目录，读取已配置 remote 并比较 host + owner/repo，匹配后保存关联。解除关联/移除账号不删除文件。

RepositoryView 使用真实 Git status、branch、最近 log、工作目录与暂存区 Diff。有限 execFile 参数、不使用 shell、禁止外部 diff/textconv、关闭可选 index 锁；不提供任意命令/任意文件读取。Diff 仅接受当前更改列表中的路径；未跟踪文件不编造差异或读取内容。没有 Git 写动作与模拟成功。修改文件、克隆、LFS 写入、AI 和 Presence 连接需要后续独立合同。

外观与折叠偏好使用 `gittogether.preferences.v2`；不保存账号令牌、仓库私密数据或错误状态。旧 v1 演示存储保留但不读取为新工作区，也不自动覆盖/清除它。
