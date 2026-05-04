# Roles Design

## 背景

当前项目已有认证、系统用户、部门和系统资源模块。系统模块统一挂载在
`/api/system` 下，并由 Bearer token 中间件保护；业务模块按
`routes/service/repository/mapper/errors` 拆分；共享 zod schema 和 TypeScript
类型放在 `packages/shared`。

系统资源模块已经提供目录、菜单、外链和操作权限点，并把 `system_resources.code`
作为后续授权和权限判断的稳定权限编码。角色模块第一期接在资源模块之后，负责维护
角色基础信息、角色资源授权关系，以及用户角色关系；它只保存授权数据，不负责解释权限。

## 目标

1. 新增数据库支持的角色模块，挂载在 `/api/system/roles`。
2. 角色支持列表、详情、新增、更新和软删除。
3. 角色支持关联系统资源，用于表达角色拥有的菜单和操作权限点。
4. 用户支持关联多个角色，用户响应统一返回角色摘要。
5. 注册、登录、刷新和 `me` 响应中的用户信息继续使用同一套带部门和角色摘要的
   `User` 结构。
6. 删除角色时，如果仍有关联用户，返回 `409` 并拒绝删除。
7. 删除系统资源时，如果资源仍被角色授权，返回 `409` 并拒绝删除。
8. 第一版保持后端 API、数据库和共享类型完整，不实现前端管理页面和运行时权限判断。

## 非目标

第一版不实现前端角色管理页面、前端授权树控件、动态菜单生成、接口级权限中间件、
按钮级权限指令、用户权限聚合接口、内置 `admin` 或 `super_admin` 角色、初始化种子、
超级管理员绕过策略、批量导入导出、角色恢复、审计日志或多租户隔离。

角色禁用只表达管理状态，不在本期触发权限判断或自动移除用户关联。资源禁用也不影响
角色授权关系的保存；后续权限聚合和菜单生成模块再决定如何过滤禁用角色或禁用资源。

## 数据模型

新增 `roles` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `name` | text | 角色名称，必填 |
| `code` | text | 角色编码，必填，全表唯一 |
| `status` | smallint | `1=启用`，`0=禁用` |
| `sort_order` | integer | 展示排序值，默认 `0` |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp | 删除时间，可空 |

索引和约束：

- `roles_code_unique` 唯一约束覆盖全表，软删除后 `code` 仍继续占用。
- `roles_status_idx` 支持按状态过滤。

新增 `role_resources` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `role_id` | uuid | 指向 `roles.id` |
| `resource_id` | uuid | 指向 `system_resources.id` |
| `created_at` | timestamp | 关联创建时间 |

索引和约束：

- `(role_id, resource_id)` 为组合主键，避免重复授权。
- `role_resources_resource_id_idx` 支持资源删除前检查是否被角色授权。

新增 `user_roles` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | 指向 `users.id` |
| `role_id` | uuid | 指向 `roles.id` |
| `created_at` | timestamp | 关联创建时间 |

索引和约束：

- `(user_id, role_id)` 为组合主键，避免重复分配。
- `user_roles_role_id_idx` 支持角色删除前检查是否仍有关联用户。

角色软删除时同步删除该角色的 `role_resources` 授权关系，但如果存在 `user_roles`
关联则拒绝删除。用户软删除时同步删除该用户的 `user_roles` 关联。资源软删除时如果
存在 `role_resources` 关联则拒绝删除，避免角色授权引用已删除资源。

## 共享 Schema

新增角色 schema 和类型：

- `ROLE_STATUS_ENABLED = 1`
- `ROLE_STATUS_DISABLED = 0`
- `roleStatusSchema`
- `roleSummarySchema`
- `roleResourceSchema`
- `roleListItemSchema`
- `roleSchema`
- `roleListQuerySchema`
- `roleCreateSchema`
- `roleUpdateSchema`
- `roleListResponseSchema`

字段语义：

- `roleSummarySchema` 用于用户响应中的角色摘要，包含 `id`、`name`、`code`。
- `roleResourceSchema` 用于角色详情中的资源摘要，包含 `id`、`name`、`code`、`type`。
- `roleListItemSchema` 包含角色基础字段和 `userCount`，不包含资源列表，也不包含资源数量。
- `roleSchema` 包含角色基础字段和 `resources: roleResourceSchema[]`。
- `sortOrder` 默认为 `0`，只用于稳定展示排序。

创建请求规则：

- `name` 必填，去除首尾空白后不能为空。
- `code` 必填，去除首尾空白后不能为空。
- `status` 默认 `ROLE_STATUS_ENABLED`。
- `sortOrder` 默认 `0`。
- `resourceIds` 可选；省略表示无资源授权。
- `resourceIds` 必须是 UUID 数组，数组内不能重复。

更新请求规则：

