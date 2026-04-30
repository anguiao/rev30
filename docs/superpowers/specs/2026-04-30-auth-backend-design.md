# Auth Backend Design

## 背景

当前项目已经有数据库驱动的系统用户模块：

- `apps/server` 使用 Hono、Drizzle、PGlite/PostgreSQL。
- `apps/server/src/modules/system/users` 提供用户 CRUD。
- `packages/shared` 保存前后端共享 zod schema 和 TypeScript 类型。
- `users` 表已经包含 `username`、`nickname`、`email`、`phone`、`status`、软删除字段和唯一索引。

上一版系统用户设计明确把认证列为非目标。本次只实现用户认证相关后端接口，前端暂时不做。

## 目标

实现一套兼顾浏览器和 App 的 username/password 认证后端：

1. 支持公开注册。
2. 只支持 `username + password` 登录。
3. 使用 JWT 双 token：短期 access token 和长期 refresh token。
4. Refresh token 可撤销，并且每次刷新时轮换。
5. 浏览器通过 HTTP-only cookie 保存 refresh token；App 可以直接使用响应体中的 token。
6. 提供当前用户查询和登出接口。
7. 禁用用户不能登录，禁用后不能刷新 token。

## 非目标

第一版不实现前端页面、验证码、找回密码、重置密码、邮箱登录、手机号登录、第三方登录、多设备列表、管理员重置密码、角色权限、审计日志或 access token 实时吊销。

管理员手动新增用户后是否同时创建本地密码凭证，留到后续系统管理接口设计中处理。

## 路由范围

认证模块独立挂载在 `/api/auth`，不放进 `/api/system`，因为它是登录入口，不依赖系统管理权限。

最终 HTTP 路径：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## 模块结构

共享 schema：

- `packages/shared/src/auth.ts`
  - 注册、登录、刷新、登出请求 schema。
  - token 响应 schema。
  - 认证错误响应类型。

服务端模块：

- `apps/server/src/modules/auth/routes.ts`
  - Hono routes。
  - 请求参数校验。
  - cookie 读写。
  - HTTP 错误响应映射。
- `apps/server/src/modules/auth/service.ts`
  - 注册、登录、刷新、登出、当前用户查询的业务编排。
- `apps/server/src/modules/auth/repository.ts`
  - 用户凭证查询。
  - 创建带密码的用户。
  - refresh token 会话记录创建、查询和撤销。
- `apps/server/src/modules/auth/password.ts`
  - 密码哈希和校验。
- `apps/server/src/modules/auth/tokens.ts`
  - JWT 签发和验证。
  - refresh token `jti` 生成与哈希。
- `apps/server/src/modules/auth/cookies.ts`
  - refresh cookie 设置和清除。
- `apps/server/src/modules/auth/config.ts`
  - 读取 JWT secret 和 token 过期时间。

真实 app 在 `apps/server/src/app.ts` 挂载 `/api/auth`。`AppType` 继续从真实 Hono route 推导，客户端暂时不做实现。

## 数据模型

新增 `auth_password_credentials` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `user_id` | uuid | 主键，关联 `users.id` |
| `password_hash` | text | 不可空，保存本地密码登录凭证 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

`auth_password_credentials` 的存在表示该用户可以使用 `username + password` 登录。没有该记录的用户不能使用本地密码登录；后续可以接入邮箱、手机号或其他认证方式，不需要污染 `users` 基础资料表。

新增 `auth_refresh_tokens` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `user_id` | uuid | 关联 `users.id` |
| `token_hash` | text | refresh token `jti` 的哈希值，唯一 |
| `expires_at` | timestamp | refresh token 过期时间 |
| `revoked_at` | timestamp | 撤销时间，可空 |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |

索引：

- `auth_refresh_tokens_token_hash_unique`：保证同一个 refresh `jti` 只存在一条记录。
- `auth_refresh_tokens_user_id_idx`：支持后续按用户查询会话。

服务端只保存 refresh token `jti` 的哈希，不保存完整 refresh JWT。

## 配置

