# 图标库设计

## 背景

项目已有后端 `/api/icons/:prefix.json?icons=...`，可按 Iconify API 兼容格式从
`@iconify/json` 读取内置图标；也已有 `/api/icons/search` 供资源图标选择器做轻量搜索。
当前还缺少一个后台页面来浏览内置图标集、维护自定义图标集，并让自定义图标在上传后立即进入
运行时图标加载和资源图标选择器。

后台信息架构上，新增页面放在“内容管理”下，菜单名为“图标库”。领域模型本身不使用
`content_` 前缀，避免把页面归属误写进数据模型。

## 目标

1. 在“内容管理”下新增“图标库”页面。
2. 页面分为“内置图标”和“自定义图标”两个 tab。
3. 内置图标只读浏览，第一版数据来源为已安装的 `@iconify/json`。
4. 自定义图标集支持创建、编辑名称/描述、删除、上传 SVG、重命名图标、删除图标和导出
   Iconify JSON。
5. 自定义图标上传后立即可用于 `/api/icons/:prefix.json`、`/api/icons/search` 和资源图标选择器。
6. 图标库列表接口直接返回可渲染的 `body`、`width`、`height`，页面不需要再调用运行时图标接口。
7. 自定义图标集的 `prefix` 不能与内置图标集或已有自定义图标集冲突。
8. 上传 SVG 时自动判断单色/彩色：单色图标归一为 `currentColor`，彩色图标保留原始颜色。

## 非目标

本轮不做：

- 导入已有 Iconify JSON。
- 图标收藏、最近使用、个人偏好或审计日志。
- 按分类、单色/彩色、来源等额外筛选。
- 在图标库页面展示“单色/彩色”标签。
- 修改 `/api/icons/search` 的响应结构；它只在后续计划中升级为直接返回可渲染数据。
- 允许自定义图标集覆盖内置图标集。
- 修改已有资源 `icon` 字段存储格式。

## 路由设计

### 运行时使用侧

现有路由保留，语义保持为“取应用可用图标数据”：

```text
GET /api/icons/:prefix.json?icons=...
GET /api/icons/search?keyword=&limit=
```

`GET /api/icons/:prefix.json` 的查询顺序为：

1. 先查内置图标集。
2. 内置不存在时查自定义图标集。
3. 都不存在时保持现有 `404` 行为。

虽然创建自定义图标集时已经禁止 prefix 冲突，但查询顺序仍以只读、稳定的内置图标为权威来源，
避免脏数据或迁移边界导致自定义图标意外遮蔽内置图标。

`GET /api/icons/search` 继续供资源图标选择器使用，响应结构本轮不变，但结果会合并自定义图标。

### 图标库页面侧

图标库页面使用新的 `icon-sets` 路由。两个 tab 对应两个子域：

```text
GET /api/icon-sets/builtin?keyword=&page=&pageSize=
GET /api/icon-sets/builtin/icons?keyword=&prefix=&page=&pageSize=

GET    /api/icon-sets/custom?keyword=&page=&pageSize=
POST   /api/icon-sets/custom
GET    /api/icon-sets/custom/:prefix
PATCH  /api/icon-sets/custom/:prefix
DELETE /api/icon-sets/custom/:prefix

GET    /api/icon-sets/custom/icons?keyword=&prefix=&page=&pageSize=

POST   /api/icon-sets/custom/:prefix/icons
PATCH  /api/icon-sets/custom/:prefix/icons/:name
DELETE /api/icon-sets/custom/:prefix/icons/:name

GET    /api/icon-sets/custom/:prefix/export
```

查询参数第一版只保留：

- `keyword`：关键词搜索。
- `prefix`：图标列表接口的可选限定范围；不传表示在当前 tab 全部图标中搜索，传入表示只查某个
  图标集。
- `page`、`pageSize`：分页。
- `limit`：仅保留给已有 `/api/icons/search`。

导出接口通过响应头下载文件，不在路由名中带 `.json`：

```text
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="<prefix>.json"
```

## 响应契约

通用分页响应：

```ts
type PageResponse<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}
```

运行时图标数据返回标准 IconifyJSON 子集：

```ts
type IconifyDataResponse = {
  prefix: string
  icons: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, unknown>
  width?: number
  height?: number
  not_found?: string[]
}
```

资源图标选择器搜索保持现有结构：

```ts
type IconSearchResponse = {
  list: Array<{
    icon: string
    prefix: string
    name: string
    collection: string
    palette: boolean
  }>
}
```

内置图标集列表：

```ts
type BuiltinIconSetItem = {
  prefix: string
  name: string
  total: number
}

type BuiltinIconSetListResponse = PageResponse<BuiltinIconSetItem>
```

