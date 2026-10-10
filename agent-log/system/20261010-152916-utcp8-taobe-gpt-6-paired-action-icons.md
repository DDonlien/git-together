# H5操作图标方向配对

## 用户原始 prompt

push 和 pull 应该用对称的图标（下、上箭头）getlatest 和 submit 应该用对称的图标（俩云+箭头）

## 执行元信息

- 模型：gpt-6；环境只暴露此具体可得标识。
- 工作目录：/Users/taobe/Projects/GitHub/Personal/git-together/codex-standalone-ts。
- 启动分支/提交：main / 95527b84055ffe54bf7032ec8fed8f27d9ca5ea7。
- 首次工具时钟：2026-10-10 15:26:42 UTC+8。
- 结束时间：2026-10-10 15:29:16 UTC+8。
- 需求：IMPORT-14-grouped-icons，归属IMPORT-14-grouped-actions。
- 不提交、不推送、不构建、不打包、不发布。

## 范围与行动

延续当前4186独立H5图标纠正，不扩展到生产分组/Git执行。先检查工作区与当前映射，保留大量并发任务的源代码修改。AGENTS源模板版本仍为v1.9.1-260916-010202；当前工作区main和HEAD不变。Memory仅用于保持局部视觉修改和预览/源码/包的边界。

在修改前登记需求。复用现有Phosphor regular：Pull保留ArrowDownIcon，Push改为ArrowUpIcon；Get Latest保留CloudArrowDownIcon，Submit由纸飞机改为CloudArrowUpIcon。仅替换artifacts/action-groups/icons.js两项静态SVG，19px尺寸与aria-hidden保留；表头、仓库、分支共用原映射。Commit图标、五组胶囊、共享角标、零隐藏、排序和操作范围均保持。

同步DESIGN、REQUIREMENTS和预览README。当前只变更独立预览和文档，没有更改生产源码或其版本号。

## 实际观察

浏览器reload后实际页面四项SVG、可访问名称及19px尺寸与要求相符。表头五组仍为pull/latest、commit/submit、push、clean、hide；各组角标最多1个，示例仍3仓库8分支。截图paired-icons-light.jpg保存，预览已markDeliverable保留。git diff --check退出0；未新增或运行自动化测试。

本次完成的是H5视觉纠正，未更新已安装应用或接入真实Git批量执行。
