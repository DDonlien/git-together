# TypeScript 客户端架构

React 客户端由 App shell、Dashboard、Repository、Details 和场景导航组成。`domain.ts` 是数据模型和纯业务变更函数；`data.ts` 提供线框演示数据；`use-workspace.ts` 管理异步操作、本地存储和可取消任务；UI 组件消费这些状态。

`ui.tsx` 是 OpenGlass UI 的薄适配层，统一按钮、字段、分段选择、菜单、弹窗和开关契约；`theme.ts` 管理公共令牌。App shell 只有一个共享窗口 canvas，CSS 区分全局悬浮导航与右侧平面内容组。布局/材料不改变选择、表单或业务结果。批量内容工具栏通过公开 style 关闭 elevation，不让库默认材料重新引入立体外壳。

Repository 包含真实语义的 Branch/Worktree 区别。演示 worktree 持有文件变化、待提交选择、draft 和 commit 历史；没有 worktree 的分支没有文件操作。父仓库选择解析为已有工作目录的去重集合。

业务数据保存在版本化的 localStorage key 中。运行中和错误等瞬时状态不作为业务事实保存；刷新时不把中断的动作误报为成功。提交创建一个演示 commit，改变该 worktree 的文件变化与 ahead，不涉及真实仓库。

场景初始化保存 `lastScene`，同场景刷新只恢复视图，不覆盖已保存的业务数据。显式切换场景恢复相应 fixture 并递增任务 generation；中断的异步结果不能写入新场景或清除新任务的 busy 状态。读取存储时验证嵌套仓库、工作目录、文件、历史与偏好结构。

Electron main/preload 通过有限的桥接口提供窗口按钮、系统主题和原生 Liquid Glass 检测，不开放 Node.js 给 renderer。预览与桌面使用相同 React/TS 代码。原生玻璃依赖第三方插件的系统视图；CSS/React 玻璃是浏览器材料实现，不声称属于 AppKit 控件。

当前没有网络业务后端，不扫描、暂存、修改或推送用户仓库，不读取账号凭据。未来 Git 适配器必须单独定义 Git CLI/LFS 合同。
