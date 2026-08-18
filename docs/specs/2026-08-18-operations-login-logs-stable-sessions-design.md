---
status: implemented
date: 2026-08-18
---

# 运维管理登录日志与稳定会话设计

## 背景

运维管理的请求上下文基础已经完成：每个 HTTP 请求都有服务端生成的 `requestId`、可信
客户端 IP、IP 来源、截断后的 User-Agent 和请求级 logger；权限侧也已经建立默认禁用的
`ops` 根资源。

当前认证实现仍以 refresh token 记录近似表达会话。每次 refresh 都撤销旧记录并创建新记录，
同一次登录会持续产生多行，不能稳定地展示或管理为一个在线会话。access token 和附件读取
令牌只携带用户 ID，不携带会话 ID；撤销 refresh token 后，已签发的 access token 和附件
读取令牌仍可分别使用到自身过期。管理员重置密码也只有 refresh token 能立即失效。

登录失败桶只保存限流聚合状态，成功后会被清除，不能承担登录历史。项目目前也没有登录日志
查询接口、在线会话页面或管理员单会话强制下线能力。

项目仍处于开发阶段。本设计不保留旧令牌兼容路径，也不迁移现有 refresh token 记录；新模型
上线后，已有登录用户统一重新登录。

## 目标

1. 使用一行一个认证会话的 `auth_sessions` 建立稳定 session ID。
2. 让 access、refresh 和附件读取令牌绑定同一 session ID。
3. 在每次认证边界检查会话，使退出、密码相关操作和管理员强制下线即时影响后续请求。
4. refresh 时只轮换同一会话的 token hash，并保持原有滑动 7 天语义。
5. 记录成功、凭据无效、账号已停用和触发限流的登录尝试。
6. 提供受权限保护的登录日志查询和有效会话查询页面。
7. 支持管理员强制下线单个非当前会话。
8. 为会话展示解析浏览器、操作系统和设备类型，同时保留原始 User-Agent 供排障。
9. 自动清理超过 90 天的登录日志和超过保留期的失效会话。
10. 用定向测试覆盖令牌轮换、即时失效、并发竞争、权限、页面行为和清理边界。

## 非目标

本设计不包含：

- 操作日志或管理员动作审计；管理员强制下线的操作者审计由后续操作日志能力负责。
- refresh token 轮换历史、旧 token 重放告警或完整认证事件流。
- 将 refresh、退出、密码修改、密码重置或强制下线写入登录日志。
- 会话历史页面、用户自助设备管理、批量下线或按用户一键下线全部会话。
- 并发会话数量限制、异常地点识别、IP 归属或地理位置查询。
- Client Hints 收集、设备指纹或用 IP、User-Agent 绑定认证。
- 跨标签页的认证操作互斥或认证状态同步；前端串行化只覆盖当前标签页。
- 登录日志导出、手动删除、清空或在线修改保留策略。
- 已签发附件 signed URL 的即时撤销。
- Redis、会话缓存、JWT denylist 或完全不透明的服务端 access token。
- 通用调度器；本项继续使用现有维护 worker，后续再统一迁移。
- 旧 access、refresh、附件读取令牌或旧清理环境变量的兼容层。

## 决策摘要

| 主题 | 决策 |
| --- | --- |
| 会话事实源 | 单表 `auth_sessions`，一行对应一个可独立撤销的认证会话 |
| 稳定标识 | 创建认证会话时生成 `sid`，refresh 期间保持不变 |
| refresh 轮换 | 同一行原子替换当前 refresh token hash；已有 access 上下文必须绑定同一会话 |
| 会话有效期 | 成功 refresh 后顺延为当前时间加 7 天 |
| 即时下线 | access、refresh、附件读取令牌都检查数据库会话 |
| 登录日志 | 只记录登录尝试，不记录其他认证生命周期事件 |
| 失败分类 | `invalid_credentials`、`account_disabled`、`rate_limited` |
| 在线语义 | 未撤销且未过期的有效会话，不代表实时网络连接 |
| 当前会话 | 页面标记且服务端禁止管理员强制下线 |
| 活动时间 | Bearer 认证最多每 5 分钟写回；refresh 每次写回；附件不写回 |
| 安全变更并发 | 登录成功提交前锁定并复核用户与凭据快照，与密码变更、重置、停用和删除按同一用户串行化 |
| 密码修改 | 撤销全部旧会话，为当前设备原子创建新会话并重新签发令牌 |
| 密码重置 | 立即撤销目标用户全部会话 |
| signed URL | 已签发链接继续有效至自身过期 |
| User-Agent | 保存原文，查询映射时由服务端解析展示字段 |
| 登录日志保留 | 默认 90 天 |
| 升级策略 | 旧三类认证令牌全部失效，用户重新登录 |

