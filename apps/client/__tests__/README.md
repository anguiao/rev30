# 前端测试边界

- `utils`、`stores`、`directives`：单元测试，验证纯逻辑或小型 Vue 集成点，不依赖页面。
- `features/*`：组件测试，验证组件对用户输入、服务端结果和事件的响应；避免重复断言 Naive UI props 或通用工具函数的完整输出。
- `pages/*`：页面级集成测试，使用真实 Router、Pinia 和 Naive UI provider，子抽屉可用 stub 隔离；关注页面可见内容、权限、查询、弹窗确认和刷新行为。
- `api.test.ts`、`features/*/requests.test.ts`：运行时请求契约，验证 URL、method、请求体、响应解析和错误映射。
- `utils/request.test.ts`、`utils/error.test.ts`：集中验证跨 feature 复用的响应解析、错误 fallback、字段信息和 query 规范化；feature request 测试只保留领域集成错误路径。
- `contracts/*.ts`：编译期类型契约，仅由 `pnpm typecheck` 覆盖，不放入运行时断言。
- `vitest.config.ts`：请求、路由守卫、auth store 和不依赖 DOM 的纯工具测试归入 `node` project，其余测试归入 `dom` project；两个 project 都继承 Vite 配置，测试文件不再单独声明 `@vitest-environment`。
- `setup.node.ts`、`setup.ts`：分别清理 Node 测试 Pinia，以及 happy-dom 测试 Pinia、主题 DOM、clipboard 和临时 body 内容；全局 stub 由 Vitest 配置统一还原。
- `helpers/fetch.ts`：统一构造 fetch mock、JSON/空响应和 URL/body 断言，避免在请求测试里重复手写字符串匹配。
- `helpers/promise.ts`：统一构造可控 Promise，只用于异步竞态和 stale response 场景。
- `helpers/pinia.ts`、`helpers/dom.ts`：集中管理测试 Pinia、主题 DOM 和 `matchMedia` 夹具；页面测试优先复用这些 helper。
