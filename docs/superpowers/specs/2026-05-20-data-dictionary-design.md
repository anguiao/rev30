# 数据字典模块设计

## 背景

Rev30 现有“系统管理”包含系统用户、组织部门、系统角色、权限资源和系统配置。系统配置适合维护全局参数，不适合承担业务枚举、下拉选项和状态选项的长期维护能力。

本次新增“数据字典”模块，用于维护可被业务表单复用的字典类型和字典项。后台管理侧以“完整数据字典”为编辑对象：列表只展示字典类型，新增和编辑抽屉中同时维护类型信息及其字典项。

## 目标

- 在“系统管理”下新增“数据字典”菜单，路径为 `/system/dictionaries`。
- 支持数据字典类型的分页列表、新增、编辑和软删除。
- 支持在同一个抽屉表单中新增、编辑和删除字典项。
- 创建和更新使用聚合式接口，一次保存完整字典。
- 删除字典类型时级联软删除其下未删除字典项，并在前端明确提示影响范围。
- 提供业务 options 接口，支持一次按多个字典类型 `code` 查询启用字典项。
- 通过共享 zod schema 在前后端复用输入、响应和查询约束。
- 沿用现有按钮权限模型：`system:dictionary:list/create/update/delete`。

## 非目标

本轮不实现：

- 独立的数据字典项管理页面。
- 字典项单独 CRUD 接口暴露给前端页面使用。
- 字典项层级结构；字典项只属于一个字典类型。
- 变更历史、审计详情、发布审批或灰度发布。
- 业务模块自动接入字典值；本次只提供可复用查询接口。
- 国际化、多语言标签或字典值翻译。
- options 接口分页、远程搜索或模糊匹配。

## 数据模型

新增两张表：`system_dictionary_types` 和 `system_dictionary_items`。API 使用 camelCase，数据库使用 snake_case。

### 字典类型

| API 字段 | 数据库字段 | 说明 |
| --- | --- | --- |
| `id` | `id` | UUID 主键。 |
| `code` | `code` | 类型编码，必填，例如 `gender`、`user_status`、`order.status`。 |
| `name` | `name` | 类型名称，必填，给管理员看的中文名。 |
| `description` | `description` | 类型说明，可为空。 |
| `status` | `status` | 启用状态：`0` 禁用，`1` 启用。 |
| `sortOrder` | `sort_order` | 排序值，默认 `0`。 |
| `createdAt` | `created_at` | 创建时间。 |
| `updatedAt` | `updated_at` | 更新时间。 |
| `deletedAt` | `deleted_at` | 软删除时间。 |

约束：

- 未软删除字典类型的 `code` 全局唯一。
- `code` 创建后允许编辑，但仍需满足唯一约束。
- 列表默认排序为 `sortOrder ASC, createdAt DESC, id DESC`。

### 字典项

| API 字段 | 数据库字段 | 说明 |
| --- | --- | --- |
| `id` | `id` | UUID 主键。 |
| `typeId` | `type_id` | 所属字典类型 ID。 |
| `label` | `label` | 字典项显示文本，必填。 |
| `value` | `value` | 字典项业务值，必填。 |
| `description` | `description` | 字典项说明，可为空。 |
| `status` | `status` | 启用状态：`0` 禁用，`1` 启用。 |
| `sortOrder` | `sort_order` | 排序值，默认 `0`。 |
| `createdAt` | `created_at` | 创建时间。 |
| `updatedAt` | `updated_at` | 更新时间。 |
| `deletedAt` | `deleted_at` | 软删除时间。 |

约束：

- 同一未软删除字典类型下，字典项 `value` 唯一。
- `value` 创建后允许编辑，但仍需满足所属类型内唯一约束。
- 字典详情中的字典项默认排序为 `sortOrder ASC, createdAt DESC, id DESC`。

## 校验规则

### 通用规则

- `status` 沿用系统状态语义：`0` 禁用，`1` 启用。
- `sortOrder` 沿用现有整数排序输入规则。
- `description` 可为空，提交空字符串时规范化为 `null`，最长 500 字符。