## 组件边界

职责拆分为以下单元：

1. 认证 token 单元：签发和验证三类 JWT，只负责密码学有效性、类型、`sub`、`sid`、`jti` 和
   过期时间，不访问数据库。
2. 认证会话单元：创建、验证、轮换、触碰活动时间和撤销 `auth_sessions`，是会话状态的唯一
   事实源。
3. 认证编排单元：组合用户凭据、限流桶、权限解析、会话和登录日志，负责登录、refresh、
   logout、当前用户和密码修改流程。
4. 登录日志写入单元：只接收明确的安全字段并追加记录，不接受完整 request、body、headers、
   Cookie 或 token。
5. 运维查询单元：查询登录日志和有效会话、解析 User-Agent，并执行管理员单会话撤销。
6. 共享 contracts：保存筛选参数、分页响应、枚举和 User-Agent 派生展示结构。
7. 前端页面：只消费共享契约与 API，不解析 JWT，也不自行解析 User-Agent。

认证核心可以被 auth middleware、附件读取和系统用户密码/状态操作复用；运维查询不能成为
普通 API 的认证依赖。登录日志和会话虽然会被同一运维页面展示，但分别承担不可变事件和
当前状态，不能合并为一张表。

## 数据模型

### `auth_sessions`

删除 `auth_refresh_tokens`，新增 `auth_sessions`：

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | `uuid` | 主键；创建会话时由应用生成，作为稳定 `sid` |
| `user_id` | `uuid` | 非空，引用 `system_users.id` |
| `refresh_token_hash` | `text` | 非空且唯一，只保存当前 refresh `jti` 的 SHA-256 |
| `created_ip` | `text` | 可空，创建会话请求上下文中的规范化客户端 IP |
| `created_ip_source` | `text` | 非空，`socket`、`x-forwarded-for` 或 `unavailable` |
| `user_agent` | `text` | 可空，创建会话请求上下文中最多 512 个字符的原始值 |
| `last_active_at` | `timestamptz` | 非空，创建会话时初始化 |
| `expires_at` | `timestamptz` | 非空，当前会话滑动到期时间 |
| `revoked_at` | `timestamptz` | 可空，会话撤销时间 |
| `revocation_reason` | `text` | 可空，撤销时必须填写允许的原因 |
| `created_at` | `timestamptz` | 非空，会话创建时间 |
| `updated_at` | `timestamptz` | 非空，沿用项目可变时间戳语义 |

`revocation_reason` 只允许：

```ts
type AuthSessionRevocationReason =
  | 'logout'
  | 'password_changed'
  | 'password_reset'
  | 'admin_forced'
  | 'user_disabled'
  | 'user_deleted'
```

数据库 check 保证 `revoked_at` 和 `revocation_reason` 同时为空或同时非空，并校验
`created_ip_source` 和撤销原因枚举。索引至少覆盖：

- `refresh_token_hash` 唯一查找。
- `user_id`，用于按用户撤销全部会话。
- `revoked_at` 和 `expires_at`，用于有效会话筛选与清理。
- `last_active_at`，用于在线会话默认排序。

有效会话的唯一业务定义为：

```sql
revoked_at IS NULL AND expires_at > now()
```

自然到期不回填 `revoked_at` 或伪造撤销原因。

### `ops_login_logs`

新增只追加的 `ops_login_logs`：

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | `uuid` | 主键，使用数据库 UUID 默认值 |
| `user_id` | `uuid` | 可空，引用 `system_users.id`；未知用户名和限流预检查时为空 |
| `username` | `text` | 非空，规范化后最多 64 个字符的登录输入快照 |
| `result` | `text` | 非空，`success` 或 `failure` |
| `failure_reason` | `text` | 可空，只允许三种失败原因 |
| `session_id` | `uuid` | 可空，成功登录对应的稳定 ID，不设置外键 |
| `request_id` | `uuid` | 非空，对应请求上下文中的服务端 request ID |
| `client_ip` | `text` | 可空，可信解析后的客户端 IP |
| `client_ip_source` | `text` | 非空，沿用请求上下文来源枚举 |
| `user_agent` | `text` | 可空，最多 512 个字符的原始值 |
| `created_at` | `timestamptz` | 非空，登录尝试发生时间 |

失败原因只允许：

```ts
type LoginFailureReason =
  | 'invalid_credentials'
  | 'account_disabled'
  | 'rate_limited'
```

数据库 check 保证：

