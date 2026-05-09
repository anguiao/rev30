# Department Management Completion Design

## 背景

部门模块的数据库、共享 schema、后端 CRUD API 和基础树表页已经存在。当前缺口主要在前端交互：
部门管理页只能查看和筛选树表，新增、编辑、新增下级、删除按钮还没有接入真实行为。

用户管理与角色管理已经形成稳定模式：页面负责查询、打开抽屉、删除确认和刷新；表单抽屉负责加载详情、
本地校验、提交 mutation、展示服务端字段错误并在保存成功后关闭。本次部门管理闭环应沿用这套模式，
避免引入新的交互框架。

## 目标

1. 部门管理页支持新增顶级部门、新增下级部门、编辑部门和删除部门。
2. 部门表单使用 `NTreeSelect` 选择上级部门，支持搜索、清空和禁用非法上级。
3. 用户表单中的所属部门同步从 `NTree` 调整为多选 `NTreeSelect`，与部门表单保持一致体验。
4. 请求 helper 补齐部门详情、新增、更新和删除方法，并继续复用共享 zod schema 校验响应。
5. 保存或删除成功后刷新部门树，并给出成功提示；失败时展示稳定错误信息。
6. 部门编码唯一冲突返回字段级错误，表单可以落到 `code` 字段上展示。
7. 用测试覆盖用户可见行为和请求封装，完成后通过项目验证。

## 非目标

本次不实现拖拽排序、批量排序、跨层级拖拽移动、批量删除、导入导出、部门负责人、部门成员列表、
审计日志、部门恢复、软删除后编码释放或复杂权限继承。

排序只保留现有 `sortOrder` 数字字段。移动部门只通过编辑表单修改上级部门完成。

## 用户体验

部门管理页保留现有树表、关键字筛选、状态筛选和展开逻辑。

页面右上角“新增部门”打开抽屉，默认创建顶级部门：

- `name` 为空。
- `code` 为空。
- `parentId` 为 `null`。
- `status` 默认启用。
- `sortOrder` 默认 `0`。

行内“新增下级”打开同一个抽屉，默认把当前行作为上级部门。用户仍可改成其它合法上级部门或清空为顶级部门。

行内“编辑”打开同一个抽屉，加载部门详情和部门树。上级部门选择器默认选中当前部门的 `parentId`。
当前部门自身和它的所有下级部门在上级部门选择器中禁用，避免形成循环。

行内“删除”在当前部门存在下级部门时保持可见但禁用，避免用户发起必然失败的删除请求。没有下级部门时，
点击“删除”弹出确认框，用户确认后调用删除接口。若后端因为存在关联用户或并发新增下级部门返回冲突，
页面展示后端错误消息。

用户表单中的“所属部门”改为多选下拉树：

- 使用同一棵部门树数据。
- 支持搜索和清空。
- 支持多选、勾选框和级联选择。
- 标签数量使用响应式折叠，避免多个部门撑高抽屉。

## 前端结构

新增 `apps/client/src/features/system/DepartmentFormDrawer.vue`。

职责：

- 接收 `departmentId: string | null` 和 `parentId: string | null`。
- `departmentId === null` 时为新增模式；否则为编辑模式。
- 使用 `useQuery` 在抽屉显示时加载部门树，编辑模式额外加载部门详情。
- 使用 `useForm` 和 `departmentFormSchema` 做提交校验。
- 新增提交调用 `createDepartment(departmentCreateSchema.parse(value))`。
- 编辑提交调用 `updateDepartment(departmentId, departmentUpdateSchema.parse(value))`。
- 服务端返回字段错误时通过 `setServerFieldError` 显示在对应字段。
- 保存成功后触发 `saved` 事件并关闭抽屉。

上级部门选择器使用 `NTreeSelect`：

- 单选。
- `clearable`。
- `filterable`。
- `default-expand-all`。
- 选项 label 为 `部门名称 (部门编码)`。
- 编辑当前部门时禁用当前部门自身和所有下级部门。

修改 `apps/client/src/pages/index/system/departments.vue`。

职责：

- 维护抽屉显示状态、正在编辑的部门 ID、预选上级部门 ID。
- 顶部新增按钮打开新增顶级部门。
- 行内新增下级按钮传入当前部门 ID 作为 `parentId`。
- 行内编辑按钮传入当前部门 ID。
- 行内删除按钮在 `department.children.length > 0` 时禁用，否则弹确认框并调用 `deleteDepartment`。
- 保存或删除成功后调用 `refetch` 刷新树。
- 成功提示分别为“保存部门成功”和“删除部门成功”。