- 可更新 `name`、`code`、`status`、`sortOrder` 和 `resourceIds`。
- 至少修改一个字段。
- 省略 `resourceIds` 表示不修改资源授权。
- 传空数组表示清空资源授权。
- `resourceIds` 必须是 UUID 数组，数组内不能重复。

扩展系统用户 schema：

- `userRoleSchema`：用户响应中的角色摘要，包含 `id`、`name`、`code`。
- `userSchema`：现有用户字段加 `roles: userRoleSchema[]`。
- `userListResponseSchema` 的 `list` 使用带部门和角色摘要的 `userSchema`。
- `userCreateSchema` 支持 `roleIds?: string[]`。
- `userUpdateSchema` 支持 `roleIds?: string[]`；字段省略表示不修改角色，传空数组表示清空角色。

`authTokenResponseSchema` 继续引用 `userSchema`，因此注册、登录、刷新和 `me` 响应中的
用户信息也必须携带 `roles`。认证中间件写入的 `currentUser` 同样使用这套结构。

`resourceIds` 和 `roleIds` 的存在性、是否已软删除由服务端业务层校验；状态字段不参与
引用合法性判断。

## 路由结构

新增角色路由挂载到现有系统路由：

- `apps/server/src/modules/system/roles/routes.ts`
- `apps/server/src/modules/system/roles/service.ts`
- `apps/server/src/modules/system/roles/repository.ts`
- `apps/server/src/modules/system/roles/mapper.ts`
- `apps/server/src/modules/system/roles/errors.ts`

`apps/server/src/modules/system/routes.ts` 挂载：

- `/departments`
- `/resources`
- `/roles`
- `/users`

所有 `/api/system/roles/*` 路由继承现有 `/api/system/*` 认证保护。

## 角色 API

### `GET /api/system/roles`

查询参数：

- `page`：默认 `1`
- `pageSize`：默认 `20`，最大 `100`
- `keyword`：可选，匹配 `name` 和 `code`
- `status`：可选，只接受 `0` 或 `1`

行为：

- 默认只返回 `deleted_at IS NULL` 的角色。
- 返回 `{ list, total, page, pageSize }`。
- `list` 元素包含角色基础字段和 `userCount`。
- `userCount` 表示当前关联到该角色的未删除用户数量，用于列表展示和删除前判断。
- `list` 元素不返回 `resources`，也不返回 `resourceCount`。
- 排序按 `sortOrder ASC`、`createdAt DESC`、`id DESC`。

### `GET /api/system/roles/:id`

行为：

- 返回未删除角色详情。
- 响应包含角色基础字段和 `resources`。
- `resources` 只返回未删除资源，按资源模块的同级排序规则排序。
- 角色不存在或已软删除时返回 `404`。

### `POST /api/system/roles`

请求字段：

- `name`：必填
- `code`：必填
- `status`：可选，默认 `1`
- `sortOrder`：可选，默认 `0`
- `resourceIds`：可选

行为：

- `resourceIds` 中的资源必须全部存在且未删除，否则返回 `400`。
- `code` 与任何现有角色冲突时返回 `409`。
- 创建角色和写入资源授权在同一事务中完成。
- 创建成功返回角色详情，包含 `resources`。

### `PATCH /api/system/roles/:id`

可更新字段：

- `name`
- `code`
- `status`
- `sortOrder`
- `resourceIds`

行为：

- 至少修改一个字段。
- 角色不存在或已软删除时返回 `404`。
- `resourceIds` 省略表示不修改资源授权。
- `resourceIds: []` 表示清空资源授权。
- `resourceIds` 中的资源必须全部存在且未删除，否则返回 `400`。
- `code` 唯一冲突返回 `409`。
- 更新角色字段和替换资源授权在同一事务中完成。
- 更新成功刷新 `updated_at` 并返回角色详情，包含 `resources`。

### `DELETE /api/system/roles/:id`

行为：

- 角色不存在或已软删除时返回 `404`。
- 如果存在任何 `user_roles` 关联，返回 `409`。
- 满足删除条件时设置 `deleted_at`，刷新 `updated_at`，同步删除该角色的
  `role_resources` 记录，返回 `204`。
- 不物理删除角色记录，且不改变 `status` 的语义。

## 用户 API 扩展

`POST /api/system/users` 新增可选字段：

- `roleIds?: string[]`

行为：

- 省略 `roleIds` 表示用户无角色关联。
- 传入角色 ID 必须全部存在且未删除，否则返回 `400`。
- 创建用户、写入部门关联和写入角色关联在同一事务中完成。

`PATCH /api/system/users/:id` 新增可选字段：

- `roleIds?: string[]`

行为：