- `success` 必须同时有 `user_id` 和 `session_id`，且没有 `failure_reason`。
- `failure` 必须没有 `session_id`，且必须有 `failure_reason`；`user_id` 可以为空。
- `client_ip_source` 使用与请求上下文相同的允许值。

`session_id` 不引用 `auth_sessions`，因此失效会话清理后，登录日志仍能在 90 天保留期内保存。
应用不提供 update 或 delete repository 方法；只有保留策略清理可以删除历史记录。

`auth_login_attempt_buckets` 保持不变，只负责限流聚合状态。

## User-Agent 解析

服务端新增普通运行时依赖 `bowser`。它只在运维列表的响应映射阶段解析数据库中的原始
User-Agent，不参与登录事务、会话验证或权限判断。

共享响应结构为：

```ts
type OpsUserAgent = {
  raw: string
  browser: {
    name: string
    version: string | null
  } | null
  operatingSystem: {
    name: string
    version: string | null
  } | null
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'tv' | 'bot' | 'unknown'
} | null
```

映射规则：

- 原始值为空时，整个 `userAgent` 返回 `null`。
- parser 无法识别浏览器或操作系统名称时，对应对象返回 `null`；缺少版本时版本为 `null`。
- `platform.type` 只接受上述五种已知值，其他或缺失值统一为 `unknown`。
- 数据库始终只保存原始值，不保存派生字段；解析规则或依赖升级后，历史数据会自然使用新规则。
- 前端设备摘要使用浏览器、操作系统和设备类型，原始值通过 tooltip 展示，不再引入客户端
  User-Agent parser。

## JWT 与认证上下文

### Token payload

三类 JWT 都增加必填的 `sid`：

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "type": "access",
  "iat": 1717300000,
  "exp": 1717300900
}
```

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "type": "refresh",
  "jti": "refresh-token-id",
  "iat": 1717300000,
  "exp": 1717904800
}
```

```json
{
  "sub": "user-id",
  "sid": "session-id",
  "type": "attachment-access",
  "iat": 1717300000,
  "exp": 1717386400
}
```

会话有效期沿用 refresh 有效期。配置启动校验新增
`accessExpiresInSeconds < refreshExpiresInSeconds`，不满足时启动失败，避免 access token 尚未
过期但会话已经到期而无法进入滑动 refresh；附件令牌不超过 refresh 有效期的现有约束保持不变。

验证函数除现有字段外必须要求 `sid` 是合法 UUID。refresh 继续要求 `jti` 并返回其 hash；
三类验证结果都包含 `{ userId, sessionId }`。旧的无 `sid` token 直接按无效令牌处理。

认证 middleware 成功后新增：

```ts
type AuthVariables = {
  currentSessionId: string
  currentUser: User
  accessCodes: string[]
  menus: ResourceTreeNode[]
  isAdmin: boolean
}
```

`currentSessionId` 只来源于已完成数据库会话校验的 access token，不接受 header、query 或
body 中的独立会话值。

### Access token 认证

1. 验证 JWT 签名、类型、`sub`、`sid` 和 `exp`。
2. token 自身已过期时抛出 `AuthAccessTokenExpiredError`，由 middleware 返回带
   `Auth-Action: refresh` 的 `401`。
3. token 尚未过期时，查询 `sid + userId` 对应的有效会话，并确认用户存在、未删除且启用。
4. 会话不存在、撤销、到期或用户不可用时，返回不带 refresh 提示的普通 `401`。
5. 解析用户当前角色、资源和菜单，不把登录时权限快照保存在会话中。
6. 如果 `last_active_at <= now - 5 minutes`，使用仍有效的会话条件执行写回；未达到阈值不写。
7. 写回条件因并发撤销而不再匹配时，本次认证失败，不继续执行路由。

活动时间表示最近一次成功通过 Bearer 认证的应用请求；后续权限校验返回 `403` 的请求也已经
构成用户活动。附件读取不更新该字段。会话撤销只保证之后的认证检查失败，不中途取消已经
完成认证并正在执行的请求或已经开始传输的响应。

### 附件读取令牌

`authenticated` 附件读取继续先验证专用 JWT，再通过
`{ sessionId, userId }` 查询有效会话和启用用户。失败统一映射为现有附件 `401`，不把会话
原因暴露给原生图片或下载请求。

附件读取不触碰 `last_active_at`，避免一个页面中的多张图片制造被动活动和额外数据库写入。
`signed` 附件 token 仍是独立短期能力链接，不增加 `sid` 或会话查询；已经签发的 signed URL
在退出、密码变更、密码重置或管理员强制下线后仍可使用至自身 `expiresAt`。

## 认证生命周期

### 登录

