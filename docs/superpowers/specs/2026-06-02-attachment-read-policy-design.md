# 附件读取策略与稳定内容 URL 设计

## 背景

当前附件模块已经从 multipart 上传调整为上传会话链路：前端创建上传会话、按临时 PUT URL 上传文件、再 complete 写入附件元数据。读取链路仍统一为短期签名 URL：前端先请求内容访问 URL，再把返回的 `/api/attachments/:id/content?token=...` 交给浏览器加载。

这套模型适合普通私有附件下载，但对头像和富文本媒体不够顺手。头像和富文本图片属于页面结构的一部分，如果每次都要异步换短期 URL，前端需要处理加载态、过期刷新、批量解析和富文本 HTML 中 URL 过期等问题。项目是内部系统，头像、富文本图片、PDF 预览等资源也不应该变成完全公开资源。

同时，当前 `usage` 在共享契约中被限制为固定枚举值，但团队已经确认 `usage` 的定位只是记录附件来自哪个业务场景，不应该承担权限或读取策略语义。后续新增业务 usage 时，不应该为了记录一个新值就修改 contracts。

## 目标

- 将 `usage` 放宽为非空字符串，作为纯记录字段保留。
- 新增独立读取策略字段 `readPolicy`，把“业务用途”和“读取方式”拆开。
- 第一版读取策略支持 `signed` 和 `authenticated`。
- 保持普通附件默认走短期签名读取，避免意外扩大可读范围。
- 允许头像、富文本媒体和可预览文件使用稳定内容 URL，同时要求登录用户可读。
- 新增 `attachment_token` HttpOnly cookie，专门服务浏览器原生附件内容请求。
- 前端把稳定内容 URL 与短期签名 URL helper 明确拆开。

## 非目标

本阶段不实现：

- 完全公开的附件读取策略。
- 附件随父资源权限动态授权，例如公告可见范围、工单参与者或知识库栏目权限。
- 通用资源读取 token；本阶段 token 只服务附件内容读取。
- 富文本 image/media node、图片上传 toolbar 或富文本附件引用关系表。
- 未引用附件自动清理。
- 头像裁剪、图片压缩或附件替换能力。
- 将 refresh token 扩展为附件读取凭证。

## 核心决策

### usage 是记录字段

`usage` 表示附件被哪个业务入口创建或使用，例如 `general`、`avatar`、`rich-text`、`article-cover`、`import-file`。它不决定附件能否稳定读取，也不决定是否需要签名。

共享契约只校验 `usage` 是非空字符串。客户端不维护全局 usage 常量、usage registry 或 usage label map；调用方按业务需要传入 usage 字符串。

附件列表仍可按 `usage` 筛选，筛选值同样是任意非空字符串。前端使用文本框输入 `usage`，不使用 select，也不维护全局 usage 选项列表。

### readPolicy 决定内容读取方式

新增 `readPolicy` 字段：

```ts
type AttachmentReadPolicy = 'signed' | 'authenticated'
```

含义：

- `signed`：默认策略。读取内容必须携带短期签名 token，保持当前普通附件的私有读取模型。
- `authenticated`：稳定内容 URL 可直接嵌入 `<img>`、`<video>`、PDF preview 或富文本 HTML，但请求必须带有效 `attachment_token` cookie。

`readPolicy` 与 `usage` 是彼此独立的字段。`usage` 不决定 `readPolicy`，`readPolicy` 也不限制 `usage`。头像通常使用 `usage = "avatar"` 和 `readPolicy = "authenticated"`，普通后台附件通常使用 `usage = "general"` 和 `readPolicy = "signed"`，但这只是调用方按业务需要传入的组合，不是附件模块内置的映射规则。未来新增 usage 不需要修改读取策略模型。

## 数据模型

`attachments` 表新增字段：

```txt
read_policy text not null default 'signed'
```

字段含义：

- `read_policy = 'signed'`：内容读取要求短期签名 token。
- `read_policy = 'authenticated'`：内容读取要求 `attachment_token` cookie。

历史附件迁移后默认值为 `signed`，保持现有安全行为。

共享 `attachmentSchema` 和 `attachmentListItemSchema` 返回 `readPolicy`，方便附件资源页展示或后续筛选扩展。第一版附件列表不新增 readPolicy 筛选，避免管理页功能扩散。

上传会话创建输入新增可选字段：

```ts
readPolicy?: 'signed' | 'authenticated'
```

服务端默认值为 `signed`。complete 时使用上传会话中保存的 `readPolicy` 写入附件元数据。

## attachment_token

