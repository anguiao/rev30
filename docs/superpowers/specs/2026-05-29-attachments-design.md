# 通用附件上传设计

## 背景

当前项目还没有通用附件能力。后续用户头像、富文本图片、PDF 或其它后台附件都需要上传、存储、读取和删除文件。如果每个业务模块各自实现上传，会重复处理鉴权、类型校验、存储路径、访问 URL 和安全响应头。

本阶段新增一个通用附件模块。它面向中后台内部使用，附件默认私有，不提供永久公开 URL。业务表只保存稳定的 `attachmentId`；需要预览或下载时，前端临时换取短期签名 URL，再交给浏览器加载。

## 目标

- 新增通用附件 API，支持上传、读取元数据、签发短期读取 URL、读取文件内容和删除附件。
- 文件存储通过接口抽象，第一版使用本地文件系统实现，并为以后迁移对象存储保留边界。
- 本地文件按日期分层存储，避免单目录文件过多。
- 上传校验基于服务端检测，不信任浏览器传来的 `File.type`。
- 头像、富文本图片、PDF 预览和普通下载复用同一套 `attachmentId -> signed URL -> content` 读取链路。
- 前端提供轻量请求函数和 `useAttachmentUrl` composable，方便头像、富文本和预览场景复用。
- 第一版只允许栅格图片和 PDF inline 预览，其它类型即使请求 inline 也强制下载。

## 非目标

本阶段不实现：

- 附件管理后台页面。
- 业务引用关系追踪。
- 自动垃圾回收未引用附件。
- 多文件批量上传。
- 断点续传、分片上传、秒传。
- 病毒扫描。
- 头像字段落库或用户头像 UI。
- 富文本 image node 和图片 toolbar 控件。
- 对象存储直传。
- Office 在线预览或文本预览组件。

## 总体方案

采用“通用附件 API + 前端轻量工具”的方案：

- 后端新增 `apps/server/src/modules/attachments`，挂载到 `/api/attachments`。
- 共享契约新增 `packages/contracts/src/attachments.ts`，导出附件 schema、上传用途、签名 URL 响应和类型。
- 数据库新增 `attachments` 表，只保存元数据和存储定位符，不保存文件内容，不暴露真实路径。
- 存储层定义 `AttachmentStorage` 接口，第一版实现 `LocalAttachmentStorage`。
- 前端新增 `apps/client/src/features/attachments/requests.ts` 和 `useAttachmentUrl`。

读取链路统一为：

```txt
业务保存 attachmentId
前端需要预览或下载
POST /api/attachments/:id/signed-url
浏览器访问 /api/attachments/:id/content?token=...
服务端校验 token 后读取 storage stream 并返回文件内容
```

## 数据库表

新增 `attachments` 表：

```txt
attachments
- id uuid primary key
- storage_provider text not null
- storage_key text not null
- original_name text not null
- mime_type text not null
- extension text
- size integer not null
- usage text not null
- checksum text
- created_by uuid not null
- created_at timestamp with time zone not null
- deleted_at timestamp with time zone
```

字段含义：

- `id`：业务稳定引用。头像、富文本、其它业务表只保存这个 ID。
- `storage_provider`：当前为 `local`。后续可扩展为 `s3`、`r2` 或 `minio`。
- `storage_key`：存储层内部定位符。本地存储使用日期分层 key，例如 `2026/05/29/<attachmentId>.png`。它不是 URL。
- `original_name`：用户上传时的文件名，用于下载文件名和后台展示。
- `mime_type`：服务端检测和规范化后的 MIME 类型，例如 `image/png`、`application/pdf`。
- `extension`：规范化扩展名。第一版无法得到可信扩展名时拒绝上传。
- `size`：字节数，用于校验、展示和后续清理统计。
- `usage`：上传用途，例如 `general`、`avatar`、`rich-text`。它不改变读取链路，只影响上传校验策略。
- `checksum`：SHA-256。第一版只保存，不做去重或秒传。
- `created_by`：上传用户 ID。
- `created_at`：上传时间。
- `deleted_at`：软删除时间。删除后不再签发读取 URL，content 路由也会拒绝已删除附件。

索引：

```txt
unique(storage_provider, storage_key)
index(created_by, created_at)
index(usage, created_at)
index(deleted_at)
```

不保存 `public_url` 或 `local_path`。`public_url` 和私有附件模型冲突；`local_path` 会把本地实现泄漏到业务层。

## 上传用途

第一版定义三个用途：

```txt
general
avatar
rich-text
```

`general` 用于通用后台附件。默认单文件上限为 20MB。

`avatar` 和 `rich-text` 默认用于图片类场景。第一版 `rich-text` 只允许图片上传，后续可在同一 usage 下扩展富文本附件能力。默认单文件上限为 5MB。

这些用途只参与上传校验和统计，不决定文件如何读取。所有用途读取时都走签名 URL。

## 类型检测和上传校验

服务端不信任浏览器传来的 `File.type`。上传校验使用两类库：

- `file-type`：按 magic bytes 检测二进制文件真实类型。
- `mime-types`：按原始文件名推断 MIME，作为文本、CSV 等没有稳定 magic bytes 的 fallback，并用于生成响应 `Content-Type`。