共享用户名 schema 新增 64 字符上限，并统一用于用户创建、修改、bootstrap 和登录。超长登录
请求在 HTTP schema 边界返回 `400`，不进入密码校验、失败桶或登录日志。

登录 service 接收经过 schema 校验的凭据和以下请求元数据子集：

```ts
type LoginRequestMetadata = {
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
}
```

流程固定为：

1. 读取用户名对应的失败桶。
2. 活跃锁定存在时，不查询账号、不执行密码验证、不修改失败桶；追加
   `rate_limited` 失败日志，`user_id = null`，然后返回现有 `429`。
3. 未锁定时查询账号，并继续用 dummy hash 处理未知用户；禁用账号也执行同等密码验证工作。
4. 未知用户或密码错误记录 `invalid_credentials`；已存在但停用的账号记录
   `account_disabled`。公开响应继续统一为现有 `401`，不返回内部分类。
5. 普通失败在一个事务中更新失败桶并追加失败日志；任一写入失败都不降级为 best-effort。
6. 成功时解析完整用户和当前权限，保存实际验证的凭据快照，并生成 session ID、refresh
   `jti` 和三类 JWT。
7. 在一个事务中锁定并复核用户仍可用且凭据快照未变化，然后创建 `auth_sessions`、追加成功
   日志并清除已到期或未锁定的失败桶；复核失败时不创建会话或成功日志，按步骤 4–5 完成
   失败记录并继续返回统一 `401`。
8. 事务成功后返回 access token 和用户会话响应，并设置 refresh、attachment Cookie。

token 可以在事务前完成签名，但只有数据库事务成功后才能进入响应。权限解析或签名失败时不
创建会话；创建会话或登录日志失败时不返回已经生成的 token。

登录成功事务与密码修改、密码重置、用户停用和用户删除按同一用户串行化。安全变更先提交时，
使用旧状态完成校验的登录不能补建会话；登录先提交时，后提交的安全变更必须撤销该会话。

### Refresh

1. 验证 refresh JWT，得到 `userId`、`sessionId` 和旧 `jti` hash。
2. 请求携带 Bearer access token 时，允许该 token 已过期，但仍须验证签名、类型、`sub` 和
   `sid`，并要求其用户与会话和 refresh token 完全一致；不一致时返回无效 refresh token。
   页面首次恢复没有 access token 时，仍可只凭 refresh Cookie 恢复会话。
3. 查询启用用户并解析最新权限；该步骤失败时不消费旧 refresh token。
4. 为相同 `sessionId` 生成新 `jti` 和完整三类 token；新的会话到期时间为当前时间加
   `refreshExpiresInSeconds`。
5. 原子更新唯一会话行，条件同时匹配：
   - `id = sessionId`
   - `user_id = userId`
   - `refresh_token_hash = oldHash`
   - `revoked_at IS NULL`
   - `expires_at > now`
6. 更新当前 hash、`expires_at`、`last_active_at` 和 `updated_at`。
7. 条件不匹配时统一抛出 `AuthInvalidRefreshTokenError`；不创建第二行，也不撤销其他会话。
8. 更新成功后返回新 access token 并重设两个 Cookie。

条件更新保证同一个 refresh token 的并发请求最多一个成功。普通 refresh 只轮换 refresh
凭据；此前签发且尚未过期的 access 和附件读取令牌仍按自身过期时间工作，避免多个浏览器
标签页因共享 Cookie 而互相使 access token 失效。旧 refresh token 的再次使用只表现为 hash
不匹配；本项不保存轮换历史，也不因旧 token 重放自动撤销已经成功轮换的新会话。

### Logout

`POST /api/auth/logout` 保持幂等并始终尝试清除 refresh 和 attachment Cookie：

1. 优先从尚未过期、密码学有效且对应有效会话的 Bearer access token 取得当前 `sid`。
2. access token 缺失或无效时，回退到有效 refresh Cookie 的 `sid` 和当前 hash。
3. 两者都无效、会话已经失效或目标不存在时不报认证错误，仍返回 `204`。
4. 识别到有效会话时设置 `revoked_at` 和 `revocation_reason = logout`。
5. access 和 refresh 同时有效但 `sid` 不一致时，以 Bearer access token 表示的当前前端会话
   为准，不撤销 Cookie 指向的另一会话；响应仍清除本浏览器 Cookie。
6. 数据库异常继续向上传播为 `500`，但 route 的 `finally` 仍清除两个 Cookie。

前端自动 refresh 和 logout 请求显式携带当前 access token，同时继续在当前标签页内串行化
refresh/logout 会话操作；首次页面恢复没有 access token，因此 refresh 不携带 Authorization。
前端在请求 settled 后清除本地状态，因此无效或已撤销会话仍能正常完成退出体验。

