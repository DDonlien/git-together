# GitHub企业版、GitLab与Gitee支持

- 原始prompt：「增加对 github 企业版（不同域名，sso 登录）gitlab ，gitee 的支持」。补充：「github.dxc.com 但是应该能兼容各类自定义输入的企业 github 地址」。
- 模型：gpt-6；环境没有更具体版本标识。
- 开始时间：2026-10-12 08:51:58 UTC+8；结束时间：2026-10-12 10:18:12 UTC+8。
- 预检：codex-standalone-ts，main/c971a86f68，版本0.23.0；fetch --prune成功，ahead/behind 0/0。存在Presence头像、Dashboard标题、图标和远端控制需求的未提交改动，保留原文件/索引，不切换分支或覆盖其他任务。
- 需求：IMPORT-19-providers、IMPORT-19-authorization。
- 已阅读根/macOS AGENTS及当前Rust/React架构、相关需求/设计/README和近期Windows/Presence日志。模板通用内容在线核对；记忆仅用于客户端定位及来源/运行边界，现状另行读取。当前后台为Tauri/Rust，旧Electron/TS后台不进入本轮实现或测试。

## 决策与进展

- 企业地址为可编辑域名，不硬编码github.dxc.com；GitHub企业服务器使用其/api/v3，GitHub企业云ghe.com使用对应api子域。GitLab使用/api/v4并保留嵌套项目路径，Gitee使用/api/v5。
- 网页授权复用现有有限Rust会话/回调与系统浏览器，按平台+域名隔离应用配置、state和凭据。GitHub企业OAuth需该域名登记的Client ID/Secret，企业IdP登录由浏览器处理；GitLab采用PKCE公共客户端，Gitee采用授权码及本机加密密钥。没有管理员应用配置时提供令牌备用和明确说明，不伪造一个可通用登录所有私有域名的公共OAuth应用。
- 成功标准：平台入口、身份/仓库分页、远端分支/历史/树/更改及现有Git网络流程均接通；企业OAuth返回目标域名而不是github.com，SSO错误不被当作成功或完整目录；类型/Cargo/构建及受控接口/页面验证完成，真实私有SSO状态单独说明。
- 官方参考：GitHub Enterprise Server OAuth文档、GitLab OAuth/Commits文档、Gitee官方/api/v5/doc_json和OAuth页面。GHES文档明确其OAuth不支持PKCE且需要Client Secret，因此企业服务器使用state+授权码+Secret；不能照搬github.com当前PKCE流程。

## 结果与验证

- 源码和本地预览实现完成；未运行历史后台测试，未使用真实账号令牌、企业密码或绕过TLS/SSO。
- 提交/推送/发布：尚未执行；保留其他任务变更。

- 五平台模型/入口及Rust读取已接通，GitLab数字项目端点/完整namespace/提交正文与父节点/分页树/差异/文件、Gitee v5及完整克隆路径已适配。OAuth配置、PKCE/授权码、state、防重放、拒绝/取消/SSO partial-results已接通。
- 安装版实际进程占用4174，遵守不操作安装版约定；浏览器开发用4176回调及同源代理。GitHub允许loopback回调使用不同端口，GitLab/Gitee应用需登记表单显示的回调地址。
- 使用vercel:react-best-practices检查输入、Ref并发保护、取消生命周期和键盘语义；保留既有Material组件，不引入技能建议的其他UI库。
- 保留并行远端控制/参与状态/Windows/性能改动及0.24/0.25版本递增；SDK核对已适配workspace新参数。

- 本轮新平台为兼容性新能力，当前并行版本已从0.23递增至0.26，本轮按minor递增为0.27.0并同步Cargo/lock，未回退其他任务版本。受控SDK执行59次真实本机HTTP请求，四平台身份/仓库/分支/历史/树/提交/文件和嵌套GitLab URL通过，三个新平台OAuth回调/令牌交换/重新身份验证/防重放通过；拒绝、取消、SSO partial-results与不含凭据DTO通过。数据与密钥均为临时合成fixture，不是企业SSO或用户私有平台验收。没有运行历史后台测试或新增正式测试文件。SDK初次GitHub git/commits fixture形状错误已按真实API裸tree格式修正后通过。

- 最终检查：0.27.0 `npm run check`、`npm run check:rust`、当前Rust服务构建、`npm run build`、`git diff --check`通过。其他任务的RemoteControl类型错误已在其任务中修正；没有代改其模块。Vite提示当前JS产物超过500kB，仅记录，不扩大本轮范围做拆包。
- 实际页面核对：五平台选择、自由输入github.dxc.com、GitLab/Gitee默认地址、令牌/网页切换、按平台清空手工Client ID/Secret、GitLab公共客户端无需Secret、浏览器4176回调、取消表单均正确。截图：/Users/taobe/.codex/visualizations/2026/10/10/01a1235b-a642-7cc3-a3bc-a857936416ac/providers-enterprise-account-20261012.jpg。临时页面已关闭，没有提交或保存表单测试值。
- 开发服务由并行任务恢复，4173/4175和4176保持运行，受保护status回读backend=rust/version=0.27.0，授权配置公开状态configured=true；账号目录为空。这仅证明本机服务与已有应用密钥可用，不证明任何平台的实际同意、回调登记或私有仓库范围。安装版4174保持原进程，未操作。
- 回调登记边界补充：GitHub OAuth App的loopback端口例外不能套用于GitHub App。公开GitHub App须登记开发4176回调，既有桌面4174保持；本轮未修改远端登记，未执行用户GitHub最终同意，也未据configured=true声称注册已完成。参考https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-user-authorization-callback-url 。
- 本轮不额外生成新安装包（AGENTS「默认只做本次任务需要的修改和验证……不要额外生成安装包」）；源码未执行commit/push，保留共享工作区和索引的其他任务。当前未提交实现需纳入下一次正式版本的同源跨平台发布，未宣称正式版或安装版已支持。
- SDK核对所用隔离临时目录、构建缓存及fixture已清理；未新增正式测试文件。
