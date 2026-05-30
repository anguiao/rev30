# 用户头像与附件资源设计

## 背景

通用附件上传后端已经具备上传、元数据读取、签发短期读取 URL、文件内容读取和软删除能力。前端目前只有最小请求接入，还没有用户可见的附件展示能力。

本次通过“用户头像”补齐上传到回显的完整链路，并在内容管理下新增通用附件管理页面。头像是第一个真实业务引用场景，但附件资源页仍然面向所有上传用途，不做成头像专页。

## 目标

- 用户模型新增头像引用字段 `avatarId`，前后端统一返回和提交。
- “系统管理 - 系统用户”在创建和编辑用户时都支持上传头像。
- “个人设置”支持当前用户上传头像，并纳入个人信息表单统一保存。
- 系统用户列表、用户表单、个人设置和后台侧边栏都能回显头像。
- 无头像、头像签名失败或图片加载失败时显示统一默认姓名头像。
- “内容管理”新增“附件资源”菜单，展示所有附件并支持删除。
- 附件资源页不提供手动上传入口，只管理已有附件。
- 附件删除只软删除附件，不反向修改头像、富文本或未来其它业务引用。
- 操作权限明确归属于附件资源菜单：`content:attachment:list` 和 `content:attachment:delete`。

## 非目标

本阶段不实现：

- 头像裁剪。
- 前端图片压缩。
- 头像移除按钮。
- 创建或编辑用户取消时自动删除已上传但未引用的头像附件。
- 未引用附件自动清理。
- 通用附件引用关系表。
- 删除附件时反向清理业务引用。
- 富文本图片引用管理。
- 对象存储迁移。
- 附件批量删除、下载、重命名、替换或详情抽屉。

## 总体方案

采用“用户保存头像附件 ID + 通用附件资源页”的方案。

用户表保存 `avatar_id`，API 暴露为 `avatarId`。头像上传仍复用通用附件接口：

```txt
POST /api/attachments?usage=avatar
```

上传成功后前端拿到附件 ID，并写入当前表单字段。真正更新用户头像发生在用户创建、用户编辑或个人资料保存时，而不是上传完成时直接写用户记录。

头像读取仍走短期签名 URL：

```txt
user.avatarId
-> POST /api/attachments/:id/signed-url { disposition: "inline" }
-> <img src="/api/attachments/:id/content?token=...">
```

如果 `avatarId` 为空、签名失败、附件已删除或图片加载失败，头像组件显示默认姓名头像。

## 数据模型

`system_users` 新增字段：

```txt
avatar_id uuid null references attachments(id)
```

字段含义：

- `avatar_id` 指向 `attachments.id`。
- API 字段为 `avatarId`。
- `avatarId` 是头像附件 ID，不代表独立头像表。
- 创建用户时可直接设置 `avatarId`。
- 更新用户和个人资料时可修改 `avatarId`。
- 删除附件不会清空 `avatarId`。

用户响应新增字段：

```ts
avatarId: string | null
```

影响的响应包括：

- `User`
- `UserListItem`
- `UserCreateResponse.user`
- 登录、刷新和 `/api/auth/me` 返回的当前用户
- `/api/auth/me/profile` 更新后的当前用户

## 共享契约

`packages/contracts/src/system/users.ts`：

- `userSchema` 增加 `avatarId: z.uuid().nullable()`。
- `userFormSchema` 增加 `avatarId`。
- `userCreateSchema` 允许创建用户时提交 `avatarId`。
- `userUpdateSchema` 允许更新用户时提交 `avatarId`。

`packages/contracts/src/auth.ts`：

- `authProfileUpdateSchema` 增加 `avatarId`。

头像字段采用 nullable，而不是 optional。表单和响应都使用明确的 `null` 表示没有头像。

## 后端设计

### 用户模块

用户 mapper 将 `system_users.avatar_id` 映射为 `avatarId`。

用户 repository 的 create/update/profile update 写入 `avatarId` 时落到 `avatar_id`。头像字段和昵称、邮箱、手机号一样属于用户资料的一部分。

系统用户接口：

```txt
POST /api/system/users
PATCH /api/system/users/:id
```

都接受 `avatarId`。

个人资料接口：

```txt
PATCH /api/auth/me/profile
```

接受 `avatarId`，并返回更新后的 `User`。

第一版不强制校验 `avatarId` 对应附件必须未删除，或 usage 必须为 `avatar`。原因是附件删除后允许业务保留历史引用，头像组件会在读取失败时回退默认态。上传入口会使用 `usage=avatar` 保证正常路径的用途正确。

`avatarId` 仍然必须指向一条存在的附件记录，包括已软删除记录。用户创建、用户编辑和个人资料更新收到不存在的 `avatarId` 时返回字段级边界错误，避免数据库外键冲突暴露为 500。

### 附件资源接口

现有附件元数据读取和删除接口继续复用：

```txt
GET /api/attachments/:id
DELETE /api/attachments/:id
```

新增分页列表能力：