### 用户修改自己的密码

`PATCH /api/auth/me/password` 不再依赖 refresh Cookie，而使用 auth middleware 已验证的
`currentSessionId`，并接收当前请求上下文中的客户端 IP、IP 来源和 User-Agent：

1. 校验当前密码并生成新 password hash。
2. 解析最新用户和权限，生成新 session ID、refresh `jti` 和三类新 token。
3. 一个事务内以 `currentSessionId + userId` 和有效会话条件撤销当前会话，并将原因记为
   `password_changed`；条件不匹配时整个事务回滚并返回普通 `401`。
4. 同一事务更新密码凭据、清除 `must_change_password`，将该用户其余有效会话全部撤销为
   `password_changed`，再使用当前请求元数据创建新会话。新会话的活动时间为当前时间，到期
   时间为当前时间加 `refreshExpiresInSeconds`。
5. 新会话创建、任一旧会话撤销或凭据更新失败时，整个事务回滚，不返回已经生成的 token。
6. 成功响应从 `204` 改为现有 `AuthTokenResponse`，route 重设两个 Cookie；前端用返回值替换
   store 中的 access token、用户、权限和菜单。

密码修改是明确的会话安全边界：当前设备保持登录体验，但内部 session ID 会被替换。旧当前
会话和其他会话的 access、refresh 与附件读取令牌都会因原 `sid` 已撤销而立即失效，不需要
额外的 token 版本或代际状态。

### 管理员重置密码

管理员重置密码继续与凭据更新使用同一个数据库事务，并将目标用户全部有效会话标记为
`password_reset`。任一撤销写入失败时凭据更新回滚。目标用户已签发的 access 和附件读取
令牌在下一次会话检查时立即失败。

### 用户停用与删除

- 用户状态从启用变为停用时，在用户更新事务内撤销其全部有效会话，原因是
  `user_disabled`。
- 用户软删除时，在删除事务内撤销其全部有效会话，原因是 `user_deleted`。
- 用户名、昵称、联系方式、部门或角色变更不撤销会话；权限和用户资料在每次认证时重新解析。
- 重新启用用户不会恢复已撤销会话，用户必须重新登录。

### 管理员强制下线

管理员只能撤销一个当前有效的目标会话。route 将 auth middleware 提供的
`currentSessionId` 与目标 ID 一起传入 service；服务端而非前端负责禁止二者相同。

撤销使用条件更新，并设置 `admin_forced`。目标不存在、已经撤销或已经到期时返回 `404`；
目标等于当前会话时返回 `409`。成功返回 `204`。本项不在登录日志中写入该动作，也不额外
创建临时审计表。

## 运维 API 与共享契约

新增 `packages/contracts/src/ops`，按登录日志和在线会话拆分文件并从公共入口导出。

### 登录日志列表

```text
GET /api/ops/login-logs
```

查询参数：

```ts
type LoginLogListQuery = {
  page: number // default 1
  pageSize: number // default 20, max 100
  username?: string
  result?: 'success' | 'failure'
  failureReason?: 'invalid_credentials' | 'account_disabled' | 'rate_limited'
  clientIp?: string
  occurredFrom?: string // ISO datetime, inclusive
  occurredTo?: string // ISO datetime, inclusive
}
```

`username` 使用去空白后的大小写不敏感包含匹配；`clientIp` 使用去空白后的精确匹配。时间参数
必须是带时区的 ISO datetime，二者同时存在时必须满足 `occurredFrom <= occurredTo`。前端
日期时间范围使用本地时间选择器，发送前转为 UTC ISO 字符串。`result` 和 `failureReason` 独立
按交集筛选；矛盾组合返回空列表，不作为无效查询。

默认排序为 `created_at DESC, id DESC`。响应为标准分页结构；每项包含表中非秘密字段和派生
`userAgent`，不返回任何 token、hash、密码、Cookie 或请求 body。

权限：`ops:login-log:list`。

### 在线会话列表

```text
GET /api/ops/sessions
```

查询参数：

```ts
type OnlineSessionListQuery = {
  page: number // default 1
  pageSize: number // default 20, max 100
  username?: string
  createdIp?: string
}
```

只查询有效会话，并关联当前未删除用户。用户名使用大小写不敏感包含匹配，会话创建 IP 使用
精确匹配。默认排序为 `last_active_at DESC, created_at DESC, id DESC`。

列表项包含：

