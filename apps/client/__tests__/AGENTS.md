# 前端测试约定

- `utils`、`stores`、`directives` 测纯逻辑或小型集成点；`features` 测组件行为；`pages` 使用真实 Router、Pinia 和 Naive UI provider 测页面行为。
- 请求测试覆盖 URL、method、请求体、响应解析和错误映射；通用解析与错误分支集中在 `utils` 测试，不在 feature 中重复。
- 编译期契约只由 `pnpm typecheck` 覆盖，不增加运行时断言。
- 遵循 `vitest.config.ts` 的 node/dom project 划分，不在测试文件中声明 `@vitest-environment`。
- 优先复用 `helpers` 中的 fetch、Pinia、DOM、Colada 和可控 Promise 夹具。
- 优先按角色、可访问名称、标签和可见文本定位，并断言真实语义状态；不要为了测试添加虚假 ARIA 属性。
- 仅在语义不足时使用 `data-test`。名称使用 kebab-case 和稳定 key，不编码状态、文案、下标、数据库 ID 或用户输入。
