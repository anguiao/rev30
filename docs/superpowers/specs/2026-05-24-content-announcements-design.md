# 通知公告模块设计

## 背景

Rev30 现有后台管理能力已经包含系统管理相关模块：系统用户、组织部门、系统角色、权限资源、系统配置和数据字典。菜单、面包屑和按钮权限由服务端权限资源驱动，前端使用 Vue 3、Naive UI、Pinia Colada 和 Hono typed client，后端使用 Hono、Drizzle 和共享 zod schema。

本次新增“内容管理 - 通知公告”模块，定位为后台管理端使用的通知公告维护能力。首版不提供前台或业务侧公开读取接口，不承担站点首页展示、消息推送或站内信投递。

## 目标

- 新增顶级目录资源“内容管理”，其下新增“通知公告”菜单，路径为 `/content/announcements`。
- 支持通知公告的分页列表、新增、编辑、软删除。
- 支持生命周期：草稿、已发布、已下线。
- 支持保存草稿、保存并发布、列表发布、列表下线。
- 使用 Tiptap 作为富文本编辑器。
- 正文以 Tiptap JSON 作为唯一事实来源存储，并派生纯文本用于搜索和空正文校验。
- 支持内置类型：通知、公告。
- 支持置顶，但不提供独立排序字段。
- 通过共享 zod schema 在前后端复用输入、响应和查询约束。
- 沿用现有按钮权限模型：`content:announcement:list/create/update/delete`。

## 非目标

本轮不实现：

- 前台或业务侧公开公告读取接口。
- 定时发布、发布任务调度、待发布状态或失败补偿。
- 图片、附件上传和文件资源管理。
- 富文本表格、视频嵌入、HTML 源码编辑。
- 公告阅读确认、已读未读统计、消息推送或站内信投递。
- 变更历史、审计详情、发布审批、多语言公告。
- 公告分类管理表；首版只使用内置类型枚举。
- 单独的排序字段；首版只支持置顶。

## 模块边界

后端新增内容管理模块，建议挂载到 `/api/content`，通知公告子模块挂载到 `/api/content/announcements`。不要把通知公告放入现有 `/api/system`，以保持系统管理和内容管理边界清晰。

前端新增页面：

- `apps/client/src/pages/index/content/announcements.vue`

前端新增 feature 目录：

- `apps/client/src/features/content`

该目录放置通知公告请求封装、标签映射、Tiptap 富文本编辑器封装和表单抽屉。它与现有 `features/system` 保持同级，避免内容管理逻辑混入系统管理模块。

## 权限资源

新增顶级目录资源：

- `name`: `内容管理`
- `code`: `content`
- `type`: `directory`
- `path`: `null`
- `icon`: `lucide:layout-list`
- `sortOrder`: `100`

新增菜单资源：

- `name`: `通知公告`
- `code`: `content:announcement`
- `type`: `menu`
- `path`: `/content/announcements`
- `icon`: `lucide:megaphone`
- `sortOrder`: `10`

新增操作资源：

- `content:announcement:list`
- `content:announcement:create`
- `content:announcement:update`
- `content:announcement:delete`

菜单资源归属于 `content` 目录。操作资源归属于 `content:announcement` 菜单。迁移沿用现有 `system_resources` 的 upsert 模式，并在资源已软删除时恢复 `deleted_at = NULL`。

## 数据模型

新增表 `content_announcements`。API 使用 camelCase，数据库使用 snake_case。

| API 字段 | 数据库字段 | 说明 |
| --- | --- | --- |
| `id` | `id` | UUID 主键。 |
| `type` | `type` | 内置类型：`notice` 通知、`announcement` 公告。 |
| `title` | `title` | 标题，必填。 |
| `summary` | `summary` | 摘要，可为空；列表展示用。 |
| `contentJson` | `content_json` | Tiptap JSON，正文唯一事实来源。 |
| `contentText` | `content_text` | 从 Tiptap JSON 派生的纯文本，用于关键词搜索和空正文校验。 |
| `status` | `status` | 生命周期状态：`draft`、`published`、`archived`。 |
| `pinned` | `pinned` | 是否置顶。 |
| `publishedAt` | `published_at` | 发布时间；发布时写入。 |
| `createdAt` | `created_at` | 创建时间。 |
| `updatedAt` | `updated_at` | 更新时间。 |
| `deletedAt` | `deleted_at` | 软删除时间。 |

