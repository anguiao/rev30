# 后端测试约定

- routes、middleware 和 app 测试覆盖 HTTP 边界；service 测试覆盖业务规则；integration 测试使用事务化 PGlite 覆盖用户可见 API 行为，不跨层重复断言。
- 数据库迁移和初始化行为放在 `db` 测试；测试复用 `createTestDb` 及 `helpers` 中的认证、系统数据和 HTTP 夹具。
- fixture 只提供最小基础数据；权限、关联关系和场景差异在用例中显式声明。
- PGlite 集成测试不证明生产 PostgreSQL 的跨连接锁、调度或隔离级别语义。