```txt
GET /api/attachments?page=1&pageSize=20&usage=avatar&keyword=ada
```

查询参数：

- `page`：页码，默认 `1`。
- `pageSize`：每页数量，默认 `20`。
- `usage`：可选，按附件用途筛选。
- `keyword`：可选，匹配原始文件名、MIME 或扩展名。

响应字段：

```ts
{
  list: Array<{
    id: string
    originalName: string
    mimeType: string
    extension: string
    size: number
    usage: "general" | "avatar" | "rich-text"
    createdBy: {
      id: string
      username: string
      nickname: string
    }
    createdAt: string
  }>
  total: number
  page: number
  pageSize: number
}
```

列表只返回 `deleted_at IS NULL` 的附件。

删除附件仍然是软删除：

```txt
UPDATE attachments SET deleted_at = now() WHERE id = :id AND deleted_at IS NULL
```

删除附件不反向清空 `system_users.avatar_id`，也不修改未来的富文本或其它业务原始数据。

## 删除语义

附件资源是独立资源。删除附件表示该资源不可再读取，而不是修改曾经引用它的业务数据。

这条规则带来的行为：

- 附件资源页可以删除任意附件。
- 用户的 `avatarId` 可能指向已删除附件。
- `POST /api/attachments/:id/signed-url` 对已删除附件返回 404。
- 前端头像组件遇到 404 或图片加载失败时显示默认姓名头像。
- 用户上传新头像并保存后，`avatarId` 被新的附件 ID 覆盖。
- 未来富文本图片也遵循同一资源语义：删除附件不会偷偷改正文 JSON 或 HTML 派生内容。

这不是完美引用完整性模型，但它保持了附件管理与业务数据之间的边界，避免附件模块反向理解所有业务模块。

## 权限资源

内容管理下新增菜单：

- 名称：`附件资源`
- 编码：`content:attachment`
- 类型：`menu`
- 路径：`/content/attachments`
- 图标：`lucide:files`
- 排序：位于通知公告之后

操作权限：

- `content:attachment:list`
- `content:attachment:delete`

权限资源挂在 `content:attachment` 菜单下。附件资源页的删除按钮使用 `content:attachment:delete` 控制。列表页访问由菜单和 `content:attachment:list` 控制。

## 依赖变更

附件资源页需要在客户端格式化文件大小。为保持前后端展示一致，客户端新增 `bytes` 运行依赖和 `@types/bytes` 开发依赖：

```txt
apps/client/package.json
- bytes
- @types/bytes
```

本阶段不新增头像裁剪、图片压缩或图片编辑相关依赖。

## 前端组件

### `UserAvatar`

基于 Naive UI `NAvatar` 封装。

职责：

- 传入 `avatarId`、`nickname`、`username` 和尺寸。
- 有头像时通过 `useAttachmentUrl(avatarId, { disposition: "inline" })` 获取图片 URL。
- `NAvatar` 的图片加载失败时切回默认姓名头像。
- 签名 URL 获取失败时切回默认姓名头像。
- 没有头像时显示默认姓名头像。

默认姓名头像规则：

- 优先使用 `nickname` 的第一个字符。
- `nickname` 为空时使用 `username` 的第一个字符。
- 仍为空时显示 `?`。
- 显示为圆形头像，背景使用主题浅色，文字使用主色。

`UserAvatar` 不处理上传，不弹错误消息。头像加载失败属于可恢复展示状态。

### `UserAvatarUpload`

基于 Naive UI `NUpload` 封装。

职责：

- 将头像区域整体作为上传触发器，视觉上保持一个明确的可点击头像位。
- 空状态和头像加载失败状态统一呈现为居中的 `i-[lucide--plus]`，表达“添加头像”，不复用姓名头像默认态。
- 当前头像可用时直接展示图片；hover 时叠加轻微遮罩和 `i-[lucide--plus]`，表达“替换头像”。
- 上传提示不显示可见文字；通过 `aria-label` 和 `title` 保留可访问名称。
- 上传使用 `uploadAttachment(file, { usage: ATTACHMENT_USAGE_AVATAR })`。
- 上传成功后 emit 新的附件 ID。
- 上传失败时 emit 错误事件，由所在页面根据上下文展示提示文案。
- 不提供移除按钮。

表单和个人设置中的头像尺寸使用约 `80px`。侧边栏使用较小尺寸。

## 系统用户页面

### 列表

系统用户列表不新增单独头像列。用户名列改为头像 + 文本组合：

- 左侧小头像。
- 右侧显示用户名，昵称仍保留在昵称列或在文本组合中按现有表格密度调整。
- 头像失败时显示默认姓名头像。

### 用户表单

`UserFormDrawer` 创建和编辑共用头像能力。

表单默认值新增：

```ts
avatarId: null
```

创建模式：

- 用户名和昵称字段位于左侧。
- `UserAvatarUpload` 位于用户名/昵称右侧。
- `UserAvatarUpload` 上传成功后只更新表单字段 `avatarId`。
- 提交创建用户时带上 `avatarId`。
- 取消或提交失败不会删除已上传附件。

