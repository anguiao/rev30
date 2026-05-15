# System Options Design

## 背景

系统用户、部门、角色和权限资源已经具备完整的管理列表、详情、树和 CRUD API。现有接口面向管理页：

- 用户和角色列表分页，并返回管理页需要的完整字段或统计字段。
- 部门和资源树返回完整业务字段，用于管理页面展示和编辑。

表单里的选择器和树选择器不需要这些完整字段，也不适合依赖分页列表。当前用户表单用
`listRoles({ page: 1, pageSize: 100 })` 加载角色选项，角色表单和用户表单直接用完整树接口加载资源或部门。
这会把管理列表的字段、分页约束和选择器场景耦合在一起。

本轮新增轻量 options API，专门服务 select、tree select、权限树勾选等不需要完整字段且不分页的场景。

## 目标

1. 为用户、角色、部门和资源提供轻量 options 查询接口。
2. 用户和角色 options 返回扁平数组；部门和资源 options 返回服务端组装好的树。
3. Options 默认只返回未删除且启用的数据。
4. 支持 `includeIds` 查询参数，用于编辑回显已关联但当前禁用的数据。
5. 部门和资源树在包含禁用节点时补齐必要祖先节点，保证前端树路径完整。
6. 响应 schema 从已有完整业务 schema 派生，避免校验规则漂移。
7. 前端请求 helper 使用 shared schema 解析响应，前端 UI 自行把业务字段转换为 `label`、`value`、`disabled`。
8. 现有前端表单中用于选择器或树选择器的数据来源切换到轻量 options API。

## 非目标

本轮不实现：

- 远程搜索、分页 options、按关键字筛选 options。
- 批量聚合接口，例如一次返回所有模块 options。
- 给 options 响应添加 `label`、`value`、`key`、`disabled` 等 UI 字段。
- 替换管理页表格或树表的数据源；管理页仍使用完整列表或完整树接口。
- 改变现有完整列表、完整树、详情和 CRUD API 行为。
- 为禁用选项定义统一 UI 展示样式。

## API 设计

新增接口：

- `GET /api/system/users/options`
- `GET /api/system/roles/options`
- `GET /api/system/departments/options/tree`
- `GET /api/system/resources/options/tree`

权限沿用各模块列表权限：

- 用户：`system:user:list`
- 角色：`system:role:list`
- 部门：`system:department:list`
- 资源：`system:resource:list`

Options 虽然字段更轻量，但仍然是在读取对应系统资源。权限不因为“创建或编辑另一个资源时需要选择它”
而放宽。对应影响与现有完整接口保持一致：

- 新增或编辑用户时，如果要选择部门和角色，需要 `system:department:list` 和 `system:role:list`。
- 新增或编辑角色时，如果要选择资源，需要 `system:resource:list`。
- 新增或编辑部门时，如果要选择上级部门，需要 `system:department:list`。
- 新增或编辑资源时，如果要选择上级资源，需要 `system:resource:list`。

四个接口都支持同一查询参数：

```ts
includeIds?: string
```

URL 中使用逗号分隔 UUID：

```text
GET /api/system/roles/options?includeIds=id1,id2
```

解析后类型为：

```ts
{
  includeIds: string[]
}
```

未传、空字符串或只包含空白时解析为 `[]`。重复 ID 去重。返回结果按模块现有业务排序，不按
`includeIds` 输入顺序排序。

## 过滤和回显规则

默认结果：

- 只返回 `deletedAt IS NULL`。
- 只返回 `status = enabled`。

带 `includeIds` 时：

- 返回默认启用数据，加上 `includeIds` 命中的未删除数据。
- `includeIds` 中不存在或已删除的数据不返回。
- `includeIds` 命中的禁用数据仍保留原始 `status`，由前端决定如何展示和禁用。
- 用户和角色返回扁平数组。
- 部门和资源返回树。

部门和资源树的祖先补齐规则：

- 如果一个 `includeIds` 命中的节点本身是禁用的，它需要出现在树中。
- 如果该节点的祖先不在默认启用结果中，后端也要补齐这些未删除祖先。
- 补齐的祖先保留真实 `status`。
- 已删除祖先不会补齐；这种数据状态下节点可能无法挂入根树，返回时只包含可组成树的节点。