### 字典类型规则

- `code` 必填，trim 后不能为空，最长 64 字符。
- `code` 必须以小写字母开头，只允许小写字母、数字、下划线、短横线和点号。
- `name` 必填，trim 后不能为空，最长 64 字符。

### 字典项规则

- `label` 必填，trim 后不能为空，最长 64 字符。
- `value` 必填，trim 后不能为空，最长 64 字符。
- `value` 禁止包含逗号，避免和批量查询参数序列化语义冲突。
- 同一次创建或更新请求中的 `items` 数组内，`value` 也必须去重。

## Shared Schema 设计

在 `packages/shared/src/schemas/system/dictionaries.ts` 增加数据字典 schema，并从 `packages/shared/src/schemas/system/index.ts` 导出。

核心常量和类型：

- `DICTIONARY_STATUS_DISABLED = 0`
- `DICTIONARY_STATUS_ENABLED = 1`
- `DictionaryStatus`
- `DictionaryType`
- `DictionaryItem`
- `DictionaryListItem`
- `DictionaryDetail`
- `DictionaryListQuery`
- `DictionaryListResponse`
- `DictionaryCreateInput`
- `DictionaryUpdateInput`
- `DictionaryOptionsQuery`
- `DictionaryOptionsResponse`

响应结构：

```ts
type DictionaryDetail = DictionaryType & {
  items: DictionaryItem[]
}

type DictionaryListItem = Omit<DictionaryType, 'deletedAt'> & {
  itemCount: number
}

type DictionaryOptionsResponse = Record<string, Array<{
  label: string
  value: string
}>>
```

创建输入包含类型字段和可选字典项：

```ts
type DictionaryCreateInput = {
  code: string
  name: string
  description?: string | null
  status?: DictionaryStatus
  sortOrder?: number
  items?: Array<{
    label: string
    value: string
    description?: string | null
    status?: DictionaryStatus
    sortOrder?: number
  }>
}
```

更新输入用于保存完整字典：

```ts
type DictionaryUpdateInput = {
  code: string
  name: string
  description?: string | null
  status: DictionaryStatus
  sortOrder: number
  items: Array<{
    id?: string
    label: string
    value: string
    description?: string | null
    status: DictionaryStatus
    sortOrder: number
  }>
}
```

更新接口要求提交完整字典，不支持只提交某个字段。这个模块保存的是跨表聚合资源，`PUT` 语义比局部 `PATCH` 更准确：前端抽屉把当前完整表单视为唯一事实来源，后端用 `items` 数组同步新增、更新和删除。

## 服务端接口

新增后端模块 `apps/server/src/modules/system/dictionaries`，并在 `apps/server/src/modules/system/routes.ts` 挂载到 `/dictionaries`。

### 后台管理接口

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/system/dictionaries` | `system:dictionary:list` | 分页查询字典类型列表。 |
| `GET` | `/api/system/dictionaries/:id` | `system:dictionary:list` | 获取完整字典详情，用于编辑抽屉回填。 |
| `POST` | `/api/system/dictionaries` | `system:dictionary:create` | 创建完整字典，可同时创建字典项。 |
| `PUT` | `/api/system/dictionaries/:id` | `system:dictionary:update` | 保存完整字典，同步类型字段和字典项。 |
| `DELETE` | `/api/system/dictionaries/:id` | `system:dictionary:delete` | 级联软删除字典类型和字典项。 |

列表查询参数：

| 参数 | 说明 |
| --- | --- |
| `page` / `pageSize` | 沿用现有分页规则。 |
| `keyword` | 匹配字典类型 `code`、`name`、`description`。 |
| `status` | 按启用状态筛选。 |

列表响应中的 `itemCount` 只统计未软删除字典项。前端删除确认使用该字段展示影响范围。

详情响应返回字典类型及其全部未删除字典项，包含禁用项。编辑抽屉需要完整数据，不能只返回启用项。

### 更新同步语义

`PUT /api/system/dictionaries/:id` 在一个事务中完成：

- 查询目标字典类型；不存在或已软删除时返回 `404 数据字典不存在`。
- 更新字典类型字段。
- 以后端收到的 `items` 数组作为保存后的完整未删除字典项集合。
- 同步顺序先软删除本次未传回的已有项，再更新保留项并创建新增项，允许同一次保存中复用已删除项的旧 `value`。
- 对 `items` 中带 `id` 的项：校验该项属于当前字典类型且未软删除，然后更新。
- 对 `items` 中不带 `id` 的项：创建新字典项。
- 对数据库中已有、但本次 `items` 未传回的未删除项：软删除。
- 任一校验、唯一约束或归属校验失败时，整次更新不落库。

### 删除语义

`DELETE /api/system/dictionaries/:id` 级联软删除：

- 字典类型不存在或已软删除时返回 `404 数据字典不存在`。
- 同时将该类型下所有未删除字典项设置 `deletedAt`。
- 前端确认弹窗文案包含字典名称和 `itemCount`，明确会同时删除字典项。

### Options 接口

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/system/dictionaries/options` | 登录即可 | 按多个类型编码查询启用字典项。 |