建议数据库类型：

- `id`: `uuid primary key`
- `type`: `text not null`
- `title`: `text not null`
- `summary`: `text`
- `content_json`: `jsonb not null`
- `content_text`: `text not null`
- `status`: `text not null default 'draft'`
- `pinned`: `boolean not null default false`
- `published_at`: `timestamp with time zone`
- 审计字段沿用现有 `created_at`、`updated_at`、`deleted_at`

建议索引：

- `content_announcements_type_idx` on `type`
- `content_announcements_status_idx` on `status`
- `content_announcements_pinned_idx` on `pinned`
- `content_announcements_published_at_idx` on `published_at`

列表默认排序：

1. `pinned DESC`
2. `publishedAt DESC NULLS LAST`
3. `updatedAt DESC`

草稿没有 `publishedAt`，排序主要由 `updatedAt` 辅助。

## 生命周期

状态常量：

- `ANNOUNCEMENT_STATUS_DRAFT = 'draft'`
- `ANNOUNCEMENT_STATUS_PUBLISHED = 'published'`
- `ANNOUNCEMENT_STATUS_ARCHIVED = 'archived'`

状态含义：

- `draft`: 草稿，尚未发布。
- `published`: 已发布，后台认为当前公告有效。
- `archived`: 已下线，保留历史发布时间和内容。

创建规则：

- 新增默认保存为草稿。
- 新增支持“保存并发布”，直接保存为 `published`，并将 `publishedAt` 设置为当前时间。

编辑规则：

- 已发布公告允许直接编辑内容，编辑不会自动下线。
- 编辑时可以保存当前字段，也可以“保存并发布”。
- “保存并发布”会将状态设置为 `published`，并将 `publishedAt` 更新为当前时间。

发布规则：

- 草稿或已下线公告可以发布。
- 发布时状态改为 `published`。
- 发布时 `publishedAt` 更新为当前时间；重新发布会刷新发布时间。

下线规则：

- 已发布公告可以下线。
- 下线时状态改为 `archived`。
- 下线不清空 `publishedAt`。

删除规则：

- 删除为软删除，设置 `deletedAt` 和 `updatedAt`。
- 已软删除公告不再出现在列表和详情中。

## 富文本设计

富文本使用 Tiptap，前端封装项目内组件：

- `apps/client/src/features/content/RichTextEditor.vue`

组件职责：

- 初始化 Tiptap editor。
- 接收和输出 Tiptap JSON。
- 使用 Naive UI 按钮和 Iconify 原子类渲染工具栏。
- 支持禁用态、错误态和基础高度控制。
- 在组件卸载时销毁 editor。

首版支持能力：

- 段落
- 标题
- 加粗
- 斜体
- 下划线
- 有序列表
- 无序列表
- 引用
- 分割线
- 链接
- 撤销、重做

首版不支持：

- 图片上传
- 附件上传
- 表格
- 视频嵌入
- HTML 源码编辑

存储规则：

- 前端提交 `contentJson`。
- 前端不提交 `contentHtml`。
- 前端可以使用 Tiptap editor 实例的 `getText()` 做即时空正文提示，但该结果只用于交互反馈。
- 后端保存时从 `contentJson` 派生权威 `contentText`。
- 数据库不保存 HTML。
- 因首版没有 HTML 输入和公开 HTML 输出边界，服务端暂不引入 HTML sanitizer。
- 后续如果新增 HTML 展示、HTML 派生字段或 HTML 导入，再引入 DOMPurify 或 isomorphic-dompurify。

## Tiptap JSON 约束

共享 zod schema 只做轻量边界校验，确认 `contentJson` 是对象且根节点 `type` 为 `doc`。完整文档结构校验由服务端通过 Tiptap/ProseMirror schema 完成。

服务端新增 Tiptap 内容工具：

