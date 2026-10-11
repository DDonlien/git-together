# 远端分支等待和权限提示诊断

- 开始：2026-10-11 21:52:49 UTC+8；模型可确认gpt-6，执行者taobe；main/b1486c42c5，源码0.22.7。
- 用户原始prompt：「这又是为什么，看看日志，是不是 mac 要本地文件夹访问权限？但为啥会显示是 git 问题呢，另外读取也非常慢（远端分支）」；截图为git-together展开等待和通用Git错误提示。
- 需求：RUN-01-remote-first；成功标准为依据实际版本/日志说明失败归属，先展示平台已读取内容，保留自动Fetch与取消/失败退避，完成既有发布门槛。
- 约定：读取最新根/macOS规则和新于本会话日志的mass-git-read记录；沿用Tauri/Rust、无项目测试、自动签名公证发布及不操作安装版。保留其他任务REQUIREMENTS行序改动；真实账号/仓库只读、不导出或重放凭据，不更改macOS权限/安全设置。
- 实际安装：/Applications/GitTogether.app plist及21:49:55新日志会话均0.22.4；当前进程35260。源码和已公开0.22.7不能当作当前运行版本。
- 日志：最新session4b178920-9fa0-486e-9dc4-6db1209dd904本地localWorkspace持续成功（多为197—252ms），fetchRepository有10个permission分类失败约75—77秒及4个timeout约120秒；未看到该会话本地读取API失败或新的Git细分日志。旧通用文案含权限，diagnosticFailure正则检查.*权限将其误分类；0.22.7已修文案和系统代理路径，并有725ms公开仓库读取的既有隔离证据。不将API成功等价于每个本地task无错误或断言全部目录授权。
- 新定位：当前0.22.7的useRemoteRepositories仍先await fetchRepository，再读取remoteWorkspace；Git网络等待会阻塞独立平台API及Dashboard远端分支显示。平台API无需等待本地引用，修为同次自动刷新并行、API先发布，Fetch结果单独落提示和退避，保持同资源调度所有请求收尾。
- 苹果官方文件访问文档说明受保护的Desktop/Documents/Downloads、网络及可移除卷需要访问控制；本轮没有因此扩大权限或认定是用户授权问题。官方来源https://support.apple.com/en-euro/guide/security/secddd1d86a6/web。
- 实现：同次调度并行调用remoteWorkspace/fetchRepository，平台返回即发布完整远端workspace；loading继续真实表达后台Fetch在途，两个请求收尾后按各自结果更新单处提示并保持退避。平台失败立即保留旧内容和提示，Fetch失败不抹去远端数据；已取消/换仓库结果不发布。
- 隔离前端核对：真实useRemoteRepositories与RepositoryBranchRows，虚构150ms平台响应、手动保持Fetch未完成；Fetch未完成1个时main/feature-search两分支已显示。换仓库后旧Fetch迟到失败未覆盖新仓库，成功收尾loading=false；平台失败保留2分支且提示立即出现，平台/Fetch同时失败只有1个alert；仅Fetch失败显示远端已读取/本地引用未完成，2分支仍保留。无console error。截图artifacts/remote-first/branches-before-fetch.png，仅前端隔离核对，不作真实账号联网或安装版验收。已关闭本轮标签/4268服务并删除两项临时入口。
- 核验：在独立main checkout仅复制本轮hook及4项版本输入，隔离另一会话正在修改的更新安装功能；版本0.22.8，TypeScript、Cargo --locked及263模块生产构建通过（仅既有大chunk提示）。其他源码/日志和REQUIREMENTS行序保留，不纳入本轮。
- 源码提交/正式发布/结束：待记录。