从环境变量读取：

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN_SECONDS`，默认 `900`
- `JWT_REFRESH_EXPIRES_IN_SECONDS`，默认 `604800`

生产环境必须显式配置 `JWT_ACCESS_SECRET` 和 `JWT_REFRESH_SECRET`。开发和测试环境如果未配置，可以使用固定开发默认值，方便本地启动和自动化测试。

过期时间使用秒数，避免引入 duration 字符串解析依赖。

## Token 设计

Access token：

- JWT。
- 默认 15 分钟有效。
- 不入库。
- payload 包含：
  - `sub`：用户 ID。
  - `type: 'access'`。
  - `iat`。
  - `exp`。

Refresh token：

- JWT。
- 默认 7 天有效。
- payload 包含：
  - `sub`：用户 ID。
  - `type: 'refresh'`。
  - `jti`：随机 ID。
  - `iat`。
  - `exp`。
- 服务端保存 `jti` 哈希、用户 ID 和过期时间。
- 每次刷新成功时撤销旧 refresh 记录并创建新记录。

第一版不做 access token 实时吊销。用户禁用或删除后，旧 access token 在过期前可能仍可通过签名验证；`GET /api/auth/me` 会额外查询用户状态并拒绝禁用、删除用户。

## 密码哈希

使用 Node 内置 `crypto.scrypt`：

- 每个密码生成随机 salt。
- 存储格式：`scrypt$<salt>$<hash>`。
- 校验时重新计算 hash，并用 timing-safe compare 比较。

不新增第三方密码哈希运行时依赖。

## Cookie 设计

Refresh cookie：

- 名称：`refresh_token`
- `httpOnly: true`
- `sameSite: 'lax'`
- `path: '/api/auth'`
- `secure`：生产环境开启。
- `maxAge`：使用 `JWT_REFRESH_EXPIRES_IN_SECONDS`。

登录、注册和刷新接口总是返回 JSON token；同时设置 HTTP-only refresh cookie。App 可以使用响应体中的 token，浏览器可以依赖 cookie 调用 refresh。

## 接口行为

### `POST /api/auth/register`

请求字段：

- `username`：必填。
- `password`：必填。
- `nickname`：必填。
- `email`：可选。
- `phone`：可选。

行为：

- 创建启用用户。
- 创建 `auth_password_credentials` 记录并写入 `password_hash`。
- `username`、非空 `email`、非空 `phone` 继续沿用现有全表唯一规则；软删除用户仍占用唯一字段。
- 成功后签发双 token，返回 token 响应，并设置 refresh cookie。
- 唯一字段冲突返回 `409`。
- 请求体不合法返回 `400`。

响应结构：

```json
{
  "user": {
    "id": "uuid",
    "username": "ada",
    "nickname": "Ada Lovelace",
    "email": null,
    "phone": null,
    "status": 1,
    "createdAt": "2026-04-30T00:00:00.000Z",
    "updatedAt": "2026-04-30T00:00:00.000Z"
  },
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

### `POST /api/auth/login`

请求字段：

- `username`：必填。
- `password`：必填。

行为：

- 只支持 username 登录。
- 用户不存在、已软删除、禁用、没有密码凭证或密码错误，都返回统一 `401`：

```json
{
  "message": "Invalid username or password"
}
```

- 登录成功后签发双 token，返回 token 响应，并设置 refresh cookie。

### `POST /api/auth/refresh`

请求字段：

- `refreshToken`：可选。

行为：

- 优先读取请求体 `refreshToken`。
- 请求体未传时读取 `refresh_token` cookie。
- 验证 refresh JWT、`jti` 哈希记录、撤销状态、过期时间和用户状态。
- 用户已删除或禁用时返回 `401`。
- 成功后撤销旧 refresh 记录，创建新 refresh 记录，返回新的双 token，并更新 refresh cookie。
- token 无效、已撤销、已过期或复用旧 token 时返回统一 `401`：

```json
{
  "message": "Invalid refresh token"
}
```

### `POST /api/auth/logout`

请求字段：

- `refreshToken`：可选。

行为：

- 优先读取请求体 `refreshToken`。
- 请求体未传时读取 `refresh_token` cookie。
- 如果 token 可解析且存在对应 refresh 记录，则撤销该记录。
- 无论 token 是否存在，都清除 refresh cookie。
- 返回 `204`。

登出接口保持幂等，方便浏览器和 App 在本地清理状态后重复调用。

### `GET /api/auth/me`

行为：

- 从 `Authorization: Bearer <accessToken>` 读取 access token。
- 验证 access JWT。
- 查询用户并确认未删除且启用。
- 成功返回当前用户。
- token 缺失、格式错误、签名无效、token 类型错误、用户不存在、用户已删除或用户禁用时返回 `401`：

```json
{
  "message": "Unauthorized"
}
```

第一版不做角色权限，只返回现有 user response 字段。

## 错误处理

只在系统边界做必要校验：

- 请求体不合法返回 `400`。
- 唯一字段冲突返回 `409`。
- 登录失败返回统一 `401`，不泄漏用户名是否存在。
- refresh 失败返回统一 `401`。
- `me` 鉴权失败返回统一 `401`。

不添加宽泛兜底 try/catch。数据库唯一约束仍是最终一致性保护。

## 测试设计

实现按 TDD 执行，先写失败测试再写实现。

共享包测试：

- register schema 接受 username、password、nickname。
- register schema 允许 email、phone 省略或为空。
- login schema 只接受 username 和 password。
- token response schema 包含 user、accessToken、refreshToken、tokenType 和 expiresIn。

服务端测试：

- 注册创建用户、写入非明文密码凭证、返回双 token、设置 `refresh_token` cookie。
- 重复 username 注册返回 `409`。
- 登录成功返回双 token 并设置 cookie。
- 错误密码返回统一 `401`。
- 禁用用户不能登录。
- refresh 成功时旧 refresh 记录被撤销，新 refresh token 可用，并更新 cookie。
- 复用旧 refresh token 返回 `401`。
- logout 撤销 refresh 记录并清除 cookie，重复 logout 仍返回 `204`。
- `GET /api/auth/me` 使用 access token 返回当前用户。
- `GET /api/auth/me` 对无效 token、refresh token、禁用用户返回 `401`。
- fresh PGlite migration 能创建 `auth_password_credentials` 和 `auth_refresh_tokens` 表。

验证命令：

- `pnpm --filter @rev30/shared test`
- `pnpm --filter @rev30/server test`
- `pnpm typecheck`
- `pnpm check`