该规则保证常见编辑场景能显示完整路径：例如用户已关联一个禁用子部门，部门树会返回该子部门及其必要父级。

## Shared Schema 设计

响应 schema 必须从已有完整 schema 派生。

### 用户

```ts
export const userOptionSchema = userSchema.pick({
  id: true,
  username: true,
  nickname: true,
  status: true,
})

export const userOptionsResponseSchema = userOptionSchema.array()
```

类型：

```ts
export type UserOption = z.infer<typeof userOptionSchema>
export type UserOptionsResponse = z.infer<typeof userOptionsResponseSchema>
```

### 角色

```ts
export const roleOptionSchema = roleSchema.pick({
  id: true,
  name: true,
  code: true,
  status: true,
})

export const roleOptionsResponseSchema = roleOptionSchema.array()
```

类型：

```ts
export type RoleOption = z.infer<typeof roleOptionSchema>
export type RoleOptionsResponse = z.infer<typeof roleOptionsResponseSchema>
```

### 部门树

```ts
const departmentTreeOptionBaseSchema = departmentSchema.pick({
  id: true,
  parentId: true,
  name: true,
  code: true,
  status: true,
})

export type DepartmentTreeOption = z.infer<typeof departmentTreeOptionBaseSchema> & {
  children: DepartmentTreeOption[]
}

export const departmentTreeOptionSchema: z.ZodType<DepartmentTreeOption> =
  departmentTreeOptionBaseSchema.extend({
    children: z.lazy(() => departmentTreeOptionSchema.array()),
  })

export const departmentTreeOptionsResponseSchema = departmentTreeOptionSchema.array()
```

类型：

```ts
export type DepartmentTreeOptionsResponse = z.infer<
  typeof departmentTreeOptionsResponseSchema
>
```

### 资源树

```ts
const resourceTreeOptionBaseSchema = resourceSchema.pick({
  id: true,
  parentId: true,
  type: true,
  name: true,
  code: true,
  status: true,
})

export type ResourceTreeOption = z.infer<typeof resourceTreeOptionBaseSchema> & {
  children: ResourceTreeOption[]
}

export const resourceTreeOptionSchema: z.ZodType<ResourceTreeOption> =
  resourceTreeOptionBaseSchema.extend({
    children: z.lazy(() => resourceTreeOptionSchema.array()),
  })

export const resourceTreeOptionsResponseSchema = resourceTreeOptionSchema.array()
```

类型：

```ts
export type ResourceTreeOptionsResponse = z.infer<typeof resourceTreeOptionsResponseSchema>
```

### Query Schema

每个模块定义自己的 query schema，便于使用对应 UUID 错误文案：

```ts
export const userOptionsQuerySchema = z.object({
  includeIds: includeIdsQuerySchema(userIdSchema).default([]),
})
```

部门、角色、资源分别使用自己的 ID schema。`includeIdsQuerySchema` 可以放在 shared query helpers 中，
输入接受 `undefined`、空字符串和逗号分隔字符串，输出统一为去重后的 `string[]`。

## 后端结构

每个模块在现有分层内扩展：

- `routes.ts` 新增 options 路由，静态路径放在 `/:id` 路由之前。
- `service.ts` 新增 options 方法，负责调用 repository 并映射为轻量响应。
- `repository.ts` 新增不分页查询方法。
- `mapper.ts` 新增轻量 mapper，或复用现有 mapper 后 pick 字段。

排序沿用现有模块排序：

- 用户：`createdAt DESC`、`id DESC`。
- 角色：`sortOrder ASC`、`createdAt DESC`、`id DESC`。
- 部门：`sortOrder ASC`、`createdAt DESC`、`id DESC`。
- 资源：`sortOrder ASC`、`createdAt DESC`、`id DESC`。

查询条件使用 `OR(status = enabled, id IN includeIds)`，并始终限制 `deletedAt IS NULL`。部门和资源需要额外补齐祖先。

## 前端约定

请求 helper 新增：