查询参数：

```text
GET /api/system/dictionaries/options?codes=gender,user_status
```

规则：

- `codes` 必填，逗号分隔。
- 空字符串、空白项和重复项会被规范化为去重后的数组。
- 返回对象包含请求中的每个 code。
- 找不到、已禁用或已删除的字典类型返回空数组。
- 只返回启用且未删除的字典项。
- 字典项按 `sortOrder ASC, createdAt DESC, id DESC` 排序。

响应示例：

```json
{
  "gender": [
    { "label": "男", "value": "male" },
    { "label": "女", "value": "female" }
  ],
  "user_status": []
}
```

Options 路由必须注册在 `/:id` 详情路由之前，避免被动态参数匹配。

### 错误语义

- 请求体不符合 schema：`400 请求体无效`。
- ID 或查询参数不合法：`400`。
- 数据字典不存在：`404 数据字典不存在`。
- 字典类型 `code` 冲突：`409 字典编码已存在`，响应包含 `field: 'code'`。
- 同一字典下字典项 `value` 冲突：`409 字典项值已存在`，响应包含 `field: 'items'`。
- 更新时传入不属于当前字典的字典项 ID：`400 字典项无效`。

## 服务端结构

文件职责：

- `routes.ts`：Hono 路由、权限检查、请求校验和错误映射。
- `service.ts`：聚合保存业务规则、事务编排、options 组装和删除语义。
- `repository.ts`：Drizzle 查询、持久化和事务内同步方法。
- `mapper.ts`：数据库行到 API 对象的映射。
- `errors.ts`：数据字典模块领域错误。

Repository 需要提供：

- 分页查询字典类型，并带未删除字典项数量。
- 查询完整字典详情。
- 创建完整字典。
- 更新完整字典，包括新增、更新、软删除字典项。
- 级联软删除字典类型和字典项。
- 按多个 code 查询启用 options。

## 权限资源迁移

新增迁移，写入数据字典菜单和操作权限。

- 菜单资源：
  - `name`: `数据字典`
  - `code`: `system:dictionary`
  - `path`: `/system/dictionaries`
  - `icon`: `lucide:list-tree`
  - `sortOrder`: `60`
- 操作资源：
  - `system:dictionary:list`
  - `system:dictionary:create`
  - `system:dictionary:update`
  - `system:dictionary:delete`

这些资源归属于现有 `system` 目录，并沿用迁移中的 `ON CONFLICT ("code") DO UPDATE` 模式。

## 前端交互

新增页面 `apps/client/src/pages/index/system/dictionaries.vue`。

页面结构：

- 顶部显示标题“数据字典”和字典总数。
- 右上角显示“新增数据字典”按钮，受 `system:dictionary:create` 控制。
- 筛选区包含：
  - 关键词：匹配字典编码、字典名称、说明。
  - 状态：全部、启用、禁用。
- 表格只展示字典类型：
  - 字典编码
  - 字典名称
  - 字典项数量
  - 状态
  - 排序
  - 更新时间
  - 操作

操作权限：

