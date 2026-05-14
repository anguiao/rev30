# 登录失败次数限流设计

## 背景

当前认证服务的登录入口位于 `apps/server/src/modules/auth/service.ts`，普通登录失败统一返回
`用户名或密码错误`，并且未知用户也会走 dummy password hash 校验，避免泄漏用户名是否存在。

本次能力是在不破坏现有防枚举行为的前提下，为登录失败次数增加服务端限流。第一版只按用户名维度限流，不做 IP 维度，不修改用户启用/禁用状态，也不提供管理员手动解锁入口。

## 目标

- 同一用户名连续登录失败达到 5 次后，锁定该用户名 15 分钟。
- 锁定期间即使密码正确，也拒绝登录并返回 `429`。
- 登录成功后清空该用户名的失败次数。
- 普通失败仍返回统一 `401`，不区分未知用户、禁用用户和密码错误。
- 限流状态持久化到数据库，支持服务重启和生产多实例。
- 增加定期清理，避免失败桶长期增长。

## 非目标

- 不做 IP、设备、租户、地理位置等维度限流。
- 不修改 `system_users.status`，限流锁定不是用户禁用。
- 不在前端本地阻止请求；前端只展示后端返回的限流错误。
- 不新增公开查询剩余次数或解锁状态的接口。

## 数据模型

新增表 `auth_login_attempt_buckets`，第一版以规范化后的 `username` 作为主键。

字段：

- `username`: `text primary key`，使用 `authLoginSchema` trim 后进入服务层的用户名。
- `failedCount`: `integer not null`，当前窗口内失败次数。
- `windowStartedAt`: `timestamp with time zone not null`，失败窗口开始时间。
- `lastFailedAt`: `timestamp with time zone not null`，最近一次失败时间。
- `lockedUntil`: `timestamp with time zone`，锁定截止时间，未锁定时为空。
- `createdAt`: `timestamp with time zone not null default now()`。
- `updatedAt`: `timestamp with time zone not null default now()`，沿用当前 schema 的 `$onUpdate` 模式。

索引：

- 主键索引：`username`。
- 普通索引：`lockedUntil`，供清理任务筛选过期锁定记录。
- 普通索引：`windowStartedAt`，供清理任务筛选过期窗口记录。

## 配置

扩展 `AuthConfig`：

- `loginFailureMaxAttempts`: 默认 `5`。
- `loginFailureWindowSeconds`: 默认 `900`。
- `loginFailureLockSeconds`: 默认 `900`。

新增环境变量：

- `AUTH_LOGIN_FAILURE_MAX_ATTEMPTS`
- `AUTH_LOGIN_FAILURE_WINDOW_SECONDS`
- `AUTH_LOGIN_FAILURE_LOCK_SECONDS`

新增清理配置：

- `AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS`: 默认 `21600000`，即 6 小时。
- `AUTH_LOGIN_ATTEMPT_RETENTION_MS`: 默认 `86400000`，即 24 小时。

配置读取遵循现有风格：必须是正整数，清理间隔允许为 `0` 表示关闭定时清理。

## 服务流程

`createAuthService().login(input)` 调整为：

1. 读取 `input.username` 对应的登录失败桶。
2. 如果 `lockedUntil > now`，抛出 `AuthLoginRateLimitedError`。
3. 如果未锁定，继续现有登录校验：
   - 查询用户凭证。
   - 未知用户使用 dummy password hash。
   - 校验密码。
   - 禁用用户、未知用户、密码错误统一视为登录失败。
4. 登录失败时记录失败：
   - 没有 bucket 时创建，`failedCount = 1`。
   - 窗口已过期时重置窗口，`failedCount = 1`。
   - 窗口内继续递增失败次数。
   - 失败次数达到 `loginFailureMaxAttempts` 时设置 `lockedUntil = now + loginFailureLockSeconds`。
5. 登录成功时清理该用户名的失败桶。
6. 成功清理后照常创建 access token、refresh token 和 session。

锁定期间不执行密码校验，不创建 refresh session，不设置 refresh cookie。

## 错误响应

新增错误类 `AuthLoginRateLimitedError`。

路由错误映射：

- 普通登录失败：继续返回 `401 { message: '用户名或密码错误' }`。
- 登录限流：返回 `429 { message: '登录失败次数过多，请稍后再试' }`。

这会公开“该用户名当前被限流”的事实，但不会公开用户名是否存在。未知用户名同样会被记录和限流，因此攻击者无法通过 429 区分真实账号和不存在账号。响应不返回剩余锁定秒数，也不设置 `Retry-After`，避免提供更细粒度的节奏反馈。

## 前端表现

`apps/client/src/features/auth/useLoginForm.ts` 保持现有提交流程，只扩展错误展示：

- `401`: 展示 `用户名或密码错误`。
- `429`: 展示服务端 message，即 `登录失败次数过多，请稍后再试`。
- 其他错误：继续展示 `登录失败，请稍后再试`。

登录页不展示剩余次数和剩余秒数，避免给攻击者提供更细粒度反馈。

## 定期清理

沿用 `apps/server/src/db/maintenance` 的 worker 模式，新增登录失败桶清理 worker，并加入 `startDbMaintenance()`。

清理函数删除满足任一条件的记录：

- `lockedUntil is null` 且 `windowStartedAt <= now - AUTH_LOGIN_ATTEMPT_RETENTION_MS`。
- `lockedUntil is not null` 且 `lockedUntil <= now - AUTH_LOGIN_ATTEMPT_RETENTION_MS`。

这样可以保留短期失败记录用于排查，又避免长期累积。清理失败只记录日志，不影响主服务。

## 测试策略

后端服务测试：

- 未知用户登录失败会记录失败次数。
- 密码错误累计到第 5 次后，下次请求被 429 拒绝。
- 锁定期间正确密码也被拒绝。
- 成功登录会清空该用户名失败桶。
- 窗口过期后失败次数从 1 重新开始。

后端路由测试：

- `AuthLoginRateLimitedError` 映射为 429。
- 响应体为 `{ message: '登录失败次数过多，请稍后再试' }`。
- 429 时不设置 refresh token cookie。

后端集成测试：

- 使用真实 PGlite 事务，连续 5 次错误密码后同一用户名被锁定。
- 锁定期间正确密码不能登录。
- 另一个用户名不受影响。

清理测试：

- 过期未锁定 bucket 会被删除。
- 过期锁定 bucket 会被删除。
- 保留期内 bucket 不会被删除。

前端测试：

- 429 时登录页展示 `登录失败次数过多，请稍后再试`。
- 401 仍展示 `用户名或密码错误`。

## 迁移与兼容

新增迁移只创建新表和索引，不改已有认证表，不影响现有 refresh token、用户、角色和权限数据。

开发环境 PGlite 会通过现有迁移机制自动应用；生产 PostgreSQL 通过当前 Drizzle 迁移流程执行。

## 验收标准

- 连续 5 次失败后，同一用户名被锁定 15 分钟。
- 锁定响应为 429，包含稳定中文错误消息，不包含剩余锁定秒数。
- 普通失败仍是统一 401，不暴露账号状态。
- 成功登录会清除失败状态。
- 清理任务能删除过期失败桶。
- `pnpm --filter @rev30/server test` 和 `pnpm --filter @rev30/client test` 通过相关测试。