上传流程：

1. 从 `multipart/form-data` 读取 `file` 和 `usage`。
2. 用 `file.size` 做上限校验。
3. 读取文件前缀，例如前 4100 bytes，用 `file-type` 检测 MIME 和扩展名。
4. 如果无法检测，再用 `mime-types.lookup(originalName)` fallback。
5. 仍无法识别时拒绝上传。
6. 根据 `usage`、MIME、扩展名和 size 判断是否允许。
7. 生成 `attachmentId` 和日期分层 `storageKey`。
8. 将 `file.stream()` 交给 storage 流式写入。
9. storage 写入时计算 SHA-256 和实际写入字节数。
10. 写入成功后插入 `attachments` 表。
11. 如果数据库插入失败，删除已写入文件。

校验策略：

- `general` 允许常见栅格图片、PDF、Office、zip、纯文本和 CSV。
- `avatar` 和 `rich-text` 只允许 `image/*`，但排除 `image/svg+xml`。
- 第一版排除 SVG、HTML、XML、可执行文件、未知二进制和超大音视频。

SVG 排除原因是它本质是 XML 文档，可能包含脚本、外链、事件属性或 `foreignObject`。安全支持 SVG 需要专门清洗、CSP 和响应头策略，第一版不纳入。

## 本地存储

本地存储目录通过环境变量配置：

```txt
ATTACHMENT_STORAGE_DIR=.attachments/dev
```

`.attachments/` 需要加入 `.gitignore`。

本地 `storageKey` 固定按日期分层：

```txt
YYYY/MM/DD/<attachmentId>.<extension>
```

例如：

```txt
2026/05/29/8d9f0a1c-...-c2.png
```

存储接口：

```ts
type AttachmentPutResult = {
  size: number
  checksum: string
}

type AttachmentGetResult = {
  body: ReadableStream<Uint8Array>
  size: number
}

interface AttachmentStorage {
  put(input: {
    key: string
    body: ReadableStream<Uint8Array>
    expectedSize: number
  }): Promise<AttachmentPutResult>

  get(key: string): Promise<AttachmentGetResult>

  delete(key: string): Promise<void>
}
```

`LocalAttachmentStorage.put()`：

1. 用 `path.join(rootDir, key)` 得到目标路径。
2. 校验目标路径仍位于 `rootDir` 内，防止路径穿越。
3. `mkdir(dirname(targetPath), { recursive: true })` 创建日期目录。
4. 生成临时文件路径，例如 `<targetPath>.<random>.tmp`。
5. 将 Web `ReadableStream` 通过 `Readable.fromWeb()` 转为 Node stream。
6. 用 `pipeline()` 流式写入临时文件。
7. 写入过程中更新 SHA-256 hash，并统计实际写入字节数。
8. 写完后校验实际写入字节数等于 `expectedSize`。
9. 用 `rename(tempPath, targetPath)` 原子替换。
10. 返回 `{ size, checksum }`。

如果任一步失败，删除临时文件。

`LocalAttachmentStorage.get()`：

1. 根据 `storageKey` 解析本地路径并做边界校验。
2. `fs.stat()` 获取 size。
3. `fs.createReadStream()` 打开文件。
4. 使用 `Readable.toWeb()` 返回 Web `ReadableStream<Uint8Array>`。

`LocalAttachmentStorage.delete()` 删除对应文件。第一版不强制清理空目录。

## API 设计

所有 `/api/attachments` API 默认需要登录。content 路由不走 Bearer token，只校验短期签名 token。

### 上传附件

```txt
POST /api/attachments
Content-Type: multipart/form-data
```

字段：

```txt
file: File
usage: general | avatar | rich-text
```

响应 `201`：

```json
{
  "id": "uuid",
  "originalName": "avatar.png",
  "mimeType": "image/png",
  "extension": "png",
  "size": 12345,
  "usage": "avatar",
  "createdAt": "2026-05-29T00:00:00.000Z"
}
```

响应不包含 `storageKey`、`checksum`、`storageProvider`。

### 读取元数据

```txt
GET /api/attachments/:id
```

返回附件元数据。已删除或不存在返回 404。

### 签发读取 URL

```txt
POST /api/attachments/:id/signed-url
```

请求体：

```json
{
  "disposition": "inline"
}
```

`disposition` 可选，取值为 `inline` 或 `attachment`，默认 `attachment`。

响应：

```json
{
  "url": "/api/attachments/:id/content?token=...",
  "expiresAt": "2026-05-29T00:05:00.000Z"
}
```

服务端不会为已删除或不存在的附件签发 URL。

### 读取文件内容

```txt
GET /api/attachments/:id/content?token=...
```

流程：

1. 校验 token 签名、过期时间、附件 ID 和 disposition。
2. 查询 `attachments` 表，确认附件存在且未删除。
3. 调用 `storage.get(attachment.storageKey)` 读取文件流和 size。
4. 用数据库中的 `mimeType` 设置 `Content-Type`。
5. 计算最终 `Content-Disposition`。
6. 返回文件流。

