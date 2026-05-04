# System Resources Design

## 背景

当前项目已有认证、系统用户和部门模块。后端系统模块统一挂载在 `/api/system`
下，并由 Bearer token 中间件保护；业务模块按
`routes/service/repository/mapper/errors` 拆分；共享 zod schema 和类型放在
`packages/shared`。

菜单/按钮管理第一期不直接实现角色权限，但需要为后续基于角色的权限控制提供稳定的
资源目录。这里的“按钮”不只代表页面按钮，也可能代表导出、审核、重置密码、接口访问
等操作能力。因此第一期使用统一的系统资源模型，把目录、内部菜单、外链菜单和操作权限
点放在同一棵树中管理。

## 目标

1. 新增数据库支持的系统资源模块，挂载在 `/api/system/resources`。
2. 系统资源支持目录、内部菜单、外链菜单和操作权限点四种类型。
3. 资源支持列表、树查询、详情、新增、更新和软删除。
4. 资源树只禁止循环关系，不限制操作权限点必须挂在某个菜单下。
5. 菜单支持隐藏、图标、内部路由、外链 URL 和打开方式。
6. 资源 `code` 作为后续角色授权和权限判断的稳定权限编码。
7. 第一版保持后端 API 和共享类型完整，不实现前端管理页面和角色授权关系。

## 非目标

第一版不实现前端菜单/操作权限管理页面、动态路由加载、角色管理、角色资源授权、
用户权限聚合、接口级权限中间件、按钮级指令、批量导入导出、资源恢复、审计日志或
多租户隔离。

外链菜单只保存 URL 和打开方式，不做外链可达性检查。隐藏菜单只表达导航展示状态，
不代表禁用，也不影响后续授权判断。

## 数据模型

新增 `system_resources` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `parent_id` | uuid | 可空，指向父资源 |
| `type` | text | `directory`、`menu`、`external` 或 `action` |
| `name` | text | 资源名称，必填 |
| `code` | text | 权限编码，必填，全表唯一 |
| `path` | text | 内部菜单路径，仅 `menu` 使用 |
| `external_url` | text | 外链地址，仅 `external` 使用 |
| `open_target` | text | `self` 或 `blank` |
| `icon` | text | 图标类名，主要给目录和菜单使用 |
| `hidden` | boolean | 是否在导航中隐藏，默认 `false` |
| `status` | smallint | `1=启用`，`0=禁用` |
| `sort_order` | integer | 同级排序值，默认 `0` |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp | 删除时间，可空 |

索引和约束：

- `system_resources_code_unique` 唯一约束覆盖全表，软删除后 `code` 仍继续占用。
- `system_resources_parent_id_idx` 支持查询直接子资源。
- `system_resources_type_idx` 支持按资源类型过滤。
- `system_resources_status_idx` 支持按状态过滤。

资源类型：

- `directory`：菜单目录，只负责分组，不要求跳转字段。
- `menu`：内部页面菜单，必须有 `path`，默认 `openTarget = self`。
- `external`：外链菜单，必须有 `externalUrl`，默认 `openTarget = blank`。
- `action`：操作权限点，可代表页面按钮、接口能力、批量操作或全局能力，不要求跳转字段。

所有类型都可以作为根节点，也可以有父节点。第一版不限制 `action` 的父级类型，
因为操作权限点可能是页面内能力，也可能是全局能力。服务端只禁止循环关系。

## 共享 Schema

新增资源 schema 和类型：

- `RESOURCE_STATUS_ENABLED = 1`
- `RESOURCE_STATUS_DISABLED = 0`
- `resourceStatusSchema`
- `RESOURCE_TYPE_DIRECTORY = 'directory'`
- `RESOURCE_TYPE_MENU = 'menu'`
- `RESOURCE_TYPE_EXTERNAL = 'external'`
- `RESOURCE_TYPE_ACTION = 'action'`
- `resourceTypeSchema`
- `RESOURCE_OPEN_TARGET_SELF = 'self'`
- `RESOURCE_OPEN_TARGET_BLANK = 'blank'`
- `resourceOpenTargetSchema`
- `resourceSchema`
- `resourceTreeNodeSchema`
- `resourceListQuerySchema`
- `resourceCreateSchema`
- `resourceUpdateSchema`
- `resourceListResponseSchema`