编辑模式：

- 加载用户详情时带出 `avatarId`。
- `UserAvatarUpload` 上传成功后只更新表单字段 `avatarId`。
- 提交保存后更新用户 `avatarId`。
- 旧头像附件不自动删除。

## 个人设置

个人信息表单新增 `avatarId`。

布局：

- 用户名和昵称位于左侧。
- `UserAvatarUpload` 位于用户名/昵称右侧。
- 不提供移除头像按钮。
- `UserAvatarUpload` 上传成功后更新表单字段 `avatarId`，点击“保存信息”时与昵称、邮箱、手机号一起提交。

保存成功后：

- 使用返回的 `User` 更新 auth store。
- 侧边栏立即回显新头像。
- 表单重置为最新用户资料。

## 侧边栏用户区

展开态：

- 显示头像、昵称和用户名。
- 头像位于昵称/用户名左侧。
- 原有主题、通知公告、个人设置和退出登录入口保留。

折叠态：

- 用户头像显示在用户操作区最上方。
- 头像使用 `title` 暴露昵称，便于 hover 查看。
- 头像本身不承担跳转；个人设置仍由设置按钮进入。

## 附件资源页面

新增页面：

```txt
apps/client/src/pages/index/content/attachments.vue
```

页面能力：

- 展示所有未删除附件。
- 支持用途筛选。
- 支持关键词搜索。
- 支持分页。
- 支持删除确认。
- 不提供上传入口。
- 文件大小展示使用 `bytes` 包，和后端上传限制文案保持同一套格式化规则。

表格字段：

- 预览：图片用途或图片 MIME 显示缩略图；其它附件显示文件图标。
- 文件名：`originalName`。
- 用途：`usage` 标签。
- 类型：`mimeType`。
- 大小：使用 `bytes` 与后端一致地格式化。
- 上传人：`createdBy.nickname` 和 `createdBy.username`。
- 创建时间：格式化时间。
- 操作：删除。

删除成功后刷新列表。删除失败显示附件模块错误消息。

## 错误处理

只在边界处理必要错误：

- 上传失败：调用页面显示消息。
- 头像签名 URL 失败：`UserAvatar` 回退默认姓名头像。
- 图片加载失败：`UserAvatar` 回退默认姓名头像。
- 附件资源列表加载失败：页面显示错误 Alert。
- 附件删除失败：保留确认弹窗并显示错误消息。

不为头像读取失败增加全局错误提示，避免已删除头像附件造成噪音。

## 测试设计

共享契约测试：

- `User` schema 接受 `avatarId: null` 和合法 UUID。
- 用户创建、更新和个人资料更新 schema 接受 `avatarId`。
- 附件列表 schema 接受 createdBy、usage、分页字段。

服务端测试：

- migration/schema 包含 `system_users.avatar_id`。
- 创建用户可保存 `avatarId`。
- 更新用户可修改 `avatarId`。
- 个人资料更新可修改当前用户 `avatarId`。
- 用户列表、详情和 auth session 返回 `avatarId`。
- 附件列表支持分页、用途筛选和关键词搜索。
- 附件列表返回上传人摘要。
- 删除附件后不清空用户 `avatarId`。
- 已删除附件不再出现在附件列表中，签名 URL 返回 404。
- 附件资源列表和删除权限分别使用 `content:attachment:list`、`content:attachment:delete`。

前端测试：

- `UserAvatar` 无头像时显示默认姓名头像。
- `UserAvatar` 有头像时请求 inline signed URL 并渲染图片。
- `UserAvatar` 在签名失败或图片 load error 后显示默认姓名头像。
- `UserAvatarUpload` 上传 avatar usage，并 emit 新附件 ID。
- `UserAvatarUpload` 无头像或头像加载失败时显示 plus 图标，不显示姓名头像。
- `UserAvatarUpload` 有头像时显示图片，并在 hover 态暴露 plus 图标遮罩。
- `UserFormDrawer` 创建模式上传头像后提交 `avatarId`。
- `UserFormDrawer` 编辑模式加载和更新 `avatarId`。
- 个人设置上传头像后随个人信息一起保存，并更新 auth store。
- 侧边栏展开和折叠态显示头像。
- 附件资源页加载列表、筛选用途、搜索、用 `bytes` 格式化文件大小和删除。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/contracts test
pnpm --filter @rev30/server test -- modules/system/users modules/auth modules/attachments
pnpm --filter @rev30/client test -- features/system features/attachments pages/system/users pages/account/settings pages/content/attachments
pnpm typecheck
pnpm lint:check
```

最终按情况运行完整验证：

```bash
pnpm check
```

## 后续计划

- 头像裁剪。
- 前端图片压缩。
- 未引用附件自动清理策略。
- 富文本图片上传和渲染中的缺失资源占位。
- 对象存储或兼容 S3/R2/MinIO 的存储实现。
- 附件批量操作。
