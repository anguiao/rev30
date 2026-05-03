# Departments Design

## 背景

当前项目已有 `system/users` 后端模块，使用 Hono、Drizzle、PGlite/PostgreSQL
和共享 zod schema。`/api/system/*` 已通过 Bearer token 中间件保护，用户模块
已经按 `routes/service/repository/mapper/errors` 拆分。

部门模块需要支持树状组织结构，并且一个用户可以属于多个部门。第一版应继续沿用
现有系统模块风格：后端 API 先落地，前端页面不在本次范围内；共享 schema 放在
`packages/shared`，数据库结构放在 `apps/server/src/db/schema.ts` 和 SQL 迁移中。

## 目标

1. 新增数据库支持的部门模块，挂载在 `/api/system/departments`。
2. 部门支持树状结构、列表、树查询、详情、新增、更新和软删除。
3. 用户和部门支持多对多关联。
4. 用户创建和更新接口支持传入 `departmentIds`。
5. 所有用户信息响应返回用户关联的部门摘要。
6. 删除部门时，如果存在未删除子部门或用户关联，返回 `409` 并拒绝删除。
7. 认证注册、登录、刷新和登录态恢复使用同一套带部门摘要的 `User` 结构。

## 非目标

第一版不实现前端部门管理页面、角色权限、岗位、部门负责人、部门恢复、审计日志、
批量导入导出、拖拽排序、跨部门权限继承或历史成员关系查询。

部门树只表达当前组织结构，不实现多租户隔离或复杂路径缓存。用户部门关联只表达当前
归属关系，不作为审计记录保存。

## 数据模型

新增 `departments` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `parent_id` | uuid | 可空，指向父部门 |
| `name` | text | 部门名称，必填 |
| `code` | text | 部门编码，必填，全表唯一 |
| `status` | smallint | `1=启用`，`0=禁用` |
| `sort_order` | integer | 同级排序值，默认 `0` |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp | 删除时间，可空 |

索引和约束：

- `departments_code_unique` 唯一约束覆盖全表，软删除后 `code` 仍继续占用。
- `departments_parent_id_idx` 支持查询子部门。
- `departments_status_idx` 支持按状态过滤。

新增 `user_departments` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | 指向 `users.id` |
| `department_id` | uuid | 指向 `departments.id` |
| `created_at` | timestamp | 关联创建时间 |

索引和约束：

- `(user_id, department_id)` 为组合主键，避免重复关联。
- `user_departments_department_id_idx` 支持反查部门成员。

用户软删除时同步删除该用户的 `user_departments` 关联。这样关联表只保存当前有效用户
归属，部门删除时只需要检查关联表即可判断是否还有用户占用该部门。

## 共享 Schema

升级现有基础 `userSchema` 和 `User` 类型，使所有用户信息都包含
`departments` 部门摘要数组。没有部门的用户返回空数组。

新增部门 schema 和类型：

- `DEPARTMENT_STATUS_ENABLED = 1`
- `DEPARTMENT_STATUS_DISABLED = 0`
- `departmentStatusSchema`
- `departmentSchema`
- `departmentSummarySchema`
- `departmentTreeNodeSchema`
- `departmentListQuerySchema`
- `departmentCreateSchema`
- `departmentUpdateSchema`
- `departmentListResponseSchema`

扩展系统用户 schema：

- `userDepartmentSchema`：用户响应中的部门摘要，包含 `id`、`name`、`code`。
- `userSchema`：现有用户字段加 `departments: userDepartmentSchema[]`。
- `userListResponseSchema` 的 `list` 使用带部门摘要的 `userSchema`。
- `userCreateSchema` 支持 `departmentIds?: string[]`。
- `userUpdateSchema` 支持 `departmentIds?: string[]`；字段省略表示不修改部门，传空数组表示清空部门。

`authTokenResponseSchema` 继续引用 `userSchema`，因此注册、登录、刷新和 `me`
响应中的用户信息也必须携带 `departments`。认证中间件写入的 `currentUser`
同样使用这套结构。

`departmentIds` 必须是 UUID 数组，数组内不能重复。部门是否存在、是否已删除由服务端业务层校验。

## 路由结构

新增部门路由挂载到现有系统路由：

- `apps/server/src/modules/system/departments/routes.ts`
- `apps/server/src/modules/system/departments/service.ts`
- `apps/server/src/modules/system/departments/repository.ts`
- `apps/server/src/modules/system/departments/mapper.ts`
- `apps/server/src/modules/system/departments/errors.ts`

`apps/server/src/modules/system/routes.ts` 挂载：

- `/users`
- `/departments`

所有 `/api/system/departments/*` 路由继承现有 `/api/system/*` 认证保护。

## 部门 API

### `GET /api/system/departments`

查询参数：

- `page`：默认 `1`
- `pageSize`：默认 `20`，最大 `100`
- `keyword`：可选，匹配 `name` 和 `code`
- `status`：可选，只接受 `0` 或 `1`
- `parentId`：可选，筛选直接子部门

行为：

- 默认只返回 `deleted_at IS NULL` 的部门。
- 返回 `{ list, total, page, pageSize }`。
- 排序按 `sortOrder ASC`、`createdAt DESC`、`id DESC`。