字段语义：

- `path` 在响应中为 `string | null`，仅内部菜单需要非空。
- `externalUrl` 在响应中为 `string | null`，仅外链菜单需要非空。
- `openTarget` 在响应中始终为 `self | blank`。
- `icon` 在响应中为 `string | null`。
- `hidden` 在响应中为 boolean。

创建请求规则：

- `directory` 和 `action` 不要求 `path` 或 `externalUrl`。
- `menu` 必须提供非空 `path`。
- `external` 必须提供非空 `externalUrl`，并默认 `openTarget = blank`。
- `menu` 默认 `openTarget = self`，但允许传 `blank`。
- `directory` 和 `action` 默认 `openTarget = self`，该字段不参与跳转行为。
- `status` 默认 `RESOURCE_STATUS_ENABLED`。
- `hidden` 默认 `false`。
- `sortOrder` 默认 `0`。

更新请求规则：

- 至少修改一个字段。
- 如果更新后的类型是 `menu`，最终资源必须有非空 `path`。
- 如果更新后的类型是 `external`，最终资源必须有非空 `externalUrl`。
- 如果更新后的类型是 `directory` 或 `action`，最终资源的 `path` 和 `externalUrl`
  归一为 `null`。
- 如果更新后的类型是 `menu`，最终资源的 `externalUrl` 归一为 `null`。
- 如果更新后的类型是 `external`，最终资源的 `path` 归一为 `null`。

`externalUrl` 第一版只用 zod URL 校验，不访问网络验证可达性。

## 路由结构

新增资源路由挂载到现有系统路由：

- `apps/server/src/modules/system/resources/routes.ts`
- `apps/server/src/modules/system/resources/service.ts`
- `apps/server/src/modules/system/resources/repository.ts`
- `apps/server/src/modules/system/resources/mapper.ts`
- `apps/server/src/modules/system/resources/errors.ts`

`apps/server/src/modules/system/routes.ts` 挂载：

- `/departments`
- `/resources`
- `/users`

所有 `/api/system/resources/*` 路由继承现有 `/api/system/*` 认证保护。

## 资源 API

### `GET /api/system/resources`

查询参数：

- `page`：默认 `1`
- `pageSize`：默认 `20`，最大 `100`
- `keyword`：可选，匹配 `name`、`code`、`path` 和 `externalUrl`
- `type`：可选，只接受 `directory`、`menu`、`external`、`action`
- `status`：可选，只接受 `0` 或 `1`
- `parentId`：可选，筛选直接子资源

行为：

- 默认只返回 `deleted_at IS NULL` 的资源。
- 返回 `{ list, total, page, pageSize }`。
- 排序按 `sortOrder ASC`、`createdAt DESC`、`id DESC`。

### `GET /api/system/resources/tree`

行为：

- 返回未删除资源组成的树。
- 根节点为 `parent_id IS NULL` 的资源。
- 每个节点包含资源字段和 `children`。
- 同级排序按 `sortOrder ASC`、`createdAt DESC`、`id DESC`。
- 不按 `hidden` 或 `status` 过滤；调用方可基于完整树生成导航或授权视图。

### `GET /api/system/resources/:id`

行为：

- 返回未删除资源详情。
- 资源不存在或已软删除时返回 `404`。

### `POST /api/system/resources`

请求字段：

