# System Users Design

## 背景

`system` 模块第一版需要提供用户管理接口。接口必须真实落到数据库，不能使用内存临时存储；同时要保持现有客户端 Hono RPC 调用方式，不让 Drizzle、PGlite、Postgres 等服务端运行时依赖进入客户端。

当前项目已有以下基础：

- `apps/server` 使用 Hono、Drizzle、PGlite/PostgreSQL。
- `apps/client` 通过 `hono/client` 创建 RPC client，并从 `@rev30/server` 只导入 `AppType` 类型。
- `@rev30/server` 的 TypeScript path 指向 `apps/server/src/rpc.ts`，这是客户端安全使用的纯类型合同入口。
- `packages/shared` 用于放前后端共享的 schema 和 TypeScript 类型。

## 目标

实现 `system` 模块下的用户 CRUD：

1. 用户数据存入数据库。
2. 支持列表、详情、新增、更新、软删除。
3. 软删除和禁用状态分离。
4. `username`、`email`、`phone` 全表唯一；软删除后也继续占用。
5. `email` 和 `phone` 非必填，未填写时不参与唯一冲突。
6. 保持客户端 Hono RPC 类型调用不破坏，且不引入服务端运行时依赖。

## 非目标

第一版不实现认证、权限、角色、回收站、恢复删除、批量操作、导入导出、审计日志或前端管理页面。`deletedAt` 暂不作为常规 API 响应字段暴露。

## 数据模型

新增 `users` 表：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | uuid | 主键 |
| `username` | text | 必填，全表唯一 |
| `nickname` | text | 必填 |
| `email` | text | 可空，全表唯一 |
| `phone` | text | 可空，全表唯一 |
| `status` | smallint | `1=启用`，`0=禁用` |
| `created_at` | timestamp | 创建时间 |
| `updated_at` | timestamp | 更新时间 |
| `deleted_at` | timestamp | 删除时间，可空 |

API 常规响应字段使用 camelCase：

- `id`
- `username`
- `nickname`
- `email`
- `phone`
- `status`
- `createdAt`
- `updatedAt`

`deleted_at` 只用于服务端过滤和软删除判断。默认列表和详情只返回 `deleted_at IS NULL` 的用户。`status=0` 表示禁用用户，禁用用户仍可被查询；它不等同于删除。

## 路由结构

路由需要真实嵌套在 `system` 下，而不是只用扁平路径字符串模拟嵌套。

服务端运行时路由：

- `apps/server/src/routes/system/index.ts`
  - 挂载 `/users`
- `apps/server/src/routes/system/users.ts`
  - 实现用户 CRUD
- `apps/server/src/app.ts`
  - 在 `/api/system` 下挂载 `systemRoutes`

最终 HTTP 路径：

- `GET /api/system/users`
- `GET /api/system/users/:id`
- `POST /api/system/users`
- `PATCH /api/system/users/:id`
- `DELETE /api/system/users/:id`

`apps/server/src/rpc.ts` 需要声明同样的嵌套合同，确保客户端可以通过 `api.system.users` 访问对应 RPC endpoint。

## 接口行为

### `GET /api/system/users`

查询参数：

- `page`：页码，默认 `1`
- `pageSize`：每页数量，默认 `20`
- `keyword`：可选，匹配 `username`、`nickname`、`email`、`phone`
- `status`：可选，只接受 `0` 或 `1`

行为：

- 默认只查询 `deleted_at IS NULL` 的用户。
- 返回分页结构：`{ list, total, page, pageSize }`。
- 禁用用户仍在默认列表中，除非显式传入 `status` 过滤。

### `GET /api/system/users/:id`

行为：

- 返回未删除用户详情。
- 用户不存在或已软删除时返回 `404`。
- 禁用用户可以正常查询。

### `POST /api/system/users`

请求字段：

- `username`：必填
- `nickname`：必填
- `email`：可选
- `phone`：可选
- `status`：可选，默认 `1`

行为：

