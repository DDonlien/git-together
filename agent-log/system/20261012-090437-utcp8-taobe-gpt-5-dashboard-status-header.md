# 仓库列表表头与末行分隔线

- 用户原始prompt：「最后一行不要分割线；顶部“仓库”两个字应该和仓库名对齐，左边图标应该有一个叫“状态”的中间对齐的标题栏，用仓库状态排序」。附件两张裁图作为局部视觉依据，不改变周边材料。
- 模型：gpt-5，当前可验证的最具体家族标识；执行者taobe。
- 开始：2026-10-12 08:51:31 UTC+8；结束：2026-10-12 09:04:37 UTC+8。
- 工作区：codex-standalone-ts/main，c971a86f68；版本0.23.0，fetch后相对origin/main为0/0。
- 当前未提交Presence/远端控制及图标任务均保留，Dashboard的Presence改动不归本轮。无提交、推送、打包或已安装应用操作授权扩展。
- 已读根/macOS约束、README、相关需求/设计/架构、当前实现与最近Windows/Presence/远端控制日志。轻量记忆只用于定位正确工作区与源码/安装包边界；通用模板在线核对。沿用当前不新增或运行旧项目测试的约束，分别做类型、构建与实际浏览器验证。
- 成功标准：末个可见仓库的底线消失但中间线保留；表头名称对齐、状态居中且可正反排序；分支展开/筛选/原图标与Presence保持，不新建读取器。当前网页显示本地服务不可用，预览依赖将按已授权测试就绪范围恢复。
- 需求：IMPORT-13-status-header。未主动分配子Agent。

## 实施与验证

- 通用模板HTTP200、通用前缀一致。本轮先登记需求，再仅调整Dashboard排序表头、状态级别与行报告，CSS首列表头/末行细则。同文件里的PresenceAvatars/PresenceBranchIcon、Rust Presence/Windows/远端控制未提交内容全部保留，不重归属。
- 首列不拆成新物理列，复用原图标/10px间隔/名称网格；状态箭头不推移居中文字，仓库名称左边缘消除默认1px表头padding误差。末仓库后有隐藏分支tbody时正确去线，展开保留父子间隔，末分支仍无底线。
- GitSignals沿用读取/差异事实，排序异常0、处理中1、差异2、已确认一致3、未知4，升降序及同级名称稳定。正在读或推送优先于旧错误，与图标当前显示一致；不把Push成功直接等同完整同步。现有未关联读取仍行拥有，仅通过带instanceId的稳定回调报告排序级别，相同值不触发父更新，不创建重复读取器。
- 增加了可交互排序能力，minor递增0.23.0→0.24.0；同步package-lock根与Cargo镜像版本，Tauri配置仍引用package.json。没有打包或发布。
- React最佳实践技能完整读取，补读derived-state-no-effect及functional-setstate；排序由当前原始信号派生，行拥有状态不能在父props里直接得到，仅报告用于排序的级别。稳定回调、原始依赖和同值退出经浏览器核对；不增加全局监听/请求或持久化。
- 类型检查、Cargo --locked、277模块构建、git diff --check均通过；有既有Presence::access/Service::target_operation死代码警告和Vite大分块建议，不描述为零警告。按当前约束未新增或运行旧项目测试。
- 忽略目录artifacts/dashboard-status手动页面直接挂载生产Dashboard，5个合成仓库且不使用旧Node服务、用户账号、目录或Git。实际1280×720测得名称左边缘和状态中心差值均0px；边线四行1px/末行0px。升序C异常/B读取/E差异/A同步/D未知，Enter倒序；模拟读完成后正确重排，同级名称稳定。实际键盘搜索A-只剩1行，main展开时父边1px、末分支0px。
- 亮暗截图核对保持原材料。Manual fixture补DOM主题属性后与正式App沿用相同root主题；热更新曾重复createRoot，加入dispose并在新页复核零error，Lit开发模式warning仍存在。工具fill只改变shadow input未触发Lit输入事件，改为真实键盘输入后搜索通过；这是验证方法问题，未改正式输入逻辑。
- 证据位于visualizations原会话目录：dashboard-status-header.png、dashboard-status-dark.png。隔离标签2及新页均已关闭；手动页面只作本地验证，不在生产入口/构建中。

## 当前服务边界与交付

- 初始用户网页报告本地账号服务不可用，4173/4175无监听。统一dev完成0.24.0 Rust编译后因4174被占用退出；只读ps核对PID7774为/Applications/GitTogether.app/Contents/MacOS/gittogether。
- 遵守安装版不操作约定，没有停止、修改或重启该App，也没有改变授权回调/端口或复制凭据。已向用户说明端口阻挡，保留本轮启动的4173 UI-only预览。账号/授权后台尚未恢复，不能把HTTP UI和合成列表当真实账号完整验收。
- 需求、DESIGN、ARCHITECTURE、README、macOS局部视觉约定与design-qa同步。没有提交、推送、发布、安装版更新或用户Git写操作。其他Windows/Presence/远端操作任务期间新增的改动均保留。
- 总耗时约13分6秒，包含旧环境/新Rust边界确认、实际对齐微调、主题/输入和状态交互验证；功能源码完成，真实安装版或三平台发行未纳入此次局部UI任务。
