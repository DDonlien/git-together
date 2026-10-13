# Presence协作人员括号设备名称

- 用户原始prompt：「显示设备在括号里，形如：Taobe (Macbook Pro)」。
- 开始：2026-10-14T01:33:05+08:00；结束：进行中。
- 模型：gpt-6，当前环境提供的最具体标识。
- 需求：PRESENCE-05-device-name。
- 基准：main，edbdbb408d8cf09817cdbef0610335f41295cf6b，0.30.10。复用本对话干净独立main副本并正常快进；共享codex-standalone-ts的大量WIP及索引保留。

根/macOS规则、模板通用前缀、当前Presence model/AvatarGroup/managed3/Rust读取和原NAS部署已核对。设备已有服务器登记名称，但world当前只下发deviceId，UI聚合时丢弃设备信息。因此在GitPresence中仅为managed3增加服务端验证的deviceName，并在Rust/前端保留；旧1/2帧明确剔除此字段，不把任意Hello设备ID当名称。

同账号多台操作设备保持单人/单头像，匹配目标仓库及分支后去重名称，在姓名后用英文括号、顿号分隔；缺少数据时显示设备未知，不展示内部UUID。保留姓名作为头像缩写来源，设备字段纳入弹窗布局roster键。按patch从0.30.10递增0.30.11并同步权威版本镜像。

成功标准：实际登记名称沿服务器→managed3→Rust→人员聚合→弹窗传递，源码类型/Cargo/生产构建和NAS/发布校验分别通过。按本轮指令不新增或运行测试套件，不操作用户已安装应用或要求解锁；沿持续授权提交、推送并复用现有发布配置。

实现后的类型检查和生产构建实际通过，客户端locked Cargo检查也通过；仅保留既有前端500kB分包提示。NAS原gitpresence:0.6.0容器实际healthy，普通Docker入口可用；sudo -n要求密码但无需使用，未改变权限或请求密码。当前配置/数据挂载分别为只读配置和/data，后续沿原Compose更新精确源码。
