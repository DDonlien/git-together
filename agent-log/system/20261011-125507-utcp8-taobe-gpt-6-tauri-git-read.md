# Tauri迁移后Git读取修复

- 开始：2026-10-11 12:55:07 UTC+8；模型仅可确认gpt-6。
- 范围：RUN-01-tauri-git-read，归入既有框架迁移需求；不创建分支或worktree。
- 工作区：codex-standalone-ts/main，fetch后ahead/behind为0/0，开始时干净；不操作旧main工作区。
- 模板：远端与本地通用部分一致，v1.9.1-260916-010202。
- 用户反馈：GitHub Desktop显示ball-maze本地8个更改，GitTogether未显示；怀疑迁移后的本地和远端读取缺失。
- 成功标准：明确实际目录关联与读取结果，修复已证实的迁移差异，实际Rust链路能读取新增/删除和远端状态；版本、安装包及公共更新源核对一致。
- 初步证据：只读Git在ball-maze/main读到4删除、4未跟踪，HEAD为ada41e1913a257a83860b52a4fb32f3fb9226c17。安装版Info.plist为0.22.0；只读日志含fetchRepository权限失败。最初误判Rust凭据origin为完整URL，随后回读main/blame确认迁移提交已正确使用origin，撤销此判断，不据此修改代码。
- 持续授权：自动main提交/推送、打包、公证、发布，复用gittogether-notary；不启动/操作/升级安装版，不要求解锁，不输出或重放用户凭据。
- 验证：沿用当前规则，使用只读诊断与隔离实际Rust/Git运行核验；不运行历史TypeScript后台测试作为Rust回归。
- 状态：根因核对与修复完成，推送及正式包发布中。

## 诊断与修复

- 通过正常签名的生产Rust Service只读读取Catalog：2账号、59仓库、16关联；ball-maze没有关联，配置未被本任务修改，未导出或重放令牌。
- Rust git::task实际读到ball-maze/main的8个更改；Git ls-remote与Gitea API均返回main=ada41e1913a257a83860b52a4fb32f3fb9226c17、ue-5.8=eb4411ea1a3f731d55350806a5f0d595f46d7387。完整远端工作台为2分支/59提交，带既有最近50条历史提示；截图main正确。
- 其他已关联目录中确认dive-up读取失败：保存的Git origin为SSH2222，账号API使用HTTPS10443。旧TS身份比较忽略传输端口，Rust错误加入端口。恢复host+解码仓库路径身份，保留实际Git凭据的origin限制；补齐scp、编码路径、大小写与.git规范化。
- 修复后以Finder最小环境实际读取ball-maze、dive-up、my-issue成功；dive-up已有目录恢复且未更改用户文件。两provider的Git/API HEAD一致。未发现代理差异导致的错误，不修改系统或Git代理配置；未将日志中其他未定位的失败归为同一原因。
- 更改栏未关联空态直接说明无法读取本地更改，并复用已有配置回调提供关联按钮；已有目录不显示未关联提示。不自动扫描任意父目录或写入用户正在运行的账号配置。
- 共享目录同时有隐藏数量、搜索/展开、读取角标任务；保护其源码、文档和版本，不归入本任务提交。其他任务已递增至0.22.2，本任务为已确认的迁移匹配bug按SemVer递增patch至0.22.3，同步前端/Rust版本；实际发布以最终已提交main为准。

## 验证与交付

- 身份匹配8项临时诊断检查通过：SSH/HTTPS不同端口、scp、大小写/.git/尾斜杠、编码中文、不同主机/仓库及非Git协议。没有将保留的TS后台测试作为Rust验收。
- npm run check、cargo check、npm run build通过；前端构建263模块，保留既有大chunk提示。版本同步后npm run check:rust使用Cargo --locked通过。
- 隔离生产RepositoryChangesColumn实测亮暗主题、按钮打开配置回调、取消返回及已有localPath隐藏提示。此页面不访问用户账号、不保存关联；不冒称安装版交互验收。截图为macos/artifacts/tauri-git-read/local-association.png。
- 本机真实Rust只读诊断与上述合成UI分别记录；暂未定位的其他日志失败不归入此修复，不宣称所有账号/仓库错误消失。
- 版本与正式签名、公证、公共更新源验证进行中。