`attachment_token` 是专门给浏览器原生附件内容请求使用的只读登录凭证。它不是 access token，也不是 refresh token。

Cookie 属性：

```txt
Name: attachment_token
Path: /api/attachments
HttpOnly
SameSite: Lax
Secure: production only
Max-Age: JWT_ATTACHMENT_EXPIRES_IN_SECONDS
```

JWT payload：

```json
{
  "sub": "user-id",
  "type": "attachment-read",
  "iat": 1717300000,
  "exp": 1717900000
}
```

签名密钥使用独立配置：

```txt
JWT_ATTACHMENT_SECRET
JWT_ATTACHMENT_EXPIRES_IN_SECONDS=86400
```

开发环境可使用默认开发密钥；生产环境必须显式配置 `JWT_ATTACHMENT_SECRET`。`JWT_ATTACHMENT_EXPIRES_IN_SECONDS` 默认 `86400` 秒，必须大于 0 且不超过 refresh token 有效期。

设置和清理规则：

- `POST /api/auth/login` 成功时设置 `refresh_token` 和 `attachment_token`。
- `POST /api/auth/refresh` 成功时轮换 access/refresh session，并重新设置 `attachment_token`。
- `POST /api/auth/logout` 清除 `refresh_token` 和 `attachment_token`。
- 修改密码时当前响应不需要额外下发新 attachment token；旧 token 会在用户状态禁用、删除或过期时失效。后续如需更强会话级撤销，再为 attachment token 增加 session id 或 token version。

服务端验证 `attachment_token` 时检查：

- 签名有效。
- `type === "attachment-read"`。
- token 未过期。
- `sub` 对应用户存在且启用。

验证通过只代表当前请求可以作为“已登录用户”读取 `authenticated` 附件，不提供任何管理权限，不写入 `currentUser` 给普通 API 复用。

## API 设计

### 创建上传会话

请求：

```txt
POST /api/attachments/uploads
```

请求体：

```json
{
  "originalName": "avatar.png",
  "usage": "avatar",
  "readPolicy": "authenticated",
  "size": 12345,
  "contentType": "image/png"
}
```

`readPolicy` 可省略，省略时按 `signed` 处理。

### 短期签名 URL

```txt
POST /api/attachments/:id/content-url
```

该接口继续要求 Bearer access token。它只服务 `signed` 附件。对 `authenticated` 附件请求短期签名 URL 时返回 400，避免调用方把两种读取模型混用。

### 内容读取

```txt
GET /api/attachments/:id/content
```

行为：

- 附件不存在或已删除：404。
- `readPolicy = signed`：要求 `token` query，校验通过后返回内容。
- `readPolicy = authenticated`：不要求 `token` query，要求有效 `attachment_token` cookie。
- `readPolicy = authenticated` 且 cookie 缺失或无效：401。
- `readPolicy = authenticated` 且同时携带无关 `token` query：忽略 query token，按 cookie 校验。

响应头：

- `Content-Type` 使用服务端检测并保存的 MIME。
- `Content-Disposition` 对 `authenticated` 默认使用 inline，但仍通过服务端策略约束可 inline 的 MIME；不适合 inline 的类型强制 attachment。
- `Cache-Control` 对 signed 内容沿用短期 private cache；对 authenticated 内容使用 `private, max-age=300`。
- `X-Content-Type-Options: nosniff` 保留。

`GET /api/attachments/:id/content` 是前端稳定入口。前端只依赖这个应用层 URL；服务端在完成读取策略校验后负责返回文件内容。

## 前端设计

附件请求模块提供两类 URL helper。

稳定内容 URL：

```ts
getAttachmentContentUrl(id: string): string
```

它只生成应用层稳定入口：

```txt
/api/attachments/:id/content
```

它不请求接口、不判断权限、不知道存储实现。浏览器加载该 URL 时自动带同源 `attachment_token` cookie。

短期签名 URL：

```ts
resolveSignedAttachmentUrl(id, input)
useSignedAttachmentUrl(id, options)
```

`resolveSignedAttachmentUrl` 替代当前 `resolveAttachmentUrl`，继续请求 `/content-url` 并返回 `{ url, expiresAt }`。

`useSignedAttachmentUrl` 替代当前 `useAttachmentUrl`，保留过期前刷新逻辑，只用于 `signed` 附件。

删除 `useAttachmentUrl`，不保留 deprecated alias。

头像上传：

```ts
uploadAttachment(file, {
  usage: 'avatar',
  readPolicy: 'authenticated',
})
```

头像回显：