内置图标列表：

```ts
type BuiltinIconItem = {
  icon: string
  prefix: string
  name: string
  setName: string
  body: string
  width: number
  height: number
}

type BuiltinIconListResponse = PageResponse<BuiltinIconItem>
```

自定义图标集：

```ts
type CustomIconSet = {
  prefix: string
  name: string
  description: string | null
  iconCount: number
  createdAt: string
  updatedAt: string
}

type CustomIconSetListResponse = PageResponse<CustomIconSet>
```

自定义图标列表：

```ts
type CustomIconItem = {
  icon: string
  prefix: string
  name: string
  setName: string
  body: string
  width: number
  height: number
  createdAt: string
  updatedAt: string
}

type CustomIconListResponse = PageResponse<CustomIconItem>
```

上传 SVG 的响应：

```ts
type CustomIconUploadResponse = {
  created: CustomIconItem[]
  replaced: CustomIconItem[]
  skipped: Array<{
    name: string
    sourceFilename: string
    reason: 'duplicate'
  }>
  failed: Array<{
    sourceFilename: string
    message: string
  }>
}
```

删除接口返回 `204`。导出接口返回标准 IconifyJSON。

## 数据模型

新增两张表，只存自定义图标：

```text
custom_icon_sets
custom_icon_set_icons
```

`custom_icon_sets` 字段：

- `id`
- `prefix`
- `name`
- `description`
- `created_at`
- `updated_at`
- `deleted_at`

约束：

- `prefix` 遵循 Iconify 命名规则：小写字母、数字、连字符，不能以连字符开头或结尾。
- 未删除记录中 `prefix` 唯一。
- 创建时校验 `prefix` 不存在于内置图标集。
- `prefix` 创建后不可修改。
- 响应中的 `iconCount` 通过统计 `custom_icon_set_icons` 未删除记录得出，不在表中冗余存储。

`custom_icon_set_icons` 字段：

- `id`
- `set_id`
- `name`
- `body`
- `width`
- `height`
- `palette`
- `created_at`
- `updated_at`
- `deleted_at`

约束：

- `set_id + name` 在未删除范围内唯一。
- `name` 使用 Iconify 图标名规则。
- `body` 存 Iconify 图标项中的 SVG 内部内容，不保存完整原始 SVG 文件。
- `palette` 是内部字段，用于兼容现有 `/api/icons/search` 响应和后续判断；图标库页面不展示该字段。

## SVG 上传与解析

上传接口使用 `multipart/form-data`：

```text
POST /api/icon-sets/custom/:prefix/icons
```

字段：

- `files`：一个或多个 SVG 文件。
- `duplicateStrategy`：`skip | replace`。

图标名从上传文件名推导：

- 取文件 basename，不使用目录。
- 去掉 `.svg` 扩展名。
- 转小写。
- 空白、下划线和连续分隔符归一为 `-`。
- 结果必须符合 Iconify 图标名规则，否则该文件进入 `failed`。

重复名处理：

- `skip`：已有同名图标时不写入，进入 `skipped`。
- `replace`：已有同名图标时替换 `body`、`width`、`height`、`palette`。

服务端使用 Iconify 工具链解析 SVG，优先引入 `@iconify/tools` 做 SVG 清理、优化和导出结构。
解析策略参考 Iconify 官方 SVG 导入与 IconifyJSON 导出流程。

颜色自动判断：

- 单色图标：只包含 `currentColor`、黑色、未声明颜色，或可明确归一为单色时，将有效颜色转成
  `currentColor`。
- 彩色图标：检测到多种有效颜色、渐变、pattern、image 等复杂填充时保留原始颜色。
- SVG 清理后移除脚本、事件属性和不允许的外链资源。

这个策略也吸收了 Anthony Fu 在纯 CSS 图标文章中的思路：单色图标应能随上下文颜色变化，彩色图标
应保留自身视觉信息。

## 前端页面

新增页面：

```text
apps/client/src/pages/index/content/icon-sets.vue
```

菜单放在“内容管理”下，显示为“图标库”。

页面结构：

- 两个 tab：“内置图标”和“自定义图标”。
- 内置 tab 只读浏览内置图标集和图标。
- 自定义 tab 管理自定义图标集和其中图标。

内置 tab：

- 搜索图标集。
- 浏览图标集。
- 在全部内置图标或选中图标集内搜索图标。
- 点击图标复制完整名称，例如 `lucide:user`。
- 不展示单色/彩色标签，不提供编辑动作。

自定义 tab：