响应头：

```txt
Content-Type: <mimeType or contentType>
Content-Length: <size>
Content-Disposition: inline|attachment; filename="<safe original name>"
Cache-Control: private, max-age=300
X-Content-Type-Options: nosniff
```

`Content-Type` 可通过 `mime-types.contentType(mimeType)` 补充 charset。二进制类型通常保持原 MIME。

### 删除附件

```txt
DELETE /api/attachments/:id
```

第一版以数据库软删除作为访问控制的权威状态。删除流程：

1. 查询附件并确认未删除。
2. 设置 `deletedAt`。
3. 调用 storage 删除本地文件。
4. 返回 204。

如果数据库软删除成功但本地文件删除失败，附件已经无法再签发读取 URL，content 路由也会拒绝访问。失败的物理文件删除记录日志，后续通过维护脚本处理。这样优先保证用户侧访问状态正确，避免因为文件系统删除失败而让已删除附件继续可读。

## 签名 URL

签名 URL token 使用服务端密钥 HMAC。配置项：

```txt
ATTACHMENT_SIGNING_SECRET=...
ATTACHMENT_SIGNED_URL_TTL_SECONDS=300
```

token payload 包含：

```txt
attachmentId
expiresAt
disposition
```

默认有效期为 5 分钟。content 路由即使 token 未过期，也会查询数据库确认附件未删除。

## 预览和下载策略

前端可以请求 `inline` 或 `attachment`，但服务端最终裁决响应头。

第一版允许 inline 的类型：

```txt
image/*，排除 image/svg+xml
application/pdf
```

其它所有 MIME 类型强制 `attachment` 下载，包括：

```txt
text/plain
text/csv
text/html
application/xml
text/xml
Office 文档
zip
audio/*
video/*
application/octet-stream
未知类型
```

这样头像、富文本图片和 PDF 可以直接预览；其它附件以下载为主。后续如果需要音视频预览或文本预览，可以在受控页面中扩展，不改变签名 URL 机制。

## 前端设计

新增 `apps/client/src/features/attachments/requests.ts`：

```ts
uploadAttachment(file, { usage })
getAttachment(id)
createAttachmentSignedUrl(id, { disposition })
deleteAttachment(id)
```

`uploadAttachment()` 使用 `FormData`，通过现有 `authFetch` 发送请求，保留 access token 自动刷新能力。

新增 `useAttachmentUrl(id, options)`：

```ts
useAttachmentUrl(id, {
  disposition: 'inline',
  enabled: true,
})
```

行为：

- `id` 为空或 `enabled` 为 false 时不请求。
- `id` 变化时重新换取签名 URL。
- 第一版不做后台定时刷新；如果 URL 过期导致加载失败，由具体组件触发重新获取。

头像、富文本、PDF 预览等业务只保存 `attachmentId`。显示时调用 `useAttachmentUrl` 获取临时 URL。

## 错误处理

错误响应沿用项目格式：

```json
{
  "message": "不支持的文件类型",
  "field": "file"
}
```

常见错误：

- 缺少文件：`请选择文件`
- 上传用途无效：`上传用途无效`
- 文件过大：`文件大小不能超过 20MB` 或 `图片不能超过 5MB`
- 类型不允许：`不支持的文件类型`
- 附件不存在：`附件不存在`
- 签名 URL 无效或过期：`附件链接已失效`

签名错误返回 403；附件不存在或已删除返回 404。

## 测试设计

共享契约测试：

- `attachmentSchema`、`attachmentUsageSchema`、`attachmentSignedUrlSchema`。
- `general`、`avatar`、`rich-text` 常量导出。

服务端测试：

- 路由测试：未登录拒绝上传和签发 URL。
- 路由测试：上传成功返回元数据。
- 路由测试：缺少 `file`、非法 `usage`、超大文件、非法类型返回 400。
- storage 测试：按日期目录写入，创建目录，临时文件 rename，`get` 返回 stream 和 size，`delete` 删除文件。
- service 测试：签名 URL 生成和验证；过期或伪造 token 被拒绝；删除后不再签发 URL。
- 集成测试：上传文件后使用签名 URL 读取，响应头包含正确 `Content-Type`、`Content-Length`、`Content-Disposition` 和 `X-Content-Type-Options`。

前端测试：

- requests 测试：`FormData` 上传路径正确。
- requests 测试：签名 URL 响应 schema 校验。
- requests 测试：错误响应解析。
- composable 测试：有 ID 时请求签名 URL，ID 为空时不请求。

## 后续扩展方向

第一版不做对象存储直传，但当前存储抽象、`storageProvider`、`storageKey` 和附件元数据模型保留迁移空间。后续如果改为对象存储预签名上传，应先上传到私有 staging 位置，再由服务端在完成接口中复核 size、MIME 和 checksum；预签名条件只作为初筛，不替代服务端复核。

后续可独立设计和实现：

- 是否需要附件管理页面。
- 是否需要引用关系表和未引用附件清理任务。
- 是否需要按业务权限细化附件读取权限。
- 是否需要音视频、文本、Office 在线预览。
- 是否需要病毒扫描或内容安全扫描。