### `GET /api/system/departments/tree`

行为：

- 返回未删除部门组成的树。
- 根节点为 `parent_id IS NULL` 的部门。
- 每个节点包含基础部门字段和 `children`。
- 同级排序按 `sortOrder ASC`、`createdAt DESC`、`id DESC`。

### `GET /api/system/departments/:id`

行为：

- 返回未删除部门详情。
- 部门不存在或已软删除时返回 `404`。

### `POST /api/system/departments`

请求字段：

- `name`：必填
- `code`：必填
- `parentId`：可选，默认为 `null`
- `status`：可选，默认 `1`
- `sortOrder`：可选，默认 `0`

行为：

- `parentId` 非空时，父部门必须存在且未删除，否则返回 `400`。
- `code` 与任何现有部门冲突时返回 `409`。
- 创建成功返回部门详情。

### `PATCH /api/system/departments/:id`

可更新字段：

- `name`
- `code`
- `parentId`
- `status`
- `sortOrder`

行为：

- 至少修改一个字段。
- 部门不存在或已软删除时返回 `404`。
- `parentId` 非空时，父部门必须存在且未删除。
- 禁止将部门挂到自己或自己的子孙部门下，违反时返回 `409`。
- `code` 唯一冲突返回 `409`。
- 更新成功刷新 `updated_at` 并返回部门详情。

### `DELETE /api/system/departments/:id`

行为：

- 部门不存在或已软删除时返回 `404`。
- 如果存在未删除直接子部门，返回 `409`。
- 如果存在任何 `user_departments` 关联，返回 `409`。
- 满足删除条件时设置 `deleted_at`，刷新 `updated_at`，返回 `204`。
- 不物理删除部门记录，且不改变 `status` 语义。

## 用户 API 扩展

`POST /api/system/users` 新增可选字段：

- `departmentIds?: string[]`

行为：

- 省略 `departmentIds` 表示用户无部门关联。
- 传入部门 ID 必须全部存在且未删除，否则返回 `400`。
- 创建用户和写入部门关联在同一事务中完成。

`PATCH /api/system/users/:id` 新增可选字段：

- `departmentIds?: string[]`

行为：

- 省略 `departmentIds` 表示不修改用户部门。
- 传空数组表示清空用户部门。
- 传入部门 ID 必须全部存在且未删除，否则返回 `400`。
- 更新用户字段和替换部门关联在同一事务中完成。

用户信息响应统一包含：

```json
{
  "id": "user-uuid",
  "username": "ada",
  "nickname": "Ada Lovelace",
  "departments": [
    {
      "id": "uuid",
      "name": "Engineering",
      "code": "engineering"
    }
  ]
}
```

用户列表和详情只返回未删除用户；关联部门只返回未删除部门。用户软删除会清理该用户的
部门关联。

认证注册创建的新用户默认没有部门，响应中的 `departments` 为 `[]`。登录、刷新和
`me` 接口会读取当前用户的部门关联并返回部门摘要。

## 错误处理

沿用当前系统用户模块的错误风格，只在系统边界做必要校验：

- 请求参数、请求体格式不合法返回 `400`。
- 请求引用不存在或已删除的父部门、部门 ID 返回 `400`。
- 部门或用户不存在返回 `404`。
- 部门编码唯一冲突、非法移动、删除受阻返回 `409`。

不增加宽泛 try/catch，不在业务层吞掉未知数据库错误。唯一约束由数据库作为最终保护，
业务层只把已知约束错误转换为稳定响应。

## 测试设计

按 TDD 执行，先写失败测试再写实现。

共享包测试：

- 部门 schema 接受合法部门、树节点和分页查询。
- 部门状态只接受 `0` 和 `1`。
- 部门创建默认启用，默认 `parentId=null` 和 `sortOrder=0`。
- `userSchema` 要求用户信息携带 `departments`，并接受空数组。
- 用户创建和更新 schema 接受 `departmentIds`，并拒绝重复 ID。

服务端测试：

- 部门创建会真实写入数据库。
- 部门列表支持分页、关键字、状态和父部门过滤。
- 部门树按父子关系返回嵌套结构。
- 部门详情排除已删除部门。
- 更新部门支持移动父级，并拒绝移动到自己或子孙下。
- 部门编码创建和更新唯一冲突返回 `409`。
- 删除有子部门的部门返回 `409`。
- 删除有关联用户的部门返回 `409`。
- 删除空部门执行软删除，不物理删除数据库行。
- 用户创建可关联多个部门，响应返回部门摘要。
- 用户更新可替换或清空部门关联。
- 用户引用不存在或已删除部门时返回 `400`。
- 用户软删除同步清理部门关联。
- 注册、登录、刷新和 `me` 返回的用户信息包含 `departments`。
- 认证中间件暴露的 `currentUser` 包含 `departments`。
- SQL 迁移能创建可用的 `departments` 和 `user_departments` 表。

客户端测试：

- Hono RPC client 可以请求 `api.system.departments`。
- 系统用户请求类型接受 `departmentIds`。
- 客户端登录态用户类型包含 `departments`。
- 现有认证刷新和系统路由认证边界继续通过。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm check:deprecated
```