- 创建数据库记录。
- `username`、非空 `email`、非空 `phone` 如果与任何现有记录冲突，返回 `409`。
- 冲突检查覆盖软删除记录，软删除用户仍占用这些唯一字段。
- 创建成功返回新用户。

### `PATCH /api/system/users/:id`

可更新字段：

- `username`
- `nickname`
- `email`
- `phone`
- `status`

行为：

- 只允许更新未删除用户。
- 用户不存在或已软删除时返回 `404`。
- 更新成功刷新 `updated_at`。
- `username`、非空 `email`、非空 `phone` 如果与其他任何记录冲突，返回 `409`。
- 禁用用户可以被更新。

### `DELETE /api/system/users/:id`

行为：

- 软删除用户：设置 `deleted_at`，并刷新 `updated_at`。
- 不物理删除数据库行。
- 不改变 `status` 的语义。
- 用户不存在或已软删除时返回 `404`。

## RPC 和依赖边界

继续保持当前纯类型合同入口：

- `apps/server/src/rpc.ts`
  - 只定义 Hono RPC 合同和 `AppType`。
  - 不导入 `db`、Drizzle、PGlite、Postgres 或真实 route handler。
  - 可以引用 `packages/shared` 中的纯 schema 和类型。

- `apps/server/src/app.ts`
  - 组合真实运行时 app。
  - 挂载 `healthRoutes` 和 `systemRoutes`。

- `apps/server/src/routes/system/users.ts`
  - 实现真实用户接口。
  - 访问数据库并处理查询、唯一冲突、软删除。

- `packages/shared`
  - 定义 user schema、请求/响应 schema、状态常量和类型。
  - 不包含数据库、Hono app、Node server 或运行时 server 依赖。

客户端继续使用：

```ts
import { hc } from 'hono/client'
import type { AppType } from '@rev30/server'

export const api = hc<AppType>('/api')
```

## 共享类型

`packages/shared` 提供：

- `USER_STATUS_ENABLED = 1`
- `USER_STATUS_DISABLED = 0`
- user response schema
- user list query schema
- user create schema
- user update schema
- 由 schema 推导出的 TypeScript 类型

`email` 和 `phone` 在共享 schema 中为可选字段，并允许空值表示未填写。`status` 只接受 `0` 或 `1`。

## 错误处理

只在系统边界做必要校验：

- 请求体和查询参数不合法返回 `400`。
- 用户不存在或已删除返回 `404`。
- 唯一字段冲突返回 `409`。

不添加宽泛 try/catch 或额外 fallback。数据库唯一约束仍是最终一致性保护，服务端路由可以在写入前做明确冲突检查，以返回稳定的业务错误。

## 测试设计

实现按 TDD 执行，先写失败测试再写实现。

共享包测试：

- user schema 接受合法用户。
- `email` 和 `phone` 可省略或为空。
- `status` 只接受 `0` 和 `1`。

服务端测试：

- `POST /api/system/users` 会真实写入数据库。
- `GET /api/system/users` 返回分页列表，并默认排除软删除用户。
- `GET /api/system/users/:id` 返回用户详情。
- `PATCH /api/system/users/:id` 更新用户并刷新 `updatedAt`。
- `DELETE /api/system/users/:id` 设置 `deleted_at`，不会物理删除行。
- `status=0` 的禁用用户仍可被列表和详情查到。
- `username`、`email`、`phone` 唯一冲突返回 `409`。
- 已软删除用户仍占用 `username`、`email`、`phone`。
- 已删除用户详情和重复删除返回 `404`。

客户端测试：

- 现有 Hono RPC 边界测试继续通过。
- `@rev30/server` 的类型入口仍指向 `apps/server/src/rpc.ts`。
- 客户端可以通过 `api.system.users` 使用嵌套 RPC 结构。

测试数据库应使用临时 PGlite 数据库，避免污染 `.pglite/dev`。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/shared typecheck
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
pnpm typecheck
pnpm test
pnpm format:check
pnpm lint:check
```

如果实现涉及生成迁移，还需要运行对应 Drizzle 命令并检查生成内容。
