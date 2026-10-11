# Tauri迁移后Git读取修复

- 开始：2026-10-11 12:55:07 UTC+8；模型仅可确认gpt-6。
- 范围：RUN-01-tauri-git-read，归入既有框架迁移需求；不创建分支或worktree。
- 工作区：codex-standalone-ts/main，fetch后ahead/behind为0/0，开始时干净；不操作旧main工作区。
- 模板：远端与本地通用部分一致，v1.9.1-260916-010202。
- 用户反馈：GitHub Desktop显示ball-maze本地8个更改，GitTogether未显示；怀疑迁移后的本地和远端读取缺失。
- 本轮原始prompt：「我做了本地修改，git together 没有读出来；我觉得远端似乎也没有读取正确；是不是最近迁移到 tauri 带来的 bug，tauri 肯定没错应该是有东西没实现好」，附GitTogether与GitHub Desktop对比截图。
- 成功标准：明确实际目录关联与读取结果，修复已证实的迁移差异，实际Rust链路能读取新增/删除和远端状态；版本、安装包及公共更新源核对一致。
- 初步证据：只读Git在ball-maze/main读到4删除、4未跟踪，HEAD为ada41e1913a257a83860b52a4fb32f3fb9226c17。安装版Info.plist为0.22.0；只读日志含fetchRepository权限失败。最初误判Rust凭据origin为完整URL，随后回读main/blame确认迁移提交已正确使用origin，撤销此判断，不据此修改代码。
- 持续授权：自动main提交/推送、打包、公证、发布，复用gittogether-notary；不启动/操作/升级安装版，不要求解锁，不输出或重放用户凭据。
- 验证：沿用当前规则，使用只读诊断与隔离实际Rust/Git运行核验；不运行历史TypeScript后台测试作为Rust回归。
- 状态：根因核对、修复、推送及正式包公开校验完成。

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
- main功能提交021dc549686740a3d731af0078db8a11ed0a26f5已推送并回读；正式0.22.3按该提交构建，发布入口再次完成类型/Cargo --locked、263模块前端构建与Rust release编译。
- Developer ID签名及应用身份com.gittogether.standalone/86J7X3KZ5Z核对通过；最终包仅有gittogether。Apple公证29e5a3bc-e484-4cd9-a637-b3441fbfa6a9为Accepted；staple/validate、deep/strict签名及Gatekeeper评估通过。
- https://github.com/DDonlien/git-together/releases/tag/v0.22.3正式公开；tag与源码提交一致。公共latest、Atom、latest-mac.yml、latest.json、.sig和完整ZIP/tar下载均核对，build-info的publicUpdateVerified=true。ZIP为4206222字节，SHA-256=7e85c435421516af6d5db1437362894df89bdca09be1952bbb32f8a246cd3421；tar为4203641字节，SHA-256=1cb98f68dbce718c112de992c58139850c0b652834eaa4d02434787d73c5be01。
- 产物位于项目容器_builds/gittogether-0.22.3-macos-arm64-aPV1Dk。未启动或操作已安装应用，未修改账号关联及ball-maze/dive-up/my-issue的Git文件、索引或HEAD；ball-maze关联需在用户自行更新后通过新增入口选择现有目录。
- 收尾只读确认React预览4173仍在运行；4174由用户已安装应用占用，4175未运行。Rust开发服务需要先绑定4174，受最新「不操作用户安装版」约定限制，本任务未停止安装版来恢复辅助服务；真实读取证据来自正常签名的Rust只读诊断，未冒称浏览器全链路已就绪。

- 结束：2026-10-11 13:17:25 UTC+8；收尾文档独立提交后推送main，不为仅文档提交重新打包。
