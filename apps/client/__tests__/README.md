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
- `helpers/colada.ts`：显式组装当前测试所需的 Pinia Colada 与 query cache；页面和 Drawer 不读取 Vue app context 私有状态。
- `helpers/promise.ts`：统一构造可控 Promise，只用于异步竞态和 stale response 场景。
- `helpers/pinia.ts`、`helpers/dom.ts`：集中管理测试 Pinia、主题 DOM 和 `matchMedia` 夹具；页面测试优先复用这些 helper。

## 运行方式

```bash
pnpm --filter @rev30/client test
pnpm --filter @rev30/client test __tests__/pages/system/users.test.ts
pnpm --filter @rev30/client coverage
```

覆盖率用于发现未加载入口和分支盲区，不设置百分比门槛，也不属于 `pnpm check`。HTML 报告生成在 `apps/client/coverage/`。

## DOM 定位约定

- 优先使用用户可感知的语义定位目标，例如元素角色、可访问名称、表单标签、可见文本、链接地址和原生控件类型。文案或可访问名称本身属于行为契约时，测试应在其变化后失败。
- `data-test` 只用于语义不足、同名目标难以区分、Naive UI 复合控件、重复表格操作或传送弹层等无法稳定定位的场景；它只负责找到目标，不表达或断言业务状态。
- 找到目标后，通过可见结果、表单值、`disabled`、`aria-pressed`、`aria-selected`、`aria-expanded` 等真实语义断言状态。不要让 `data-test` 随状态变化，也不要直接断言它的值。
- 不要为了替代 `data-test` 添加虚假的 ARIA 属性。控件确实缺少可访问语义时，应将其作为用户可见行为一并完善。
- `data-test` 使用 kebab-case，按 `<feature-or-component>-<part-or-action>` 命名。动态后缀只能来自稳定的内部枚举或 action key，不包含状态、翻译文案、数组下标、数据库 ID 或用户输入。
- 单个控件的定位器在当前查询作用域内保持唯一；重复列表项可以共享定位器，再通过可见内容或局部作用域筛选。只有传送到组件外部的弹层才查询 `document.body`。
- 测试定位器按需添加，不为未来用例预留，也不放在纯布局容器、分隔线或装饰图标上。项目统一使用 `data-test`，并保留在生产 DOM 中；测试不得把它当作安全边界或公开兼容性契约。
