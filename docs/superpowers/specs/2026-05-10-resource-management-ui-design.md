# 资源管理前端闭环设计

## 背景

资源模块的共享 schema、数据库表、后端 CRUD API 和资源树列表页已经存在。当前缺口集中在前端：
资源管理页可以查看、筛选资源树，也已经露出新增、编辑、删除按钮，但这些操作尚未接入真实行为。

部门、角色、用户管理已经形成稳定交互模式：页面负责查询、打开抽屉、删除确认和刷新；表单抽屉负责
加载详情、前端校验、提交 mutation、展示服务端字段错误并在保存成功后关闭。本次资源管理闭环沿用
这套模式，不引入新的表单框架或复杂交互。

## 目标

1. 资源管理页支持新增根资源、新增下级资源、编辑资源和删除资源。
2. 资源表单覆盖目录、内部菜单、外链菜单和操作权限点四种类型。
3. 资源表单使用树选择器选择上级资源，编辑时禁用当前资源及其所有下级资源，避免循环层级。
4. 图标字段使用普通文本输入，支持 `lucide:users` 这类 Iconify 图标名，并在输入框右侧展示内联预览。
5. 图标选择器列入下一步计划，本次不实现搜索、弹窗选择或图标库浏览。
6. 请求 helper 补齐资源详情、新增、更新和删除方法，并继续复用共享 zod schema 校验响应。
7. 保存或删除成功后刷新资源树，并给出成功提示；失败时展示稳定错误信息。
8. 用测试覆盖用户可见行为和请求封装，完成后通过项目验证。

## 非目标

本次不实现图标选择器、拖拽排序、批量排序、批量删除、导入导出、资源恢复、审计日志、权限继承、
路由自动生成或角色授权改造。

排序继续使用现有 `sortOrder` 数字字段。移动资源只通过编辑表单修改上级资源完成。

## 用户体验

资源管理页保留现有树表、关键字筛选、类型筛选、状态筛选和展开逻辑。

页面右上角“新增资源”打开抽屉，默认创建根目录资源：

- `type` 默认为目录。
- `name` 为空。
- `code` 为空。
- `parentId` 为 `null`。
- `path`、`externalUrl`、`icon` 为空。
- `openTarget` 默认为当前窗口。
- `hidden` 默认否。
- `status` 默认启用。
- `sortOrder` 默认 `0`。

行内“新增下级”打开同一个抽屉，默认把当前行作为上级资源。只有目录和内部菜单允许显示“新增下级”
按钮，保持现有页面判断。

行内“编辑”打开同一个抽屉，加载资源详情和资源树。上级资源选择器默认选中当前资源的 `parentId`。
当前资源自身和它的所有下级资源在上级资源选择器中禁用，避免形成循环。

行内“删除”在当前资源存在下级资源时保持可见但禁用。没有下级资源时，点击“删除”弹出确认框。
确认后调用删除接口。若后端因为关联角色授权或并发新增下级资源返回冲突，页面展示后端错误消息。

图标输入使用 `lucide:users` 这类 Iconify 图标名。输入框右侧有固定宽度预览区域：

- 输入为空时显示淡色“无”。
- 输入非空时使用 `@iconify/vue` 的 `Icon` 组件渲染预览。
- 格式不合法时，由现有 zod 校验在字段下方展示“图标名称无效”。

## 前端结构

资源树选择器复用 `apps/client/src/utils/ui.ts` 中已有的 `toTreeOptions`。

复用方式：

- 传入 `ResourceTreeNode[]`，直接转换成 Naive UI `NTreeSelect` options。
- 使用 `label` 配置生成 `资源名称 (资源编码)` 标签。
- 编辑资源时传入 `disabledSubtreeId`，禁用当前资源自身和所有下级资源。
- 不新增专用 `resourceOptions.ts`，避免和部门、角色已有树选项工具重复。

新增 `apps/client/src/features/system/ResourceFormDrawer.vue`。

职责：

- 接收 `resourceId: string | null` 和 `parentId: string | null`。
- `resourceId === null` 时为新增模式；否则为编辑模式。
- 使用 `useQuery` 在抽屉显示时加载资源树，编辑模式额外加载资源详情。
- 使用 `useForm` 和 `resourceFormSchema` 做提交校验。
- 新增提交调用 `createResource(resourceCreateSchema.parse(value))`。
- 编辑提交调用 `updateResource(resourceId, resourceUpdateSchema.parse(value))`。
- 服务端返回字段错误时通过 `setServerFieldError` 显示在对应字段。
- 保存成功后触发 `saved` 事件并关闭抽屉。

