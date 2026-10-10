# Dashboard额外操作移除与表头对齐

- 用户原始 prompt：这什么鬼，移除；然后下面的标题里的文字要跟具体的按钮（按钮组居中对齐的
- 截图：codex-clipboard-254b36b4-4b86-43cd-8e29-a26631f0814c.png，筛选条右侧五组胶囊。
- 执行者：taobe；模型：gpt-6。环境只暴露该标识，未推测更细型号。
- 开始：2026-10-10 17:05:43 UTC+8；结束：2026-10-10 17:22:01 UTC+8。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts；分支main，HEAD 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7。
- 需求：IMPORT-14-header-alignment；真实列表视觉验收：IMPORT-14-header-alignment-runtime。
- 结束时无源码Commit/Push；没有新增或运行测试、真实账号/AI/Git写入、打包、发布或安装版操作。

## 上下文与判断

- 读取根及macos协作规则、现有需求/设计/架构/README和相关日志；模板source v1.9.1-260916-010202与本地一致。git fetch --prune完成，main相对origin/main ahead/behind为0/0。
- 在现有大量并行未提交改动内做局部修正，不切换分支、不新建worktree、不重置/暂存其他对话工作。
- 用户否定的是上一轮新增在Dashboard筛选条内的全页批量入口；保留仓库/分支行操作和仓库页右上角既有操作。
- 调整前真实网页有1个GitHub账号、38仓库、0关联。旧表头文字中心与行内胶囊中心错位：远端1096/1007，本地1146/1136，待提交1191/1079，隐藏1226/1220（1280×720视口）。此记录来自修正前DOM测量，不能作为修正后验收。

## 实施

- 先登记IMPORT-14-header-alignment，再修改Dashboard.tsx：删除dashboard-batch-actions整段和其独占openBatchAction、allFilteredHidden、toggleFilteredHidden。保留行操作、实际弹窗、筛选、排序和共享数量来源。
- 表头顺序按胶囊布局改为远端内容、待提交、本地内容、隐藏；使用data-signal对应Pull/Get Latest、Commit/Submit、Push和第五槽隐藏。第四槽留给无标题的Clean。
- styles.css用同一组按钮尺寸/组内留白/组内间距/组间距变量生成双按钮64px与单按钮34px；表头五槽为64/64/34/34/34px，间距8px。按钮原尺寸28px、组内留白3px、组内间距2px保持。th/td操作单元格均为左16px、右4px。
- 标题文字单独居中；数量角标和活动排序箭头绝对定位，不参与标签宽度，不推移标题文字中心。保留数量排序逻辑、角标条件和无标题的Clean行内按钮。
- 精准更新REQUIREMENTS、DESIGN、ARCHITECTURE与README，覆盖旧Dashboard全页入口说明；保留并行Submit可编辑说明、草稿等契约和源码。
- 开始时版本0.20.0；并行Submit可编辑实现先递增到0.20.1。依项目版本规则，本轮UI修复进一步递增patch到0.20.2；package.json为权威来源，package-lock根两处同步，对外README同步。

## 运行与验证边界

- npm run check和npm run build先在并行0.20.1通过，再在最终0.20.2通过；生产构建180模块，git diff --check通过。没有新增或运行测试。
- 修正期间另一个任务修改package.json，Vite于17:10:01自动重启；其日志20261010-170025-utcp8-taobe-gpt-6-submit-editable-production.md记录17:10:50统一入口重新启动，版本0.20.1、instanceId=6482c71e-b10f-4454-9c82-b7dea809dabb。新Catalog为0账号/0仓库/0关联；本轮UI代码修改没有先主动重启或重放凭据。
- 递增0.20.2前确认Catalog仍为0账号/0仓库/0关联，已向用户说明版本更新及重连影响。按持续自动就绪授权停止已确认本项目dev.ts PID48810，重新npm run dev，会话98364保持运行。
- 最终4173主账号服务与4174授权助手均0.20.2；主instanceId=61322f0c-083f-4da4-b8c5-6b45ea05280a，助手configured=true，已恢复既有系统加密应用配置。没有读取、输出或重放用户凭据；普通账号登录仍需用户完成。
- 使用Browser skill与同一已绑定浏览器，在4173独立临时页读取实际DOM与CSS。确认页面加载新五槽grid规则，根变量28px/3px/2px/8px。空账号页面正常显示「先连接你的账号」，额外toolbar DOM数0；由于无实际列表，不能把该0计数或CSS加载冒称修正后的行内对齐已实测。
- 浏览器日志保留17:18:16服务重启期间「本地日志服务不可用」warn；没有新error。截图artifacts/header-alignment/preview-empty-account.png只记录空账号状态，不作表头视觉验收。检查后关闭本轮创建的临时tab8，保留用户既有页和dev服务。
- IMPORT-14-header-alignment记录源码交付；IMPORT-14-header-alignment-runtime保持未完成，待正常账号重连后的真实列表观察。源码、运行视觉、安装版证据分开。