- 使用 `@tiptap/core` 的 `getSchema()` 根据本模块启用的扩展生成 ProseMirror schema。
- 使用 ProseMirror document model 将 `contentJson` 转为 schema-aware document node。
- 使用 document node 的 `textBetween(0, doc.content.size, '\n\n')` 派生纯文本。
- 解析或 schema 校验失败时返回字段级错误 `field: 'contentJson'`，消息为 `公告正文格式无效`。

派生规则：

- 段落、标题、列表项等块节点之间使用空行分隔，确保搜索文本可读。
- `contentText.trim()` 为空时拒绝保存，返回字段级错误 `field: 'contentJson'`，消息为 `请输入公告正文`。

不要手写递归提取正文文本。Tiptap 的 editor 实例提供 `getText()`，服务端应使用同一套 Tiptap/ProseMirror schema 和成熟文档模型完成 JSON 校验与文本派生。

## 校验规则

类型：

- `type` 只能是 `notice` 或 `announcement`。

标题：

- trim 后必填。
- 最长 100 字符。

摘要：

- 可为空。
- trim 后空字符串规范化为 `null`。
- 最长 300 字符。

正文：

- `contentJson` 必须是 Tiptap doc 对象，并能通过本模块启用扩展生成的 ProseMirror schema 解析。
- 派生后的 `contentText.trim()` 必须非空。
- `contentText` 最长 20,000 字符。

状态：

- 只能是 `draft`、`published`、`archived`。
- 创建接口支持草稿或直接发布。
- 更新接口不把状态当作普通字段随意修改；状态变更通过保存并发布、发布、下线动作完成。

置顶：

- `pinned` 为布尔值，默认 `false`。

## Shared Schema 设计

新增文件：

- `packages/shared/src/schemas/content/announcements.ts`
- `packages/shared/src/schemas/content/index.ts`

同时修改 `packages/shared/src/schemas/index.ts`，从 `./content` 导出内容管理 schema。包入口 `packages/shared/src/index.ts` 已导出 `./schemas`，不需要额外改动。

核心常量和类型：

- `ANNOUNCEMENT_TYPE_NOTICE = 'notice'`
- `ANNOUNCEMENT_TYPE_ANNOUNCEMENT = 'announcement'`
- `ANNOUNCEMENT_STATUS_DRAFT = 'draft'`
- `ANNOUNCEMENT_STATUS_PUBLISHED = 'published'`
- `ANNOUNCEMENT_STATUS_ARCHIVED = 'archived'`
- `AnnouncementType`
- `AnnouncementStatus`
- `Announcement`
- `AnnouncementListItem`
- `AnnouncementListQuery`
- `AnnouncementListResponse`
- `AnnouncementCreateInput`
- `AnnouncementUpdateInput`

响应结构：

```ts
type Announcement = {
  id: string
  type: AnnouncementType
  title: string
  summary: string | null
  contentJson: TiptapDocument
  contentText: string
  status: AnnouncementStatus
  pinned: boolean
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

type AnnouncementListItem = Omit<Announcement, 'contentJson' | 'contentText'>

type AnnouncementListResponse = {
  list: AnnouncementListItem[]
  total: number
  page: number
  pageSize: number
}
```

创建输入：

```ts
type AnnouncementCreateInput = {
  type: AnnouncementType
  title: string
  summary?: string | null
  contentJson: TiptapDocument
  pinned?: boolean
  publish?: boolean
}
```

更新输入：

```ts
type AnnouncementUpdateInput = {
  type?: AnnouncementType
  title?: string
  summary?: string | null
  contentJson?: TiptapDocument
  pinned?: boolean
  publish?: boolean
}
```

列表查询：

```ts
type AnnouncementListQuery = {
  page: number
  pageSize: number
  keyword?: string
  type?: AnnouncementType
  status?: AnnouncementStatus
  pinned?: boolean
}
```

## 服务端接口

新增后端模块：

- `apps/server/src/modules/content/announcements`

新增内容管理路由聚合：

- `apps/server/src/modules/content/routes.ts`

并在 `apps/server/src/app.ts` 挂载 `/api/content`。

### 接口列表

