# 前端测试边界

- `utils`、`stores`、`directives`：单元测试，验证纯逻辑或小型 Vue 集成点，不依赖页面。
- `features/*`：组件测试，验证组件对用户输入、服务端结果和事件的响应；避免重复断言 Naive UI props 或通用工具函数的完整输出。
- `pages/*`：页面级集成测试，使用真实 Router、Pinia 和 Naive UI provider，子抽屉可用 stub 隔离；关注页面可见内容、权限、查询、弹窗确认和刷新行为。
- `api.test.ts`、`features/*/requests.test.ts`：运行时请求契约，验证 URL、method、请求体、响应解析和错误映射。
- `contracts/*.ts`：编译期类型契约，仅由 `pnpm typecheck` 覆盖，不放入运行时断言。