- session ID。
- 用户 ID、用户名和昵称。
- 会话创建 IP 和 IP 来源。
- 派生 User-Agent。
- 会话创建时间、最近活动时间和会话到期时间。
- `isCurrent`，由服务端比较当前认证 session ID 得出。

不返回 refresh hash、撤销字段、用户完整角色或菜单。权限：`ops:online-session:list`。

### 强制下线

```text
DELETE /api/ops/sessions/:id
```

路径 ID 必须是 UUID。权限：`ops:online-session:revoke`。成功返回 `204`；无效 ID 返回 `400`，
无效目标返回 `404`，当前会话返回 `409`。

### 错误映射

| 场景 | HTTP | 响应语义 |
| --- | --- | --- |
| 列表 query 或 session ID 无效 | `400` | `请求参数无效` 或 `会话 ID 无效` |
| 未认证或会话失效 | `401` | 沿用统一 `未授权` |
| 缺少精确资源权限 | `403` | 沿用 `无权访问` |
| 目标不是当前有效会话 | `404` | `在线会话不存在` |
| 目标是当前会话 | `409` | `不能强制下线当前会话` |

未知错误继续抛给根 error handler，不增加通用 `try/catch` 或空数据 fallback。

## 权限资源

更新现有根资源 `10000000-0000-4000-8000-000000000300`，只将 `status` 从禁用改为启用，
保留名称、编码、图标和排序。新增固定资源：

| ID | 父级 | 类型 | 名称 | 编码 | 路径 | 图标 | 排序 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `10000000-0000-4000-8000-000000000301` | `ops` | menu | 登录日志 | `ops:login-log` | `/ops/login-logs` | `lucide:log-in` | 10 |
| `10000000-0000-4000-8000-000000000302` | 登录日志 | action | 查看登录日志 | `ops:login-log:list` | `null` | `null` | 10 |
| `10000000-0000-4000-8000-000000000310` | `ops` | menu | 在线会话 | `ops:online-session` | `/ops/online-sessions` | `lucide:monitor` | 20 |
| `10000000-0000-4000-8000-000000000311` | 在线会话 | action | 查看在线会话 | `ops:online-session:list` | `null` | `null` | 10 |
| `10000000-0000-4000-8000-000000000312` | 在线会话 | action | 强制下线 | `ops:online-session:revoke` | `null` | `null` | 20 |

新增资源全部启用，不写入 `system_role_resources`。现有 admin 角色因运行时管理员语义自动获得
所有启用资源；普通角色继续通过资源管理显式授权。菜单路由访问由 menu code 决定，接口再
检查对应 action code。

## 前端页面

### 登录日志 `/ops/login-logs`

页面沿用现有管理列表结构：查询表单、错误提示、数据表格和分页。

筛选项：

- 用户名。
- 结果：全部、成功、失败。
- 失败原因：全部、凭据无效、账号已停用、触发限流。
- 客户端 IP。
- 发生时间范围。

结果选择“成功”时，前端清空并禁用失败原因；后端不为该字段组合增加关联校验。

表格列：

- 登录时间。
- 用户名。
- 结果 tag。
- 失败原因，成功时显示 `-`。
- 客户端 IP，缺失时显示 `-`；IP 来源通过 tooltip 辅助显示。
- 设备摘要，格式优先为 `浏览器 · 操作系统 · 设备类型`；无法识别的部分省略，全部未知时
  显示“未知设备”，原始 User-Agent 放在 tooltip。
- 标识信息：request ID 始终可复制；成功记录同时提供 session ID 复制入口。

页面不提供行详情、删除、清空或导出按钮。

### 在线会话 `/ops/online-sessions`

筛选项只有用户名和会话创建 IP。表格列：

- 用户名和昵称。
- 会话创建 IP。
- 设备摘要与原始 User-Agent tooltip。
- 会话创建时间。
- 最近活动时间。
- 到期时间。
- 操作。

`isCurrent` 为真时显示“当前会话”标签并禁用强制下线。其他行在用户确认后调用 DELETE API；
成功后刷新列表并显示成功消息。`404` 表示列表已过期，页面展示错误并刷新；`409` 使用服务端
消息。页面不提供状态筛选、历史记录、复选框或批量操作。

### 密码修改

账号设置页的密码 mutation 改为解析 `AuthTokenResponse`。成功后调用 auth store 的
`setSession`，再重置表单并展示现有成功提示。这样当前内存 access token 与服务端新 Cookie
属于同一新会话，不等待下一次自动 refresh。

### 客户端会话失效

现有 `authFetch` 规则保持：普通 `401` 不尝试 refresh，立即清除当前本地会话并 best-effort
调用 logout；只有 `Auth-Action: refresh` 才进入串行 refresh。管理员强制下线、密码重置、
停用和删除用户都因此在目标用户下一次 API 请求时进入登录页。