- 省略 `roleIds` 表示不修改用户角色。
- 传空数组表示清空用户角色。
- 传入角色 ID 必须全部存在且未删除，否则返回 `400`。
- 更新用户字段、替换部门关联和替换角色关联在同一事务中完成。

用户信息响应统一包含 `roles`：

```json
{
  "id": "user-uuid",
  "username": "ada",
  "nickname": "Ada Lovelace",
  "departments": [],
  "roles": [
    {
      "id": "role-uuid",
      "name": "Administrator",
      "code": "admin"
    }
  ]
}
```

用户列表和详情只返回未删除用户；关联角色只返回未删除角色。用户软删除会清理该用户的
角色关联。注册创建的新用户默认没有角色，响应中的 `roles` 为 `[]`。登录、刷新和
`me` 接口会读取当前用户的角色关联并返回角色摘要。

## 资源 API 扩展

`DELETE /api/system/resources/:id` 新增删除保护：

- 资源不存在或已软删除时仍返回 `404`。
- 如果存在未删除子资源，仍返回 `409`。
- 如果资源存在任何 `role_resources` 授权关系，返回 `409`。
- 满足删除条件时继续执行软删除，返回 `204`。

资源删除保护只检查是否被角色授权，不做权限解释，也不尝试级联修改角色授权。

## 错误处理

沿用当前系统模块的错误风格，只在系统边界做必要校验：

- 请求参数、请求体格式不合法返回 `400`。
- 请求引用不存在或已删除的资源、角色 ID 返回 `400`。
- 角色、用户或资源不存在返回 `404`。
- 角色编码唯一冲突、删除有关联用户的角色、删除被角色授权的资源返回 `409`。

稳定错误消息：

- 角色 ID 格式不合法：`角色 ID 无效`
- 查询参数不合法：`查询参数无效`
- 请求体不合法：`请求体无效`
- 角色不存在：`角色不存在`
- 角色编码冲突：`角色编码已存在`
- 资源引用不合法：`资源不存在`
- 用户角色引用不合法：`角色不存在`
- 删除有关联用户的角色：`角色存在关联用户，不能删除`
- 删除被角色授权的资源：`资源存在角色授权，不能删除`

不添加宽泛 try/catch，不在业务层吞掉未知数据库错误。数据库唯一约束是最终一致性保护，
服务端只把已知约束错误转换为稳定业务错误。

## 测试设计

实现按 TDD 执行，先写失败测试再写实现。

共享包测试：

- 角色 schema 接受合法角色、角色列表项、角色资源摘要和分页响应。
- 角色状态只接受 `0` 和 `1`。
- 角色创建默认启用，默认 `sortOrder=0`。
- 角色列表项包含关联未删除用户数量 `userCount`。
- `roleCreateSchema` 和 `roleUpdateSchema` 接受 `resourceIds`，并拒绝重复 ID。
- `roleUpdateSchema` 要求至少修改一个字段。
- 角色列表查询只接受合法 `status`、`page` 和 `pageSize`。
- `userSchema` 要求用户信息携带 `roles`，并接受空数组。
- 用户创建和更新 schema 接受 `roleIds`，并拒绝重复 ID。

服务端测试：

- `POST /api/system/roles` 会真实写入数据库。
- 创建角色可关联多个资源，响应返回资源摘要。
- `GET /api/system/roles` 返回分页列表，列表项包含 `userCount`，且不包含 `resources`
  或 `resourceCount`。
- 列表支持按 `keyword` 和 `status` 过滤。
- `GET /api/system/roles/:id` 返回角色详情和资源摘要。
- `PATCH /api/system/roles/:id` 更新角色字段并刷新 `updatedAt`。
- 更新角色可替换或清空资源授权。
- 创建和更新拒绝不存在或已删除的资源 ID。
- 创建和更新拒绝重复 `code`。
- 删除空角色执行软删除并清理 `role_resources`。
- 删除有关联用户的角色返回 `409`。
- 非法查询、非法角色 ID 和非法请求体返回稳定 `400`。
- 用户创建可关联多个角色，响应返回角色摘要。
- 用户更新可替换或清空角色关联。
- 用户引用不存在或已删除角色时返回 `400`。
- 用户软删除同步清理角色关联。
- 注册、登录、刷新和 `me` 返回的用户信息包含 `roles`。
- 认证中间件暴露的 `currentUser` 包含 `roles`。
- 删除被角色授权的资源返回 `409`。
- SQL 迁移能创建可用的 `roles`、`role_resources` 和 `user_roles` 表。

客户端 RPC 类型测试：

- Hono RPC client 可以请求 `api.system.roles`。
- 系统用户请求类型接受 `roleIds`。
- 客户端登录态用户类型包含 `roles`。
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

如果实现涉及生成迁移，还需要运行对应 Drizzle 命令并检查生成内容：

```bash
pnpm --filter @rev30/server db:generate
```
