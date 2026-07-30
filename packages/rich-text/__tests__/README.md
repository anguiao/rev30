# rich-text 测试边界

- `core/*`：在 Node 环境验证 feature identity 和 editor/server implementation 完整性。
- `architecture/*`：通过 Vite 内存构建同时检查加载图和最终 bundle，防止跨端误引入或 preset 静态拉入未选 feature。
- `server/*`、`features/*/server.test.ts`、`presets/*`、`schema.test.ts`：在 Node 环境验证服务端派生、清洗策略、preset 组合和共享 schema，避免意外依赖 DOM。
- `vue/*`、`features/*/vue*`、`features/*/shared.test.ts`：在 happy-dom 环境验证编辑器命令、组件交互和渲染行为。
- `helpers/editor.ts`：创建测试 Editor，并在单个测试结束时先销毁 Editor、再移除对应 DOM 节点；不要在测试文件里重复维护 Editor 数组。
- `setup.ts`：统一卸载 Vue wrapper；测试文件只保留领域特有的 mock、timer 和全局资源清理。

## DOM 定位约定

- 优先使用角色、可访问名称、可见文本和编辑器输出等用户可感知语义；工具栏、菜单、弹窗和网格应优先通过既有的 `role` 与 ARIA 属性定位和断言。
- `data-test` 只作为稳定定位器，用于动态 action、Naive UI 复合控件或缺少唯一语义名称的编辑器区域。不要直接断言 `data-test` 的值或顺序，也不要让它编码激活、展开、禁用等状态。
- 激活与选择状态分别使用 `aria-pressed`、`aria-selected`，弹层状态使用 `aria-expanded`，禁用状态使用 `disabled` 或 `aria-disabled`；最终编辑器 JSON、HTML、selection 和焦点行为仍是功能断言的主要依据。
- 不要为了测试添加与真实交互不符的 ARIA 属性。只用于视觉样式的内部状态应由可见行为覆盖，不额外暴露 `data-active` 等测试专用状态属性。
- `data-test` 使用 kebab-case 和 `rich-text-` 前缀，动态后缀只取稳定的 feature、control、action 或 option key。重复工具项应先限定 toolbar、menu 或 quick bar 作用域，再按可访问名称或内容区分。
- 定位器按需添加，不放在纯布局容器、分隔线或装饰图标上。属性保留在生产 DOM 中，但不是安全边界、业务状态来源或公开兼容性契约。
