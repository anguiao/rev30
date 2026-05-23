# 后端测试边界

- `db/*`：数据库迁移和初始化测试，验证 PGlite 迁移、幂等性、默认数据和生产/开发启动边界。
- `modules/*/routes.test.ts`、`middleware/*`、`app.test.ts`：HTTP 边界测试，使用 Hono request 或轻量 app，关注状态码、认证授权、响应结构、header 和服务调用契约。
- `modules/*/service.test.ts`、`modules/auth/*.test.ts`、`modules/icons/*-service.test.ts`：服务或纯逻辑测试，验证业务规则、密码与 token 工具、图标读取/搜索等模块内部行为，不重复覆盖路由层断言。
- `modules/*/integration.test.ts`：模块级集成测试，使用 `createTestDb` 提供的事务化 PGlite 数据库，覆盖用户可见 API 行为、权限、关联数据、软删除和唯一性约束。
- `modules/system/repository-locks.test.ts`：仓储并发契约测试，使用轻量 fake db 记录查询顺序，只验证事务与行锁调用时机，不验证数据库持久化结果。
- `helpers/*`：测试夹具和共享基础设施，`db.ts` 提供已迁移数据库和逐测试事务回滚，`auth.ts` 构造系统访问权限场景。
- `helpers/http.ts`：HTTP 边界测试的 JSON 请求、响应解析和状态/响应体断言工具；新增或重构路由测试时优先使用，避免重复手写 `JSON.stringify`、`content-type` 和类型断言。