- `getUserOptions(query?)`
- `getRoleOptions(query?)`
- `getDepartmentTreeOptions(query?)`
- `getResourceTreeOptions(query?)`

这些方法：

- 使用 shared options response schema 解析响应。
- `includeIds` 在请求前序列化为逗号分隔字符串。
- 不把响应转换成 Naive UI option。

现有表单选项来源切换如下：

- `UserFormDrawer` 的所属部门树使用 `getDepartmentTreeOptions()`。
- `UserFormDrawer` 的角色多选使用 `getRoleOptions()`。
- `RoleFormDrawer` 的权限资源树使用 `getResourceTreeOptions()`。
- `DepartmentFormDrawer` 的上级部门树使用 `getDepartmentTreeOptions()`。
- `ResourceFormDrawer` 的上级资源树使用 `getResourceTreeOptions()`。

编辑模式需要根据详情里的当前关联 ID 传入 `includeIds`：

- 用户编辑：传入 `user.departments[].id` 和 `user.roles[].id`。
- 角色编辑：传入 `role.resources[].id`。
- 部门编辑：传入当前 `department.parentId`，并继续在前端禁用当前部门及其子树，避免循环移动。
- 资源编辑：传入当前 `resource.parentId`，并继续在前端禁用当前资源及其子树，避免循环移动。

新增模式默认不传 `includeIds`。如果是从“新增下级部门”或“新增下级资源”进入，并且页面传入了
`parentId`，则把这个 `parentId` 作为 `includeIds` 传入，保证禁用父节点也能在选择器中回显。

前端组件用业务字段决定展示：

- 用户 label 可用 `nickname (username)`。
- 角色、部门、资源 label 可用 `name (code)`。
- 是否禁用由 `status` 与“是否当前已选”共同决定。

建议 UI 策略：

- 禁用项 label 显示“已禁用”。
- 未选中的禁用项不可新增选择。
- 当前已选的禁用项仍允许移除。

## 测试设计

按 TDD 执行。

Shared schema 测试：

- options query 未传或空字符串时解析为 `includeIds: []`。
- options query 解析逗号分隔 UUID 并去重。
- options query 拒绝非法 UUID。
- user/role option response 只接受轻量字段。
- department/resource tree option response 接受递归树。
- response schema 从完整 schema 派生的字段规则继续生效。

后端 route 测试：

- 四个 options 路由注册对应 list 权限。
- 路由解析 `includeIds` 并调用 service。
- 非法 `includeIds` 返回 `400` 和 `查询参数无效`。
- 静态 options 路由不会被 `/:id` 路由吞掉。

后端 integration 测试：

- 默认 options 只返回启用且未删除数据。
- `includeIds` 可以带回禁用但未删除的数据。
- `includeIds` 不带回已删除或不存在的数据。
- 部门树 options 为树结构，并补齐禁用已选节点的祖先。
- 资源树 options 为树结构，并补齐禁用已选节点的祖先。
- 响应不包含完整管理字段，例如 `createdAt`、`updatedAt`、`sortOrder`、`path`、`resources`、`userCount`。

前端请求 helper 测试：

- 四个 helper 请求正确 endpoint。
- `includeIds` 序列化为逗号分隔字符串。
- 响应使用 shared schema 解析。
- malformed response 会被 schema 拒绝。

前端表单测试：

- 用户表单使用部门树 options 和角色 options，不再调用完整部门树或分页角色列表作为选项来源。
- 用户编辑时把当前部门和角色 ID 作为 `includeIds` 传给 options helper。
- 角色表单使用资源树 options，不再调用完整资源树作为授权选项来源。
- 角色编辑时把当前资源 ID 作为 `includeIds` 传给资源树 options helper。
- 部门表单使用部门树 options 作为上级部门来源，并在编辑时包含当前上级部门 ID。
- 资源表单使用资源树 options 作为上级资源来源，并在编辑时包含当前上级资源 ID。

## 验证命令

实现完成后至少运行：

```bash
pnpm --filter @rev30/shared test -- system
pnpm --filter @rev30/server test -- system
pnpm --filter @rev30/client test -- requests
pnpm typecheck
```

最终运行：

```bash
pnpm check
```
