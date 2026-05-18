# 系统配置模块设计

## 背景

Rev30 现有后台“系统管理”模块已经包含系统用户、组织部门、系统角色和权限资源。菜单、面包屑和按钮权限由服务端权限资源驱动，前端使用 Vue 3、Naive UI、Pinia Colada 和 Hono typed client，后端使用 Hono、Drizzle 和共享 zod schema。

本次新增“系统配置”模块，用于管理非敏感的通用参数配置。初版不支持密钥、token 等敏感值，不做配置分组管理表，只在配置项上保留轻量分组编码。

## 目标

- 在“系统管理”下新增“系统配置”菜单，路径为 `/system/configs`。
- 支持通用参数配置的分页列表、新增、编辑和软删除。
- 支持 `string`、`number`、`boolean`、`json` 四种配置值类型。
- 通过共享 zod schema 在前后端复用输入、响应和查询约束。
- 沿用现有按钮权限模型：`system:config:list/create/update/delete`。

## 非目标

- 不支持敏感配置值的脱敏、加密或密钥轮换。
- 不提供独立的配置分组管理功能。
- 不提供配置变更历史、审计详情或发布审批。
- 不在业务模块中接入运行时配置读取逻辑；本次只交付后台管理能力。

## 数据模型

新增 `system_configs` 表。API 使用 camelCase，数据库使用 snake_case。

| API 字段 | 数据库字段 | 说明 |
| --- | --- | --- |
| `id` | `id` | UUID 主键。 |
| `groupCode` | `group_code` | 配置分组编码，必填，例如 `site`、`auth`、`feature`。 |
| `key` | `key` | 配置键，必填、全局唯一、允许编辑，例如 `site.title`。 |
| `name` | `name` | 配置名称，必填，给管理员看的中文名。 |
| `valueType` | `value_type` | 值类型：`string`、`number`、`boolean`、`json`。 |
| `value` | `value` | 配置值，必填，统一存文本，按 `valueType` 校验。 |
| `description` | `description` | 配置说明，可为空。 |
| `status` | `status` | 启用状态：`0` 禁用，`1` 启用。 |
| `sortOrder` | `sort_order` | 排序值，默认 `0`，表单可编辑，列表不展示。 |
| `createdAt` | `created_at` | 创建时间。 |
| `updatedAt` | `updated_at` | 更新时间。 |
| `deletedAt` | `deleted_at` | 软删除时间。 |

约束规则：

- `key` 对未软删除记录全局唯一；软删除后的旧记录不阻止重新创建同名配置键。
- `value` 不允许为空字符串。
- `string` 类型：`trim` 后不能为空。
- `number` 类型：必须能解析为有限数字。
- `boolean` 类型：只能保存为字符串 `'true'` 或 `'false'`。
- `json` 类型：必须是合法 JSON 文本。
- 列表默认排序为 `groupCode ASC, sortOrder ASC, key ASC`。

## 共享 Schema

在 `packages/shared/src/schemas/system/configs.ts` 增加配置模块 schema，并从 `packages/shared/src/schemas/system/index.ts` 导出。

核心类型：

- `Config`
- `ConfigListItem`
- `ConfigListQuery`
- `ConfigListResponse`
- `ConfigCreateInput`
- `ConfigUpdateInput`
- `ConfigValueType`
- `ConfigStatus`

值类型常量：

- `CONFIG_VALUE_TYPE_STRING = 'string'`
- `CONFIG_VALUE_TYPE_NUMBER = 'number'`
- `CONFIG_VALUE_TYPE_BOOLEAN = 'boolean'`
- `CONFIG_VALUE_TYPE_JSON = 'json'`

校验规则：

- 创建时 `groupCode`、`key`、`name`、`valueType`、`value` 必填。
- 更新时至少包含一个可更新字段。
- `valueType` 和 `value` 必须匹配。
- `description` 可为空，提交空字符串时规范化为 `null`。
- `status` 沿用现有系统状态语义：`0` 禁用，`1` 启用。

## 服务端接口