## 清理与配置

原 refresh token 清理改为 session 清理，并新增登录日志清理 worker。二者继续由现有
`startAppMaintenance()` 启动，不建立新的调度抽象。

### 环境变量

```text
AUTH_SESSION_CLEANUP_INTERVAL_MS=21600000
AUTH_REVOKED_SESSION_RETENTION_MS=604800000
OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS=21600000
OPS_LOGIN_LOG_RETENTION_MS=7776000000
```

规则：

- 两个 cleanup interval 默认 6 小时，允许 `0` 表示关闭对应定时 worker，并受 Node timer
  最大延迟限制。
- 已撤销会话默认保留 7 天，允许 `0`；自然到期会话不额外保留。
- 登录日志默认保留 90 天，允许 `0`。
- 所有值必须是非负安全整数；非法值在 worker 启动时失败。
- 不再读取 `AUTH_REFRESH_TOKEN_CLEANUP_INTERVAL_MS` 或
  `AUTH_REVOKED_REFRESH_TOKEN_RETENTION_MS`。

会话清理删除：

```text
expires_at <= now
OR (revoked_at IS NOT NULL AND revoked_at <= now - revoked retention)
```

登录日志清理删除：

```text
created_at <= now - login log retention
```

worker 继续使用幂等删除；多实例可能同时触发，但不会把本项扩展为通用租约调度。清理失败只
写进程技术日志并等待下一个周期，不影响 HTTP 服务。

## 安全边界

- 三类原始 token、refresh hash、密码、Cookie 和请求 body 都不得写入登录日志或普通技术日志。
- session ID 和 request ID 可展示和复制，但都不是认证凭证。
- `refresh_token_hash` 永不出现在运维 API 或客户端 contracts。
- 登录日志 API 和在线会话 API 分别要求精确资源权限；仅拥有菜单权限不能读取数据。
- 管理员当前会话保护由服务端强制，不能只依赖按钮禁用。
- IP 和 User-Agent 只用于展示与排障，不参与认证，也不因网络或浏览器版本变化撤销会话。
- User-Agent parser 只接收已截断的原始字符串，未知输出按明确的 nullable/`unknown` 结构映射。
- 登录公开错误继续防用户名枚举；后台日志可以通过 nullable `userId` 关联已存在账号，但不显示
  “未知用户名”或“密码错误”两个独立原因。
- 撤销会话影响之后的认证边界，不承诺取消已经在执行中的 HTTP 请求或附件流。
- 后续到达服务端的 `authenticated` 附件读取立即受会话撤销影响；客户端已经接收或私有缓存的
  内容不追回，现有缓存策略保持不变。已签发 `signed` URL 不受影响并持续至自身过期。

## 数据迁移与升级

新增 migration 按以下顺序处理：

1. 删除 `auth_refresh_tokens` 及其索引。
2. 创建 `auth_sessions`、`ops_login_logs`、check 和索引。
3. 启用现有 `ops` 根资源。
4. 插入登录日志和在线会话菜单、动作资源。

不从旧 refresh token 行构造会话，也不接受无 `sid` 的 token。部署后：

- 旧 access token 立即按无效 token 处理。
- 旧 refresh Cookie 无法 refresh。
- 旧 attachment Cookie 无法读取 `authenticated` 附件。
- 已签发附件 signed URL 仍按自己的短期签名和过期时间工作。
- 客户端在首次收到 `401` 后清空状态，用户重新登录创建新会话。

`apps/server/.env.example` 和 README 更新新的清理变量，并删除旧 refresh 清理变量说明。README
同时补充稳定会话、两个运维页面和强制下线的用户可见能力。

## 测试策略

### Contracts

- 用户创建、修改和登录复用 64 字符用户名上限，超长登录输入被拒绝。
- 登录日志 result、failure reason、筛选参数、ISO 时间范围和分页边界。
- `occurredFrom > occurredTo` 被拒绝。
- 在线会话筛选和响应字段。
- User-Agent 派生结构接受明确的 nullable 字段和设备类型枚举，拒绝未知枚举值。

### Token 与 User-Agent 单元测试

- 三类 token 都签发相同 `sid`，并能正确验证返回。
- 缺失、非法或错误类型的 `sid` 被拒绝。
- access token 继续区分自身过期和其他无效场景。
- access 有效期不短于 refresh 有效期时配置启动失败。
- refresh `jti` hash 保持确定性。
- Bowser 映射覆盖桌面、手机、平板、未知字符串和空值，不重复测试依赖内部规则全集。