- `type`：必填
- `name`：必填
- `code`：必填
- `parentId`：可选，默认为 `null`
- `path`：内部菜单必填，其他类型可空
- `externalUrl`：外链菜单必填，其他类型可空
- `openTarget`：可选，内部菜单默认 `self`，外链菜单默认 `blank`
- `icon`：可选，空字符串按 `null` 处理
- `hidden`：可选，默认 `false`
- `status`：可选，默认 `1`
- `sortOrder`：可选，默认 `0`

行为：

- `parentId` 非空时，父资源必须存在且未删除，否则返回 `400`。
- `code` 与任何现有资源冲突时返回 `409`。
- 创建成功返回资源详情。

### `PATCH /api/system/resources/:id`

可更新字段：

- `type`
- `name`
- `code`
- `parentId`
- `path`
- `externalUrl`
- `openTarget`
- `icon`
- `hidden`
- `status`
- `sortOrder`

行为：

- 至少修改一个字段。
- 资源不存在或已软删除时返回 `404`。
- `parentId` 非空时，父资源必须存在且未删除。
- 禁止将资源挂到自己或自己的子孙资源下，违反时返回 `409`。
- 更新后的最终资源仍必须满足类型字段规则。
- `code` 唯一冲突返回 `409`。
- 更新成功刷新 `updated_at` 并返回资源详情。

### `DELETE /api/system/resources/:id`

行为：

- 资源不存在或已软删除时返回 `404`。
- 如果存在未删除直接子资源，返回 `409`。
- 满足删除条件时设置 `deleted_at`，刷新 `updated_at`，返回 `204`。
- 不物理删除资源记录，且不改变 `status` 的语义。

## 错误处理

只在系统边界做必要校验：

- 请求体和查询参数不合法返回 `400`。
- 资源 ID 格式不合法返回 `400`。
- 父资源不存在或已删除返回 `400`。
- 资源不存在或已删除返回 `404`。
- 唯一字段冲突、循环移动和存在子资源时删除返回 `409`。

不添加宽泛 try/catch 或额外 fallback。数据库唯一约束是最终一致性保护，服务端把可预期
的唯一约束错误转换为稳定业务错误。

## 测试设计

实现按 TDD 执行，先写失败测试再写实现。

共享包测试：

- `resourceCreateSchema` 接受 `directory`、`menu`、`external` 和 `action`。
- `menu` 缺少 `path` 时校验失败。
- `external` 缺少 `externalUrl` 时校验失败，并默认 `openTarget = blank`。
- `directory` 和 `action` 可没有跳转字段。
- `resourceUpdateSchema` 要求至少修改一个字段。
- 列表查询只接受合法 `type`、`status`、`page` 和 `pageSize`。

服务端测试：

- `POST /api/system/resources` 会真实写入数据库。
- `GET /api/system/resources` 返回分页列表。
- 列表支持按 `keyword`、`type`、`status` 和 `parentId` 过滤。
- `GET /api/system/resources/:id` 返回资源详情。
- `GET /api/system/resources/tree` 返回资源树。
- `PATCH /api/system/resources/:id` 更新资源并刷新 `updatedAt`。
- 更新拒绝把资源移动到自己或子孙资源下。
- 创建和更新拒绝重复 `code`。
- `DELETE /api/system/resources/:id` 会软删除空资源。
- 删除存在未删除子资源的资源返回 `409`。
- 非法查询、非法资源 ID 和非法请求体返回稳定 `400`。

客户端 RPC 类型测试：

- `api.system.resources.$get` 支持资源查询参数。
- `api.system.resources.$post` 接受资源创建输入。
- 资源 RPC 合同拒绝未知查询参数。

## 后续扩展

后续角色权限模块可以新增角色资源关联表，例如 `role_resources(role_id, resource_id)`。
授权时使用资源 `id` 做关联，运行时权限判断可以聚合资源 `code`。菜单生成可以在完整资源树
上结合角色资源集合、`hidden` 和 `status` 过滤；接口级权限也可以复用同一套 `action`
资源编码。