- 编辑按钮需要 `system:dictionary:update` 和 `system:dictionary:list`。
- 删除按钮需要 `system:dictionary:delete`。
- 删除使用确认弹窗，文案明确级联删除影响，例如：`确定删除数据字典“用户状态”吗？将同时删除该字典下的 4 个字典项。`

## 表单交互

新增 `apps/client/src/features/system/DictionaryFormDrawer.vue`，用于新增和编辑完整数据字典。

字段：

- 字典编码
- 字典名称
- 字典说明
- 状态
- 排序
- 字典项列表

字典项列表在抽屉内维护，字段包含：

- 字典项值
- 字典项标签
- 状态
- 排序
- 说明

交互规则：

- 新增和编辑共用抽屉。
- 新增抽屉可以同时添加字典项。
- 编辑抽屉加载完整字典详情和全部未删除字典项。
- 在抽屉中删除字典项只更新表单状态，点击保存后才通过聚合式 `PUT` 软删除。
- 取消抽屉不保存字典类型或字典项变更。
- 保存时提交完整字典；后端根据 `items` 同步新增、更新和软删除。
- 后端字段级错误 `field: 'code'` 显示到字典编码字段。
- 后端字段级错误 `field: 'items'` 显示到字典项列表区域。

## 客户端请求

在 `apps/client/src/features/system/requests.ts` 增加：

- `listDictionaries(query)`
- `getDictionary(id)`
- `createDictionary(input)`
- `updateDictionary(id, input)`
- `deleteDictionary(id)`
- `getDictionaryOptions(codes)`

响应解析、错误解析和 `SystemRequestError` 复用现有系统模块请求工具。

在 `apps/client/src/features/system/labels.ts` 复用现有状态中文标签和标签类型。

## 测试策略

共享 schema：

- 创建 schema 校验字典类型必填字段、默认状态和默认排序。
- `code` 格式校验：允许 `gender`、`user_status`、`order.status`，拒绝大写开头、空白、逗号和非法字符。
- 字典项 `value` 校验：允许 `0`、`1`、`male`、`pending-payment`，拒绝空白和逗号。
- 创建和更新输入校验同一次请求内字典项 `value` 不能重复。
- 列表查询支持分页、关键词和状态。
- options 查询把逗号分隔 `codes` 解析为去重数组。

服务端：

- 路由权限：`list/create/update/delete` 分别要求对应 access code。
- options 接口只要求登录，不要求 `system:dictionary:list`。
- 创建完整字典时同时创建字典项。
- 列表返回 `itemCount`，只统计未删除字典项。
- 详情返回类型和全部未删除字典项，包含禁用项。
- 更新完整字典时可同时修改类型字段、新增项、更新项和软删除缺失项。
- 更新时传入不属于当前字典的项 ID 返回 `400 字典项无效`。
- `code` 冲突返回 `409 字典编码已存在`。
- 同一类型下字典项 `value` 冲突返回 `409 字典项值已存在`。
- 删除字典类型会级联软删除其下未删除字典项。
- 软删除后的 `code` 和同类型下旧 `value` 不阻止重新创建。
- options 接口按多个 code 返回分组对象，禁用或不存在的 code 返回空数组。

前端：

- 页面能加载并展示字典类型列表、筛选和分页。
- 新增、编辑、删除按钮受权限控制。
- 新增抽屉能提交类型字段和字典项数组。
- 编辑抽屉能加载完整字典详情并回填字典项。
- 字典项新增、编辑、删除在保存前只影响表单状态。
- 保存成功后关闭抽屉并刷新列表。
- 删除确认文案包含级联删除说明和字典项数量。
- 后端 `code` 字段错误能显示到字典编码字段。
- 后端 `items` 字段错误能显示到字典项区域。

## 验证

开发中按需运行相关测试：

```bash
pnpm --filter @rev30/shared test -- dictionaries
pnpm --filter @rev30/server test -- dictionaries
pnpm --filter @rev30/client test -- dictionaries
pnpm typecheck
pnpm lint:check
```

合并前运行完整验证：

```bash
pnpm check
```
