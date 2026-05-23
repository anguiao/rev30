# 前端测试边界

- `utils`、`stores`、`directives`：单元测试，验证纯逻辑或小型 Vue 集成点，不依赖页面。
- `features/*`：组件测试，验证组件对用户输入、服务端结果和事件的响应；避免重复断言 Naive UI props 或通用工具函数的完整输出。
- `pages/*`：页面级集成测试，使用真实 Router、Pinia 和 Naive UI provider，子抽屉可用 stub 隔离；关注页面可见内容、权限、查询、弹窗确认和刷新行为。
- `api.test.ts`、`features/*/requests.test.ts`：运行时请求契约，验证 URL、method、请求体、响应解析和错误映射。
- `contracts/*.ts`：编译期类型契约，仅由 `pnpm typecheck` 覆盖，不放入运行时断言。
- `vitest.config.ts`、`setup.ts`：统一配置 happy-dom 组件测试环境和生命周期，清理全局测试 Pinia 和临时 body 内容；测试文件不再单独声明 `@vitest-environment`。
- `helpers/fetch.ts`：统一构造 fetch mock、JSON/空响应和 URL/body 断言，避免在请求测试里重复手写字符串匹配。
- `helpers/pinia.ts`、`helpers/dom.ts`：集中管理测试 Pinia、主题 DOM 和 `matchMedia` 夹具；页面测试优先复用这些 helper。