| 方法 | 路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/api/content/announcements` | `content:announcement:list` | 分页查询通知公告。 |
| `GET` | `/api/content/announcements/:id` | `content:announcement:list` | 获取通知公告详情。 |
| `POST` | `/api/content/announcements` | `content:announcement:create` | 新增通知公告，可草稿或直接发布。 |
| `PATCH` | `/api/content/announcements/:id` | `content:announcement:update` | 编辑通知公告基本信息和正文。 |
| `POST` | `/api/content/announcements/:id/publish` | `content:announcement:update` | 立即发布。 |
| `POST` | `/api/content/announcements/:id/archive` | `content:announcement:update` | 下线。 |
| `DELETE` | `/api/content/announcements/:id` | `content:announcement:delete` | 软删除通知公告。 |

### 列表查询

查询参数：

| 参数 | 说明 |
| --- | --- |
| `page` / `pageSize` | 沿用现有分页规则。 |
| `keyword` | 匹配 `title`、`summary`、`contentText`。 |
| `type` | 按类型筛选。 |
| `status` | 按生命周期状态筛选。 |
| `pinned` | 按置顶状态筛选。 |

列表响应不返回 `contentJson`，避免列表接口携带完整富文本文档。详情接口返回完整 `contentJson`。

### 创建

`POST /api/content/announcements`

- `publish` 为 `true` 时，创建为 `published` 并设置 `publishedAt = now`。
- `publish` 不是 `true` 时，创建为 `draft`，`publishedAt = null`。
- 后端从 `contentJson` 派生 `contentText`。
- 创建成功返回完整 `Announcement`，状态码 `201`。

### 更新

`PATCH /api/content/announcements/:id`

- 公告不存在或已软删除时返回 `404 通知公告不存在`。
- 更新 `type`、`title`、`summary`、`contentJson`、`pinned`。
- 如果提交 `contentJson`，后端重新派生 `contentText`。
- `publish` 为 `true` 时同时发布，状态设为 `published`，`publishedAt = now`。
- 不提交任何可更新字段时返回 `400 至少修改一个字段`。
- 更新成功返回完整 `Announcement`。

### 发布

`POST /api/content/announcements/:id/publish`

- 草稿或已下线公告可以发布。
- 已发布公告再次发布仍成功，并刷新 `publishedAt` 为当前时间。
- 发布成功返回完整 `Announcement`。

### 下线

`POST /api/content/announcements/:id/archive`

- 已发布公告可以下线。
- 草稿下线没有业务意义，返回 `400 草稿公告不能下线`。
- 已下线公告重复下线可以保持幂等，返回当前公告。
- 下线成功返回完整 `Announcement`。

### 删除

`DELETE /api/content/announcements/:id`

- 公告不存在或已软删除时返回 `404 通知公告不存在`。
- 成功后返回 `204 No Content`。

### 错误语义

- ID 不合法：`400 通知公告 ID 无效`。
- 查询参数不合法：`400 查询参数无效`。
- 请求体不符合 schema：`400 请求体无效`。
- 正文为空：`400`，响应包含 `field: 'contentJson'` 和 `message: '请输入公告正文'`。
- 公告不存在：`404 通知公告不存在`。
- 草稿公告不能下线：`400 草稿公告不能下线`。
- 公告正文格式无效：`400`，响应包含 `field: 'contentJson'` 和 `message: '公告正文格式无效'`。

## 服务端文件职责

新增：

- `apps/server/src/modules/content/routes.ts`：内容管理路由聚合。
- `apps/server/src/modules/content/announcements/routes.ts`：Hono 路由、权限检查、请求校验和错误映射。
- `apps/server/src/modules/content/announcements/service.ts`：生命周期规则、正文纯文本派生、发布下线语义。
- `apps/server/src/modules/content/announcements/repository.ts`：Drizzle 查询和持久化。
- `apps/server/src/modules/content/announcements/mapper.ts`：数据库行到 API 对象的映射。
- `apps/server/src/modules/content/announcements/errors.ts`：通知公告模块领域错误。
- `apps/server/src/modules/content/announcements/content.ts`：Tiptap/ProseMirror schema 构建、JSON 解析和纯文本派生辅助函数。

## 前端请求

新增：

- `apps/client/src/features/content/requests.ts`

请求函数：

- `listAnnouncements(query)`
- `getAnnouncement(id)`
- `createAnnouncement(input)`
- `updateAnnouncement(id, input)`
- `publishAnnouncement(id)`
- `archiveAnnouncement(id)`
- `deleteAnnouncement(id)`

错误解析可复用 `features/system/requests.ts` 的结构，但内容模块应有自己的 `ContentRequestError`，避免命名和职责都绑定在 system feature 上。

## 前端标签和选项

新增：

- `apps/client/src/features/content/labels.ts`

包含：

- 类型标签：`notice` -> `通知`，`announcement` -> `公告`
- 状态标签：`draft` -> `草稿`，`published` -> `已发布`，`archived` -> `已下线`
- 状态 tag 类型：草稿 `default`，已发布 `success`，已下线 `warning`
- 类型筛选选项
- 状态筛选选项
- 置顶筛选选项：全部、置顶、未置顶
- 日期时间格式化可复用或抽出通用工具；若只在内容模块使用，先放在 content labels 中。

## 前端页面

新增页面：

- `apps/client/src/pages/index/content/announcements.vue`

页面结构：

- 顶部显示标题“通知公告”和总数。
- 右上角显示“新增通知公告”按钮，受 `content:announcement:create` 控制。
- 筛选区包含：
  - 关键词
  - 类型
  - 状态
  - 置顶
- 表格列包含：
  - 标题
  - 类型
  - 状态
  - 置顶
  - 摘要
  - 发布时间
  - 更新时间
  - 操作

操作权限：

- 编辑按钮需要 `content:announcement:update` 和 `content:announcement:list`。
- 发布按钮需要 `content:announcement:update`。
- 下线按钮需要 `content:announcement:update`。
- 删除按钮需要 `content:announcement:delete`。

操作显示规则：

- 草稿：显示编辑、发布、删除。
- 已发布：显示编辑、下线、删除。
- 已下线：显示编辑、发布、删除。

交互规则：

- 发布使用确认弹窗，成功后提示并刷新列表。
- 下线使用确认弹窗，成功后提示并刷新列表。
- 删除使用确认弹窗，成功后提示并刷新列表。
- 筛选重置不重复触发同一个查询缓存请求，沿用现有页面处理方式。

## 表单抽屉

新增：

- `apps/client/src/features/content/AnnouncementFormDrawer.vue`

字段：

- 类型
- 标题
- 摘要
- 是否置顶
- 富文本正文

按钮：

- 新增时：保存草稿、保存并发布、取消。
- 编辑时：保存、保存并发布、取消。

表单行为：

- 新增时默认类型为 `notice`，状态为草稿，置顶为 `false`。
- 编辑时通过详情接口回填完整 `contentJson`。
- 保存草稿提交 `publish: false` 或不提交 `publish`。
- 保存并发布提交 `publish: true`。
- 保存成功后关闭抽屉，页面提示成功并刷新列表。
- 后端字段级错误 `field: 'contentJson'` 显示到富文本正文表单项。
- 打开不同公告或新建时清理旧的字段级错误，避免旧会话错误残留。

## 富文本编辑器组件

新增：

- `apps/client/src/features/content/RichTextEditor.vue`

建议 props：

- `modelValue`: Tiptap JSON
- `disabled?: boolean`
- `placeholder?: string`
- `minHeight?: number`

建议 emits：

- `update:modelValue`
- `blur`

设计要点：

- 使用 `@tiptap/vue-3` 的 `useEditor` 和 `EditorContent`。
- 使用 `@tiptap/starter-kit` 和必要扩展。
- 工具栏按钮使用 Naive UI `NButton` 或 `NButtonGroup`。
- 图标使用 Iconify 原子类。
- 编辑器内容变化时 emit 最新 JSON。
- 外部 `modelValue` 变化时同步到 editor，但避免在同一次 editor update 中循环 setContent。
- 在测试环境中可以 stub 该组件，页面和抽屉测试关注 payload；组件自身用轻量测试覆盖 `modelValue` 同步。

## 客户端依赖

新增依赖建议：

客户端：

- `@tiptap/vue-3`
- `@tiptap/starter-kit`
- `@tiptap/extension-underline`
- `@tiptap/extension-link`

服务端：

- `@tiptap/core`
- `@tiptap/starter-kit`
- `@tiptap/extension-underline`
- `@tiptap/extension-link`
- `@tiptap/pm`

如果 StarterKit 已包含某项能力，则不重复引入等效扩展。依赖安装使用 pnpm，并保持 workspace 约定。

## README 更新

由于本次新增用户可见模块和新的业务目录，按需更新 `README.md`：

- `apps/server` 描述加入内容管理和通知公告接口。
- `apps/client` 描述加入内容管理和通知公告页面。
- 当前项目进度加入后台通知公告管理能力。

## 测试策略

### 共享 schema

覆盖：

- 公告类型只允许 `notice` 和 `announcement`。
- 公告状态只允许 `draft`、`published`、`archived`。
- 创建 schema 校验标题、正文、类型。
- 更新 schema 至少包含一个可更新字段或 `publish`。
- 列表查询支持分页、关键词、类型、状态、置顶。
- Tiptap JSON 轻量 shape 校验。
- 空正文被拒绝。
- 摘要长度限制。

### 服务端

覆盖：

- 路由权限：`list/create/update/delete` 分别要求对应 access code。
- 创建草稿成功。
- 创建并发布成功，写入 `publishedAt`。
- 列表不返回 `contentJson`，详情返回 `contentJson`。
- 编辑公告并重新派生 `contentText`。
- `contentText` 由 Tiptap/ProseMirror schema-aware document node 派生，不手写递归遍历。
- 保存并发布会刷新 `publishedAt`。
- 发布草稿和已下线公告成功。
- 下线已发布公告成功，保留 `publishedAt`。
- 草稿下线返回 `400 草稿公告不能下线`。
- 删除是软删除，删除后的公告不再出现在列表里。
- 关键词匹配标题、摘要、正文纯文本。
- 默认排序按置顶、发布时间、更新时间。
- 正文为空返回字段级错误。
- 不存在返回 `404 通知公告不存在`。

### 前端

覆盖：

- 页面加载并展示通知公告列表、筛选和分页。
- 关键词、类型、状态、置顶筛选提交正确查询参数。
- 重置筛选恢复默认查询。
- 新增、编辑、发布、下线、删除按钮按权限显示。
- 行操作按状态显示：草稿显示发布，已发布显示下线，已下线显示发布。
- 打开新增和编辑抽屉。
- 抽屉保存草稿提交正确 payload。
- 抽屉保存并发布提交 `publish: true`。
- 发布、下线、删除确认后调用对应请求并刷新列表。
- 富文本正文字段级错误显示到正文表单项。
- 旧会话字段错误不会残留到新打开的抽屉。
- `RichTextEditor` 组件同步 `modelValue` 和 emit 更新。

## 后期计划

后续可独立设计和实现：

- 定时发布：增加 `scheduledPublishAt`、待发布状态、任务调度和失败补偿。
- 前台或业务侧读取接口：提供已发布公告列表和详情，并决定 HTML 渲染策略。
- 服务端 HTML 派生：从 Tiptap JSON 生成清洗后的 HTML，配合 DOMPurify 或 isomorphic-dompurify。
- 图片和附件上传：在完成文件资源模块后接入富文本图片、附件能力。
- 富文本编辑器增强与独立化：进一步完善工具栏、快捷键、粘贴清洗、内容块、扩展配置和编辑体验；能力稳定后提取为可复用的独立子项目。
- 公告分类管理：当类型超过内置枚举承载范围时，改为数据字典或独立分类表。
- 阅读确认和已读统计：面向组织、角色或用户维度扩展。

## 验证

开发中按需运行相关测试：

```bash
pnpm --filter @rev30/shared test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
pnpm typecheck
pnpm lint:check
pnpm format:check
```

完成前运行完整验证：

```bash
pnpm check
```
