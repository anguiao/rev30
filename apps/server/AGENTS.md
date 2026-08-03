# Server

## 实现约定

- Hono API 统一挂在 `/api`；routes 负责 HTTP 边界，并使用 `packages/contracts` 的 schema 校验输入和输出。
- 复杂业务和数据库访问按需沿用现有 service、repository 分工，不为简单接口强制增加层级。
- 只处理预期领域错误并在路由边界映射响应；未知错误继续抛出。
- 数据库 schema 位于 `src/db/schema.ts`；结构变更需同步迁移和数据库测试。开发使用 PGlite，生产通过 `DATABASE_URL` 连接 PostgreSQL。