### 认证 service 与 repository

- 成功登录原子创建一个会话、成功日志并清理失败桶。
- 登录与密码修改、重置、用户停用或删除并发时，不能在后提交的安全变更之外遗留或补建会话。
- 未知用户和错误密码记录 `invalid_credentials`；停用用户记录 `account_disabled`；活跃锁定记录
  `rate_limited`。
- 登录日志或会话写入失败时不返回 token，事务符合设计边界。
- refresh 保持 session ID，只更新一行并轮换 hash；已有 access 与 refresh 的用户或会话不一致
  时拒绝刷新，无 access 的首次页面恢复仍可成功。
- 同一旧 refresh token 并发请求只有一个成功；旧 token 重用失败而新会话保持有效。
- access 或附件 token 对应撤销、过期或不存在的会话时返回普通未授权，不触发 refresh。
- 5 分钟内不重复写活动时间，到达阈值后更新；refresh 每次更新。
- logout 幂等、token 选择顺序正确，数据库错误时仍清 Cookie。
- 密码修改撤销全部旧会话并为当前设备创建新会话；并发撤销当前会话时密码更新回滚且不创建
  新会话。

### 后端集成

- 登录、refresh 多次后数据库始终只有一个有效稳定会话。
- 两次独立登录创建两个 session ID。
- 正常退出后该会话的 access、refresh 和 attachment token 都失败。
- 密码修改后新 session ID 的三类 token 有效；旧当前会话和其他会话的三类 token 都失败，
  旧 access 请求不提示 refresh。
- 管理员重置密码、停用用户和删除用户后全部会话即时失效。
- 管理员强制下线目标会话后，目标三类 token 失败，管理员当前会话保持有效。
- 强制下线当前会话返回 `409`；已失效目标返回 `404`。
- 会话下线后，先前签发的 signed URL 仍能读取至自身过期。
- 登录日志与在线会话列表的权限、筛选、分页、排序和响应 schema。
- 非 admin 用户只有显式获得相应 action resource 后才能调用接口。
- migration 删除旧表、创建新表、启用根资源且不建立默认角色授权。

PGlite 继续覆盖条件更新和并发回归，但测试结论不扩展为生产 PostgreSQL 跨连接锁或隔离级别
语义的完整证明。

### 清理

- 过期会话立即符合删除条件。
- 撤销不足 7 天的会话保留，达到边界时删除。
- 登录日志不足 90 天时保留，达到边界时删除。
- interval 为 `0` 时 worker 不调度；非法配置启动失败。
- 后续 worker 启动失败时，已有维护 worker 按当前聚合启动约定停止。

### 前端

- 登录日志请求正确序列化筛选，响应通过 contracts 解析。
- 登录日志页面展示结果、原因、设备摘要、原始 User-Agent tooltip 和可复制标识。
- 在线会话页面展示当前标签、活动/到期时间和设备摘要。
- 当前会话下线按钮禁用；其他会话确认后调用 DELETE 并刷新列表。
- 密码修改成功后 auth store 接收新的认证响应。
- 普通会话失效 `401` 不 refresh 并清空本地状态；只有 access token 自身过期时仍按 header
  refresh。

## 验收标准

- 一次登录在任意次数 refresh 后始终对应同一个 session ID 和一行有效会话。
- 旧 refresh token 不能重用，并发 refresh 最多一个成功。
- 正常退出、密码重置、用户停用/删除和管理员强制下线使目标会话的三类令牌在下一次认证检查
  时全部失败。
- 修改密码撤销全部旧会话，为当前设备创建新 session ID 并保持当前登录。
- 登录日志完整记录四种已确认结果，不记录密码、token、Cookie 或完整请求对象。
- 登录日志页面按权限查询 90 天内历史；在线会话页面只展示有效会话并保护当前会话。
- 页面展示服务端解析的浏览器、操作系统和设备类型，仍可查看原始 User-Agent。
- 旧无 `sid` token 不兼容，升级后用户重新登录；附件 signed URL 边界保持明确。
- 新旧清理 worker 和所有定向测试通过，完整实现阶段的 `pnpm check` 通过。

## 实施顺序

1. 新增共享 contracts、数据库表和权限 migration。
2. 重构 token payload 与认证会话单元，接入登录日志和 refresh 原子轮换。
3. 接入 auth middleware、附件读取、logout、密码修改/重置和用户停用/删除。
4. 新增运维 API、User-Agent 服务端解析和清理 worker。
5. 新增两个前端页面，并调整密码修改和客户端 logout 请求。
6. 补齐定向测试、环境示例和 README，最后运行完整验证。