修改 `apps/client/src/features/system/UserFormDrawer.vue`。

职责：

- 将所属部门字段从 `NTree` 改为 `NTreeSelect`。
- 保持 `departmentIds` 表单值类型为 `string[]`。
- 保持现有用户创建、编辑 payload 不变。
- 部门 options 转换逻辑与部门表单保持一致。

新增 `apps/client/src/features/system/departmentOptions.ts` 作为轻量 helper。该 helper 只负责把
`DepartmentTreeNode[]` 转换成 Naive UI 的树选择 options，以及在编辑部门时标记禁用节点。

修改 `apps/client/src/utils/ui.ts`，让 `renderTableActionButton` 支持透传 `disabled`。该能力先服务于
部门删除按钮，后续其它表格操作也可复用。

## 请求和后端

修改 `apps/client/src/features/system/requests.ts`：

- 增加 `getDepartment(id)`。
- 增加 `createDepartment(input)`。
- 增加 `updateDepartment(id, input)`。
- 增加 `deleteDepartment(id)`。
- 继续使用 `departmentSchema` 解析详情、新增和更新响应。
- 删除接口成功时返回 `void`，失败时抛 `SystemRequestError`。

后端现有部门路由已经具备详情、新增、更新和删除能力。本次只做一项小增强：

- `DepartmentConflictError` 返回 `{ field: 'code', message: '部门编码已存在' }`。

这样部门表单与用户、角色表单一样，可以把唯一冲突落到具体字段。其它错误保持现有消息：

- 上级部门不存在：`400`。
- 部门不存在：`404`。
- 移动到自己或自己的下级部门下：`409`。
- 删除存在子部门或关联用户的部门：`409`。

## 权限

沿用现有访问码：

- 查看树和加载表单树：`system:department:list`。
- 新增和新增下级：`system:department:create`。
- 编辑：`system:department:update`。
- 删除：`system:department:delete`。

部门页顶部新增按钮继续使用 `v-can="'system:department:create'"`。行内操作继续使用 `renderTableActionButton`
的 `accessCode` 控制显示。编辑表单需要加载详情和部门树，因此编辑按钮需要同时满足
`system:department:update` 和 `system:department:list`。

## 测试设计

按 TDD 执行，先写失败测试，再写实现。

请求 helper 测试：

- `getDepartment` 解析部门详情响应并请求 `/api/system/departments/:id`。
- `createDepartment` 发送 `POST /api/system/departments` 并解析部门响应。
- `updateDepartment` 发送 `PATCH /api/system/departments/:id` 并解析部门响应。
- `deleteDepartment` 发送 `DELETE /api/system/departments/:id`，`204` 时返回 `void`。
- 部门编码冲突响应中的 `field: 'code'` 被解析到 `SystemRequestError.field`。

部门表单测试：

- 新增顶级部门时加载部门树，提交默认 `parentId: null`、启用状态和排序值。
- 新增下级部门时预选传入的上级部门 ID。
- 编辑部门时加载详情，上级部门选择器显示当前上级部门。
- 编辑部门时当前部门自身和所有下级部门被禁用。
- 服务端返回 `field: 'code'` 时在部门编码字段展示错误。
- 抽屉在切换部门或保存响应过期时不应用陈旧结果。

部门页面测试：

- 点击“新增部门”打开新增抽屉。
- 点击“新增下级”打开抽屉并传入当前行作为上级部门。
- 点击“编辑”打开编辑抽屉。
- 保存成功后提示并刷新部门树。
- 有下级部门的行内删除按钮保持可见但禁用，点击不会打开确认框或调用删除接口。
- 删除确认成功后调用删除接口、提示并刷新部门树。
- 删除失败时显示后端错误消息且不刷新为成功状态。

用户表单测试：

- 所属部门字段使用 `NTreeSelect`。
- 多选部门后创建和编辑用户 payload 中的 `departmentIds` 不变。
- 部门 options 保持 `部门名称 (部门编码)` 标签和树结构。

后端测试：

- 部门编码冲突响应包含 `field: 'code'`。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/client test -- departments
pnpm --filter @rev30/client test -- UserFormDrawer
pnpm --filter @rev30/client test -- requests
pnpm --filter @rev30/server test -- departments
pnpm check
```