新增后端模块 `apps/server/src/modules/system/configs`，并在 `apps/server/src/modules/system/routes.ts` 挂载到 `/configs`。

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/system/configs` | `system:config:list` | 分页查询配置列表。 |
| `GET` | `/api/system/configs/:id` | `system:config:list` | 获取单个配置详情，用于编辑抽屉回填。 |
| `POST` | `/api/system/configs` | `system:config:create` | 新增配置。 |
| `PATCH` | `/api/system/configs/:id` | `system:config:update` | 更新配置，允许修改 `key`。 |
| `DELETE` | `/api/system/configs/:id` | `system:config:delete` | 软删除配置。 |

列表查询参数：

| 参数 | 说明 |
| --- | --- |
| `page` / `pageSize` | 沿用现有分页规则。 |
| `keyword` | 匹配 `key`、`name`、`description`。 |
| `groupCode` | 按分组编码精确筛选。 |
| `valueType` | 按配置值类型筛选。 |
| `status` | 按启用状态筛选。 |

错误语义：

- 请求体不符合 schema：`400 请求体无效`。
- ID 或查询参数不合法：`400`。
- 配置不存在：`404 配置不存在`。
- 配置键冲突：`409 配置键已存在`。
- `valueType` 与 `value` 不匹配：`400`，响应包含 `field: 'value'`，便于前端定位到配置值输入项。

服务端文件职责：

- `routes.ts`：Hono 路由、权限检查、请求校验和错误映射。
- `service.ts`：业务规则，包括唯一性、软删除、值类型校验和排序策略。
- `repository.ts`：Drizzle 查询和持久化。
- `mapper.ts`：数据库行到 API 对象的映射。
- `errors.ts`：配置模块领域错误。

## 权限资源迁移

新增迁移，写入系统配置菜单和操作权限。

- 菜单资源：
  - `name`: `系统配置`
  - `code`: `system:config`
  - `path`: `/system/configs`
  - `icon`: `lucide:sliders-horizontal`
  - `sortOrder`: `50`
- 操作资源：
  - `system:config:list`
  - `system:config:create`
  - `system:config:update`
  - `system:config:delete`

这些资源归属于现有 `system` 目录，并沿用迁移中的 `ON CONFLICT ("code") DO UPDATE` 模式。

## 前端交互

新增页面 `apps/client/src/pages/index/system/configs.vue`。

页面结构：

- 顶部显示标题“系统配置”和配置总数。
- 右上角显示“新增系统配置”按钮，受 `system:config:create` 控制。
- 筛选区包含：
  - 关键词：匹配配置键、配置名称、说明。
  - 分组编码：精确筛选。
  - 值类型：全部、字符串、数字、布尔、JSON。
  - 状态：全部、启用、禁用。
- 表格列包含：
  - 分组
  - 配置键
  - 配置名称
  - 值类型
  - 配置值
  - 状态
  - 更新时间
  - 操作

配置值展示：

- 列表中直接展示真实值。
- 超长内容单行省略，悬浮 tooltip 展示完整值。
- `boolean` 列表展示 `true` 或 `false`，与实际存储值一致。
- `json` 列表压缩为单行展示。

操作权限：

- 编辑按钮需要 `system:config:update` 和 `system:config:list`。
- 删除按钮需要 `system:config:delete`。
- 删除使用确认弹窗，成功后刷新列表并提示。

## 表单交互

新增 `apps/client/src/features/system/ConfigFormDrawer.vue`，用于新增和编辑。

字段：

- 分组编码
- 配置键
- 配置名称
- 值类型
- 配置值
- 配置说明
- 状态
- 排序

配置值控件：

- `string`：普通输入框。
- `number`：普通输入框，由 schema 和后端校验有限数字。
- `boolean`：`NSwitch`，回填时从 `'true'` / `'false'` 转为布尔值，提交时转回字符串。
- `json`：多行文本框。

交互规则：

- 新增和编辑共用抽屉。
- `key` 允许编辑，但必须保持唯一。
- 切换 `valueType` 时不清空当前值，但会按新类型重新校验。
- 后端字段级错误 `field: 'value'` 显示到配置值字段。

## 客户端请求

在 `apps/client/src/features/system/requests.ts` 增加：

- `listConfigs(query)`
- `getConfig(id)`
- `createConfig(input)`
- `updateConfig(id, input)`
- `deleteConfig(id)`

响应解析、错误解析和 `SystemRequestError` 复用现有系统模块请求工具。

在 `apps/client/src/features/system/labels.ts` 增加值类型中文标签：

- `string`: `字符串`
- `number`: `数字`
- `boolean`: `布尔`
- `json`: `JSON`

## 测试策略

共享 schema：

- 创建 schema 校验必填字段。
- `valueType` 与 `value` 匹配：
  - `string` 不允许空字符串。
  - `number` 只允许有限数字。
  - `boolean` 只允许 `true` / `false`。
  - `json` 必须能被 `JSON.parse` 解析。
- 更新 schema 要求至少修改一个字段。
- 列表查询支持分页、关键词、分组、类型、状态。

服务端：

- 路由权限：`list/create/update/delete` 分别要求对应 access code。
- CRUD 正常流程。
- `key` 唯一冲突返回 `409 配置键已存在`。
- 不存在返回 `404 配置不存在`。
- 删除是软删除，删除后的配置不再出现在列表里。
- 同一个 `key` 在旧记录软删除后允许重新创建。
- `valueType` 与 `value` 不匹配时返回字段级错误。

前端：

- 页面能加载并展示配置列表、筛选和分页。
- 新增、编辑、删除按钮受权限控制。
- 配置值超长时使用 tooltip 展示完整值。
- 抽屉新增和编辑提交正确 payload。
- `boolean` 类型使用开关，提交时转换成 `'true'` 或 `'false'`。
- `json` 类型使用 textarea。
- 后端 `value` 字段错误能显示到配置值字段。
- 删除成功后刷新列表并提示。

## 验证

开发中按需运行相关测试：

- `pnpm --filter @rev30/shared test`
- `pnpm --filter @rev30/server test`
- `pnpm --filter @rev30/client test`

完成后运行完整验证：

- `pnpm check`
