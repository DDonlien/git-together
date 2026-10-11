# 仓库读取与功能错误角标语义

- 用户需求：刷新时整排操作呼吸且不可悬停/按下，仓库左侧文件夹显示旋转加载角标；项目访问故障标在文件夹上，只有具体功能故障标在具体按钮上且可悬停阅读原因。
- 首次环境检查：2026-10-11 12:54:07 UTC+8；登记：12:58:50；模型仅可确认gpt-6，执行者taobe。
- 工作区：codex-standalone-ts/main；起始HEAD为3d2c9742d57a2958dd17ee62ca41befe7093d3e2；fetch后ahead/behind为0/0。
- 模板：通用部分与source v1.9.1-260916-010202一致。
- 范围：IMPORT-14-read-health-scope；只调整实际读取状态、角标和对应交互，不改变Git执行、数量、读取频率或筛选。
- 成功标准：访问失败不出现整排功能感叹号；刷新时包含Hide/Download在内的操作不能响应鼠标或键盘；旋转角标位于左侧文件夹；明确的单项功能异常可从该项角标读取原因。
- 现状：GitSignals将本地/远端读取故障映射到多个操作，RepositoryActions按组渲染错误；现有呼吸仅视觉动画，没有禁用真实按钮、无目标包装按钮或提示。
- 并行改动：另有搜索/展开动效、隐藏数量及Rust Git读取任务修改共享Dashboard、文档、版本和后台；保留，不归入本任务提交。
- 持续交付授权：复用既有签名、公证及更新源配置；不操作用户已安装App，不要求解锁。沿用当前不新增或运行测试的边界，做类型、构建和范围检查。
- 状态：完成；源码独立推送，最终0.22.3正式更新已包含本修复，安装包及公共更新源已回读。

## 实现与检查

- Git数量与读取状态保持原契约，repositoryReadFeedback只从独立本地/远端状态汇总错误；Dashboard文件夹用14px旋转或错误角标，刷新优先。
- 实际reading合入真实disabled和无目标包装入口的键盘/按下边界；包含Hide/Download，开始刷新清理已有按下状态。CSS禁用hover/press，减少动态效果保留原静态忙态。
- 功能错误使用独立actionErrors，按具体动作键显示12px描述角标，同组Commit/Submit不共享错误；没有把当前读取错误或无目标状态填入功能错误。当前没有额外的真实功能故障来源，未伪造运行故障。
- 共享提示边界观察行状态变化，鼠标不移动也能关闭已打开提示；错误角标的鼠标与键盘提示复用原边缘定位。
- npm run check与npm run build通过（263模块）；保留既有大于500kB分块提示，git diff --check通过。没有新增或运行测试；没有真实账号/故障链路或安装版交互验收。
- 修复既有状态语义与交互，递增patch 0.22.1→0.22.2，同步package/lock与Cargo/lock版本，保留并行Rust依赖改动。0.22.1正在由另一任务在干净快照中签名发布，本任务不覆盖其版本资产。
- 将仅暂存本需求的Dashboard/CSS段落、共享动作/提示、角标、对应文档和版本，从已推送main的独立干净快照打包。

## 交付进度

- 本需求15个文件/段落已独立提交daba57fa8a37c96bf426d34863a04601a63a73d0并推送main；仅包含本需求的Dashboard/CSS/文档段落及0.22.2版本，同期搜索/动效和Rust读取修复仍留在原工作区。
- 在项目容器内创建临时独立main checkout（未创建新分支或受管worktree），只从已提交快照打包；依赖用已有node_modules，不导入其它未提交源码。统一发布锁空闲后进入正常流程；复用既有Developer ID、gittogether-notary和Tauri更新私钥。
- 正式快照类型检查、Cargo --locked检查及生产前端构建（263模块）通过；原生优化编译进行中。没有运行测试套件，没有操作安装版。

- 首个0.22.2候选包Apple公证6981253c-03b9-4086-859b-721ae7cfbe82为Accepted，staple/validate、deep/strict签名和Tauri包签名/版本校验通过；App只有gittogether主程序。spctl为Notarized Developer ID，并返回本机既有security disabled override，本轮没有更改安全设置。
- 发布门禁在公开上传前发现main已前进到搜索/展开提交7d8b856f3e9fb53b2491f37ee4d45324a0d0196a，因此阻止旧daba57f快照发布；没有绕过main一致性、覆盖正式资产或声称旧候选包已经上线。新main继承本任务全部修改，后续按最新已提交快照/正式版本交付。

- 最新已提交main为021dc54968，权威版本0.22.3，继承本需求daba57f；四个共享状态/按钮/提示文件blob完全一致，角标修改未被覆盖。该最新快照的签名发布已取得统一发布锁，复用其正式交付；本任务不并发发布旧0.22.2、不在公证/发布期间推送收尾文档扰动main一致性。最终以0.22.3包/公共更新源及源码祖先关系回读为准。

## 完成与最终版本

- 结束：2026-10-11 13:18:53 UTC+8。最终正式版本0.22.3，源码021dc549686740a3d731af0078db8a11ed0a26f5；git祖先检查确认包含本需求提交daba57fa8a37c96bf426d34863a04601a63a73d0，四个共享读取/动作/提示文件blob与本需求提交完全一致。
- 最新main也包含同期搜索/展开及Rust身份读取修复，保留各自独立提交和验证归属；本需求没有重新归属它们的代码或只读诊断。
- 0.22.3公证29e5a3bc-e484-4cd9-a637-b3441fbfa6a9为Accepted；本任务再次实际执行最终App deep/strict签名检查与stapler validate，均通过，Bundle版本0.22.3。复用既有Developer ID、gittogether-notary和Tauri公钥/签名配置，不请求解锁或操作安装版。
- 公开版本：https://github.com/DDonlien/git-together/releases/tag/v0.22.3，stable/latest。ZIP为4206222字节，SHA-256 7e85c435421516af6d5db1437362894df89bdca09be1952bbb32f8a246cd3421；Tauri tar为4203641字节，SHA-256 1cb98f68dbce718c112de992c58139850c0b652834eaa4d02434787d73c5be01。
- 在该最终包上独立重新调用公开回读校验：latest正式状态、tag/sourceCommit、Atom、latest-mac.yml、latest.json及latest重定向、公开sig、完整ZIP的大小/SHA-256/SHA-512和完整tar的大小/SHA-256均一致；publicUpdateVerified=true。证据：_builds/read-health-release-proof-0.22.3.json及正式包build-info.json。
- 正式包和公开更新源校验后，额外读取认证发布说明遇到GitHub REST配额403；没有重配凭据或反复重试。该读取不影响已完成的匿名公开更新源校验，本任务没有改写其他任务的发布说明。
- 没有新增或运行测试，没有模拟真实功能故障、用户Git写入、真实账号故障交互或安装版验收。类型/构建、条件渲染源码与最终包/更新源分别记录，不将这些证据称为真实故障运行验收。
- 临时独立release checkout和暂存补丁文件清理；正式0.22.3包与证据保留。首个0.22.2候选包仅为已公证但未发布的历史候选，不是用户可更新版本。