```ts
const imageUrl = computed(() =>
  props.avatarId === null || imageFailed.value
    ? null
    : getAttachmentContentUrl(props.avatarId),
)
```

附件资源页预览根据 `readPolicy` 分支选择 URL：

- `readPolicy = authenticated`：使用 `getAttachmentContentUrl`。
- `readPolicy = signed`：使用 `useSignedAttachmentUrl`。

这样后台列表可以同时预览头像这类 authenticated 图片和普通 signed 图片。

附件资源页的 `usage` 筛选控件改为文本输入。用户输入任意非空 usage 字符串即可筛选；清空输入表示不过滤 usage。页面可以继续在列表中展示已返回的 usage 原始值，但不维护固定 usage label 或 select option。

## 错误语义

新增服务端领域错误：

- `AttachmentContentUrlUnsupportedError`：对非 `signed` 附件请求短期内容 URL。
- `AttachmentContentUnauthorizedError`：authenticated 内容读取缺少有效 attachment token。

路由映射：

- unsupported：400。
- unauthorized：401。
- not found：404。
- signed token invalid 或过期：401，保持当前行为。

前端头像组件不直接展示读取错误。稳定 URL 加载失败时继续回退姓名头像。

## 安全边界

- `attachment_token` 只放在 HttpOnly cookie，不暴露给 JS。
- Cookie path 限定在 `/api/attachments`，不参与普通 API 鉴权。
- `attachment_token` 只允许读取 `readPolicy = authenticated` 的附件内容。
- 普通附件默认 `signed`，迁移不改变历史附件可读性。
- refresh token 仍只用于 `/api/auth/refresh`，不复用为附件读取凭证。
- `usage` 不参与权限判断，避免新增 usage 时产生隐式授权规则。

## 测试策略

契约测试：

- `usage` 接受任意非空字符串，拒绝空字符串。
- `readPolicy` 只接受 `signed` 和 `authenticated`。
- 上传会话输入默认 `readPolicy = signed`，也接受显式 `authenticated`。
- 附件响应包含 `readPolicy`。

认证测试：

- auth 配置读取 `JWT_ATTACHMENT_EXPIRES_IN_SECONDS`，并且不从 refresh token 有效期推导 attachment token 有效期。
- auth 配置拒绝大于 refresh token 有效期的 attachment token 有效期。
- 登录和刷新响应设置 `attachment_token` cookie。
- 登出清除 `attachment_token` cookie。
- attachment token 校验拒绝错误类型、过期 token 和无效签名。

附件路由/服务测试：

- 上传会话保存并 complete 写入 `readPolicy`。
- `signed` 附件读取仍要求短期 token。
- `authenticated` 附件无 token 但有有效 `attachment_token` 时可读取。
- `authenticated` 附件缺少或携带无效 `attachment_token` 时返回 401。
- 对 `authenticated` 附件请求 `/content-url` 返回 400。
- 历史默认 `signed` 行为不回归。

前端测试：

- `getAttachmentContentUrl` 返回稳定内容入口。
- `resolveSignedAttachmentUrl` 请求 `/content-url` 并返回 `{ url, expiresAt }`。
- `useSignedAttachmentUrl` 保留现有刷新行为。
- 头像组件不再请求 signed URL，直接使用稳定 URL。
- 头像上传传 `readPolicy: 'authenticated'`。
- 附件资源页预览按 `readPolicy` 选择稳定 URL 或 signed URL。
- 附件资源页使用文本框筛选 `usage`，不再依赖 usage select options。

## 迁移与兼容

数据库迁移新增 `read_policy`，默认 `signed`。现有附件不变。

contracts 删除固定 usage 常量导出后，客户端调用方直接传入业务 usage 字符串。附件资源页直接展示返回的原始 usage，并用文本框按原始 usage 筛选，不维护固定 usage 选项列表或文案映射。

README 需要更新附件说明：上传仍是会话流，读取分为短期签名和已登录稳定 URL 两种策略；`attachment_token` 用于浏览器原生附件内容请求。

## 验收标准

- 普通附件默认仍需要短期签名 URL 才能读取。
- 头像上传后的附件使用 `authenticated` 读取策略。
- 头像组件直接使用稳定内容 URL，不再调用 signed URL hook。
- 登录用户可通过稳定 URL 加载 authenticated 附件。
- 未登录用户无法通过稳定 URL 加载 authenticated 附件。
- `usage` 可以保存任意非空业务字符串。
- 附件资源页可以用任意文本 usage 筛选，不需要前端维护 usage select。
- 所有相关契约、服务端、前端测试通过。