表单字段：

- 资源类型：`NSelect`，包含目录、菜单、外链和操作。
- 资源名称：`NInput`。
- 资源编码：`NInput`。
- 上级资源：`NTreeSelect`，支持搜索、清空和默认展开。
- 内部路径：`NInput`，菜单类型显示。
- 外链地址：`NInput`，外链类型显示。
- 打开方式：`NSelect`，菜单和外链类型显示。
- 图标：`NInput` + 右侧内联 `Icon` 预览。
- 隐藏：`NSwitch`。
- 状态：`NSelect`。
- 排序：`NInputNumber`。

修改 `apps/client/src/pages/index/system/resources.vue`。

职责：

- 维护抽屉显示状态、正在编辑的资源 ID、预选上级资源 ID。
- 顶部新增按钮打开新增根资源。
- 行内新增下级按钮传入当前资源 ID 作为 `parentId`。
- 行内编辑按钮传入当前资源 ID。
- 行内删除按钮在资源存在子节点时禁用，否则弹确认框并调用 `deleteResource`。
- 保存或删除成功后调用 `refetch` 刷新树。
- 成功提示分别为“保存资源成功”和“删除资源成功”。

修改 `apps/client/src/features/system/requests.ts`：

- 增加 `getResource(id)`。
- 增加 `createResource(input)`。
- 增加 `updateResource(id, input)`。
- 增加 `deleteResource(id)`。
- 继续使用 `resourceSchema` 解析详情、新增和更新响应。
- 删除接口成功时返回 `void`，失败时抛 `SystemRequestError`。

## 权限

沿用现有访问码：

- 查看树和加载表单树：`system:resource:list`。
- 新增和新增下级：`system:resource:create`。
- 编辑：`system:resource:update`。
- 删除：`system:resource:delete`。

资源页顶部新增按钮继续使用 `v-can="'system:resource:create'"`。行内操作继续使用
`renderTableActionButton` 的 `accessCode` 控制显示。编辑表单需要加载详情和资源树，因此编辑按钮需要
同时满足 `system:resource:update` 和 `system:resource:list`。

## 错误处理

前端不新增宽泛 try/catch。页面边界只处理 mutation 抛出的 `SystemRequestError`：

- 表单保存失败时展示字段错误或顶部错误。
- 删除失败时展示消息提示。
- 查询失败时沿用页面已有 `NAlert`。

图标预览不做远程存在性校验；格式由共享 schema 保证，图标是否存在由 Iconify 运行时按现有方式处理。

## 测试设计

请求 helper 测试：

- `getResource` 解析资源详情响应并请求 `/api/system/resources/:id`。
- `createResource` 发送 `POST /api/system/resources` 并解析资源响应。
- `updateResource` 发送 `PATCH /api/system/resources/:id` 并解析资源响应。
- `deleteResource` 发送 `DELETE /api/system/resources/:id`，`204` 时返回 `void`。

资源 options 测试：

- 树节点转换为 `资源名称 (资源编码)` 标签和树结构。
- 编辑资源时当前资源和所有下级资源被禁用。

资源表单测试：

- 新增根资源时加载资源树，提交默认目录资源。
- 新增下级资源时预选传入的上级资源 ID。
- 编辑资源时加载详情，上级资源选择器显示当前上级资源。
- 类型切换时只提交对应类型需要的路径字段。
- 图标输入右侧显示 Iconify 预览。
- 服务端返回字段错误时在对应字段展示。

资源页面测试：

- 点击“新增资源”打开新增抽屉。
- 点击“新增下级”打开抽屉并传入当前行作为上级资源。
- 点击“编辑”打开编辑抽屉。
- 保存成功后提示并刷新资源树。
- 有下级资源的行内删除按钮保持可见但禁用。
- 删除确认成功后调用删除接口、提示并刷新资源树。
- 删除失败时显示后端错误消息。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/client test -- requests
pnpm --filter @rev30/client test -- ResourceFormDrawer
pnpm --filter @rev30/client test -- resources
pnpm check
```
