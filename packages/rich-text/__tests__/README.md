# rich-text 测试边界

- `core/*`：在 Node 环境验证 feature identity、依赖关系和 editor/server implementation 完整性。
- `architecture/*`：通过 Vite 内存构建同时检查加载图和最终 bundle，防止跨端误引入或 preset 静态拉入未选 feature。
- `server/*`、`features/*/server.test.ts`、`presets/compact.test.ts`、`schema.test.ts`：在 Node 环境验证服务端派生、清洗策略、preset 组合和共享 schema，避免意外依赖 DOM。
- `vue/*`、`features/*/vue*`、`features/*/shared.test.ts`：在 happy-dom 环境验证编辑器命令、组件交互和渲染行为。
- `helpers/editor.ts`：创建测试 Editor，并在单个测试结束时先销毁 Editor、再移除对应 DOM 节点；不要在测试文件里重复维护 Editor 数组。
- `setup.ts`：统一卸载 Vue wrapper；测试文件只保留领域特有的 mock、timer 和全局资源清理。
