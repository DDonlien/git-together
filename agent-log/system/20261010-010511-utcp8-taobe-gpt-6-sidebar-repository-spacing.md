# 侧栏仓库项两态纵向间距

- 用户原始请求：「侧边栏的各个仓库收起和展开的纵向 padding 不一致」。承接上一轮账号标题行间距修正，本轮补齐仓库子行。
- 执行者/模型：taobe / gpt-6；运行环境仅提供该模型标识，未使用推测的子版本名。
- 分支/基准：codex/standalone-ts，1e5dc975f5；同步预检后相对upstream为ahead 1、behind 0，不合并或切换。保留其他任务在REQUIREMENTS.md、docs/development.md及读取/刷新相关源码中的未提交改动。
- 模板检查：source版本v1.9.1-260916-010202，通用与技术栈规则和本地逐字一致，无需同步。
- 成功标准：展开与收起仓库项共用32px行高、零纵向padding，19px文件夹中心不变，保留展开横向布局、选择/账号折叠状态和服务会话。
- 实际原因：展开仓库项旧高度34px，继承nav-item的上下7px padding；收起覆盖为32px和padding 0。上一轮只统一账号标题与组间距，没有修改仓库项。
- 实现：全局侧栏repository-item高度使用既有sidebar-button-size，padding-block为0；收起已有32px/padding 0规则继续适用。仅更改局部CSS，未更改账号模型或组件交互。
- 版本：样式修复递增patch，0.12.0 → 0.12.1，package.json与package-lock.json同步。
- 验证：0.12.1类型检查、生产构建与差异格式检查通过；4173浏览器CSSOM确认sidebar-button-size为32px，展开repository-item的padding-block为0px，收起repository/account规则height共用同一令牌、padding为0px。主预览实际0账号、0仓库，仅核对已加载样式，没有声称真实仓库两态目视通过；临时后台预览已关闭。本轮未增加或运行自动化测试。
- 并行改动：执行过程中styles.css另有Git操作读取角标样式加入，本轮只修改原repository-item高度声明这一行，保留其他改动。
- 运行/交付边界：当前原生PID5834来自0.12.0签名包；源码修改不等于安装包更新。本轮没有明确打包请求，按当前AGENTS.md构建/打包规则不生成或替换原生包。既有预览服务继续运行，不重启，不改凭据。
- 提交状态：未提交、未推送、未发布。
