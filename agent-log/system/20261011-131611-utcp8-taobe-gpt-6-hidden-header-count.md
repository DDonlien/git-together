# Dashboard 隐藏表头数量

- 用户原始 prompt：隐藏的逻辑非常诡异，如果我没有显示隐藏，那隐藏的统计在列表表头肯定应该就是 0 啊，只有我显示了隐藏对象才会有显示呢
- 模型：gpt-6（运行环境仅暴露此标识，无法获得更具体版本）
- 启动分支与版本：main，3d2c9742d5，0.22.0；fetch后与origin/main一致，工作区干净
- 开始：2026-10-11 12:52:53 UTC+8
- 结束：2026-10-11 13:16:11 UTC+8（发布验收于13:07:46完成，本次仅收尾文档）
- 是否提交：已提交并推送源码0b6bca1b940b793ffbb2830aa6111fe131dda1a8；后续文档收尾提交另记

## 上下文与成功标准

已读根/macOS AGENTS、当前README/REQUIREMENTS/DESIGN/ARCHITECTURE相关章节、字号/LFS/最新Tauri迁移日志与隐藏状态记忆。远端模板元数据和项目专用段落之前的通用规则一致，无模板更新。以当前Tauri/Rust入口为准；沿用用户持续自动发布及不操作安装版App的要求。

关闭显示隐藏时，列表表头隐藏统计为0（沿用零角标不显示），排序也不受不可见隐藏记录影响；开启时仅汇总当前筛选仓库内的隐藏记录。搜索/仓库筛选和恢复动态重算，展开/收起不改变仓库级汇总；工具栏隐藏总数与顶部隐藏排除规则保持。验证隔离前端生产组件的交互及类型/Cargo/生产构建、签名公证包与公共更新源，不运行历史Node业务回归，不操作真实用户Git或安装版。

## 行动与判断

- Dashboard.hiddenCount原先直接读取偏好，因此关闭显示隐藏时仍将隐藏分支计入表头和排序；在两处共用的派生函数按showHidden返回0，保留现有筛选与恢复路径。仅此逻辑改动及澄清global stats的注释，无新存储或后台业务。
- 本次为既有显示/排序修正，递增patch 0.22.0 → 0.22.1；同步package/lock、Cargo/lock与Tauri版本。README当前源码更新，公开版本待发布后记录。
- 更新需求IMPORT-14-hide-header-count、DESIGN数量/隐藏语义及macos/AGENTS的最新隐藏澄清。
- 共享目录另有搜索/披露与Rust读取任务在编辑，保护其文件和文档行。首次文档批处理因输入编码失败，未改写文件；已使用ASCII转义脚本和结构化补丁处理中文。

## 验证与交付

- 类型检查、当前Cargo --locked检查、生产构建和差异检查通过；生产构建262模块，沿用既有大于500kB分块提示。未新增或运行自动化测试套件。
- 隔离React生产Dashboard组件配确定性3仓库/4隐藏记录：默认关闭时表头0且无角标，隐藏降序按全部0的名称兜底排序；开启时4（beta、alpha、gamma顺序），顶部统计1/2/0/2保持。实际键盘搜索alpha后为2；展开/收起不改变汇总，关闭隐藏时仅main可见且表头0；开启后显示2个隐藏分支，恢复topic-a后表头1、工具栏总数3。重新加载后偏好保留且开关默认关闭，表头0。截图保存在macos/artifacts/hidden-header-count；只有Lit开发模式提示，无页面错误。
- Tauri配置的版本为package.json相对引用，保持原引用，仅同步package/lock与Cargo/lock为0.22.1。最初ASCII文档脚本在此引用断言失败前已更新package及lock；后续补齐其余版本与文档，没有覆盖其他任务的工作区改动。
- 开发统一入口尝试编译/正常签名后，确认4174由用户已安装App的PID 55548占用；未停止或操作它。Rust开发服务无法与该固定授权端口共存，本轮以独立无后台Dashboard数据核对前端，另启动4173的界面入口；不把页面可用声称为账号服务已恢复。正式包与更新源验收不依赖操作安装版。
- 同一共享文件中的其他搜索/动效/读取健康改动仅留在工作区；将从HEAD基线只暂存本次隐藏函数、对应文档与版本，随后用独立干净main快照打包，防止携带其他未完成改动。

## 正式交付

- 已推送main源码0b6bca1b940b793ffbb2830aa6111fe131dda1a8。独立干净main快照仅包含本次隐藏计数及对应版本、文档；源码SHA-256为db3013bc753bd609db51d0f46e8cb55f722c4f04c9724d0e3ee03b09c530eb86。标准Tauri/Rust入口再次通过类型、Cargo --locked与生产构建。
- 最终包版本0.22.1、标识com.gittogether.standalone，仅有gittogether可执行文件，无Electron/Node。Apple公证5d934d24-ba0f-4967-a25c-baedaa4c0fef为Accepted；staple/validate及最终deep/strict签名通过。spctl报告Notarized Developer ID及本机原有security-disabled override；本轮未改变设置，不声称其他设备Gatekeeper验收。
- 最终ZIP为4205840字节，SHA-256 a68635bae8574833feea38154f7fe387698f0afeee974c6f53eda3d6015a00c6，CRC完整；Tauri tar为4201879字节，SHA-256 ff4990fe746fd590dcb3e38e458b44a7e71163d5cca2371815a425dae84e14b0，更新签名与版本绑定校验通过。
- https://github.com/DDonlien/git-together/releases/tag/v0.22.1 正式公开，publicUpdateVerified=true。无需登录的latest/Atom/tag、两套更新清单/签名及完整ZIP/tar下载大小/摘要全部匹配。未操作已安装App，未执行用户Git写入。
- 截图保留macos/artifacts/hidden-header-count/hidden-off-detail.png等。临时浏览器页、隔离预览源码和独立干净打包checkout已清理；共享4173预览及其他任务改动保留。ARCHITECTURE补充列表表头与顶部关联统计的区别。
- 公共包验收后另一项0.22.2发布已持有共享发布锁；仅准备文档记录，待锁释放后提交/推送，避免使其远端main来源检查失效。正式0.22.1交付已完成，不将并行发布计入本次工作。

- 发布锁释放后，在同一短期锁下提交并推送本次验收记录，保护并行源码与发布来源；纯文档不生成新包。