- 搜索、创建、编辑、删除自定义图标集。
- 选中图标集后搜索图标、上传 SVG、导出 JSON。
- 图标项支持复制名称、重命名、删除。
- 上传前选择重复名策略：跳过重复或替换重复。
- 上传后展示创建、替换、跳过、失败汇总。

图标网格：

- 单元格尺寸固定。
- 图标预览框尺寸固定。
- SVG 根据接口返回的 `width`、`height` 设置 `viewBox`，在固定预览框内等比缩放。
- 长图标名使用省略号，完整名称放在 tooltip。
- hover、选中和操作按钮不改变单元格尺寸，避免网格跳动。
- 彩色图标直接显示原色；单色图标使用 `currentColor` 跟随当前文本色。

## 代码组织

代码仍放在图标域下，通过二级目录区分能力：

```text
apps/server/src/modules/icons/
  routes.ts
  service.ts
  search/
  sets/
    routes.ts
    builtin/
      routes.ts
      service.ts
    custom/
      routes.ts
      service.ts
      repository.ts
      svg.ts
      export.ts
      errors.ts
```

路由挂载：

```ts
.route('/icon-sets', createIconSetRoutes(database, authMiddleware))
.route('/icons/search', createIconSearchRoutes(authMiddleware))
.route('/icons', iconRoutes)
```

`/api/icon-sets/*` 使用后台认证和权限校验。`/api/icons/:prefix.json` 保持运行时图标数据接口语义。

共享契约放在：

```text
packages/contracts/src/icons.ts
```

如果文件继续膨胀，实施时可拆成 `packages/contracts/src/icon-sets.ts` 并从 `index.ts` 导出。

## 权限资源

新增菜单资源：

- `内容管理 / 图标库`

新增权限码：

- `content:icon-set:list`
- `content:icon-set:create`
- `content:icon-set:update`
- `content:icon-set:delete`
- `content:icon-set:export`

权限码沿用内容管理菜单归属，数据库表和后端模块仍保持图标域命名。

## 错误处理

- prefix 无效：`400`。
- 自定义 prefix 与内置或已有自定义集合冲突：`409`。
- 自定义图标集不存在：`404`。
- 内置图标集在管理接口中不可写：不会提供写接口。
- 上传 SVG 无效、命名无效或超过限制：进入上传响应的 `failed`，不影响同批次其他文件。
- 重命名到已有图标名：`409`。
- 删除不存在的图标或集合：`404`。

## 测试计划

Contracts：

- prefix、图标名、分页查询、重复策略、创建/更新输入和响应结构。

Server：

- 创建自定义图标集。
- prefix 与内置图标集冲突时拒绝创建。
- prefix 与已有自定义图标集冲突时拒绝创建。
- 上传 SVG 成功创建图标。
- 重复名 `skip` 和 `replace` 行为。
- 无效 SVG 进入 `failed`。
- 重命名图标成功和冲突。
- 删除图标、删除集合。
- 导出标准 Iconify JSON，并设置下载响应头。
- `/api/icons/:prefix.json` 能返回自定义图标，内置图标仍保持可用。
- `/api/icons/search` 能搜索到自定义图标，响应结构保持兼容。
- 内置和自定义图标集列表、图标列表支持关键词和分页。

Client：

- 图标库页面 tab 切换。
- 内置图标搜索和固定网格渲染。
- 自定义图标集创建、编辑、删除。
- SVG 上传重复策略和结果汇总。
- 自定义图标重命名、删除。
- 导出按钮权限显示。

验证命令：

```bash
pnpm --filter @rev30/contracts test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
pnpm typecheck
pnpm lint:check
pnpm format:check
```

实现完成后视改动范围运行 `pnpm check`。

## 后续计划

- 将 `/api/icons/search` 升级为返回可渲染图标数据，或新增兼容字段 `body`、`width`、`height`。
- 调整 `ResourceIconPicker` 直接渲染搜索结果，减少二次运行时图标数据请求。
- 支持导入已有 Iconify JSON。
- 增加最近使用、收藏或业务侧推荐图标。
- 细化 SVG 颜色处理策略，覆盖灰色通用图标、单色品牌色图标等边界。

## 参考

- Iconify JSON 格式：https://iconify.design/docs/types/iconify-json.html
- Iconify 图标数据 API：https://iconify.design/docs/api/icon-data.html
- Iconify SVG 导入工具：https://iconify.design/docs/libraries/tools/import/svg.html
- Iconify JSON 导出工具：https://iconify.design/docs/libraries/tools/export/json.html
- Anthony Fu, Icons in Pure CSS：https://antfu.me/posts/icons-in-pure-css
