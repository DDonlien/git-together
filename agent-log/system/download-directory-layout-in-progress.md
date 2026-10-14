# 下载目录层级及仓库目录显示

- 用户原始prompt：

> 修改一下下载的默认行为，如下：
>
> 下载的时候会指定文件夹，假设叫FOLDER
>
> 那我们的默认下载行为应该是下载到
>
> FOLDER/project-name/project-name_branch-name文件夹
>
> 而不是现在这样branch-name直接裸在FOLDER里
>
> 另外，下载的时候，根据实际的盘符斜杠情况进行显示。比如Windows和Mac的斜杠是相反的，一个是正斜杠，一个是反斜杠。要按照实际的设备去显示对应的斜杠，不要正反斜杠混合显示
>
> 然后本地目录这里，如果：
>
> 1. 识别到了我们的默认结构，FOLDER/project-name/project-name_branch-name的话，仓库显示project-name这一层，worktree显示真实层（不管是不是只有一个work tree）
> 2. 如果只识别到worktree文件夹（其实无论如何都会识别到我tree文件夹，否则你相当于什么都没识别到嘛）那仓库的目录也显示为worktree文件夹（像附件1这样的情况，就不应该把clash config的文件目录显示成gitea）
> 3. 如果识别到多个worktree文件夹，但是是裸放置在一个更大的folder里面，也就是说同一个目录下混了多个仓库，形如：FOLDER/Project-name/worktree-1、FOLDER/folder-2/worktree-2、FOLDER/worktree-3。
> 4. 这个时候就如实显示仓库为FOLDER（最小公共父目录），各个worktree如实；

- 附件：codex-clipboard-a568d82b-cecc-49db-b172-704e631cf14b.png；截图用于定位显示问题，不是额外操作指令。
- 模型：gpt-6，环境可得的最具体标识。
- 启动分支与版本：main，7c0f60419be38c5f1a3073c10a1446d2e3cb6936，0.31.3。
- 开始时间：2026-10-14 14:28:27 UTC+8为同步预检记录；此前已开始检查。
- 结束时间：进行中，完成时按结束时间改名。
- 任务结束时是否提交：尚未提交。

## 已读上下文与成功标准

- 根与macOS规则、README、相关需求及设计/架构、最近三条执行日志已读。官方模板仍为v1.9.1，通用内容一致；fetch/prune后当前main与origin/main为0/0，工作区干净，没有创建或切换分支/worktree。
- 当前下载预览硬编码正斜杠，Rust目标为parentPath/folderName。Dashboard仓库行直接显示LocalLink.path（最初选择范围），分支显示其真实worktree。
- 本轮只改变新下载层级和路径显示，旧目录不移动，保存范围不改。仓库显示从完整已关联目录推导，不用搜索或隐藏后的子集计算公共父目录。
- 成功标准：三种目录显示及新下载层级全部准确，Windows/macOS分隔符与后台实际路径一致；实际Rust/Git取样、相关客户端回归、类型、Rust与构建分别通过，不将合成页面或源码当成用户安装版更新。
- 需求ID：IMPORT-04-directory-display及test、IMPORT-14-branch-download-layout及test。README/ARCHITECTURE/DESIGN随行为更新；持续授权允许提交推送，安装版不操作。

## 实现与验证进展

- 下载默认名称改为项目名_安全分支名，Rust目标改为所选目录/安全项目名/工作目录名称；原请求契约和实际下载后保存流程沿用。已有容器不是目录或为符号链接时拒绝，目标已存在不覆盖；容器在文件下载完成后创建。
- 新显示函数从完整关联集合推导默认容器、单目录或最小公共父目录。Windows盘符/UNC格式化为反斜杠，macOS保持正斜杠；原保存路径及选择范围不变。关联提示也使用同一显示路径，避免悬停仍显示旧父目录。
- 处理中另一个Presence任务及Provider任务开始修改共享工作区，保留其源码、版本及需求。将本次九个源码/测试文件复制到忽略目录中的7c0f60精确源码副本，四个版本镜像准备为0.31.5，独立验证并精确暂存自身内容，不创建分支或worktree。
- 首次Rust fixture使用异步闭包遇到生命周期编译错误，改为实际复用的测试Git执行函数；第一次Windows文件断言发现Git按配置检出CRLF，修正测试判断，不修改用户Git配置或生产换行策略。最终隔离真实Git下载通过，核对默认项目容器、实际main和feature/layout分支、深度1、文件、.git worktree及已占用目标/容器文件保护。
- 客户端原19项通过；补充关联提示回归时，初始fixture没有已读工作区，因此按既有契约显示“正在验证”，修正fixture为健康已读目录，不改生产错误优先级；最终20项及类型检查继续核对。locked全目标Cargo检查通过。最终生产构建通过并保留既有大chunk提示，不记录为失败。
- 生产组件隔离浏览器已核对Windows/Mac默认目标、自定义目录名称仍保留项目层、下载参数保持原parentPath和叶目录、取消不提交；四类仓库与实际分支路径、完整提示正确。键盘搜索worktree-3后仅余mixed及该工作目录，仓库仍显示D:\FOLDER。Playwright直接填搜索影子输入未触发组件值更新，按真实键盘输入及Enter核对成功，没有据此修改无关搜索实现。
- 浏览器截图仅含合成账号与路径：download-windows.png、download-mac.png、directory-filtered.png位于忽略目录macos/artifacts/download-directory-layout。没有实际下载用户仓库、写入账号文件或操作用户已安装应用。
- 已按React技能审阅三个TSX组件：纯派生目录，无新状态/Effect/请求层；用仓库关联Map复用查询，保留系统选择器、禁用、输入、焦点和原保存路径。

## 验证完成

- 最终隔离源码的20项客户端回归、真实Rust下载回归、TypeScript检查、locked全目标Cargo检查及生产构建均通过；最新测试fixture修正后类型检查再通过。未运行Electron/Node旧后台测试或改动用户目录/配置。
- README更新下载与显示说明；DESIGN增加下载与仓库目录显示章节；ARCHITECTURE记录不变请求/保存契约、原范围及纯派生路径。IMPORT-04-directory-display及test、IMPORT-14-branch-download-layout及test均完成源码验收，安装包/安装版仍未更新。
- 源码提交前再次fetch/prune，当前main与origin/main为0/0。自身源码、验证副本、版本及文档/需求局部暂存范围将在提交前核对，其他Presence/Provider任务继续保留；源码提交、推送和最终结束时间随后记录。
