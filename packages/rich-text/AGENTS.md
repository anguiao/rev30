# Rich Text

## 架构边界

- 生产源码按 `core`、`client`、`server` 和 `content` 四种职责组织，并继续以 `features/<name>` 作为主要维护单元；feature 的跨端语义放在 `core/`，编辑器实现放在 `client/editor.ts`，Vue UI 放在 `client/vue/`，可信服务端实现放在 `server/`，展示 CSS 放在 `content/`。
- `core` 可使用 Tiptap/ProseMirror schema 和纯规则，但不得依赖 `client`、`server`、`content`、Vue、Naive UI 或 sanitize；`server` 可依赖 package core、feature core 和自身基础设施，但不得依赖 client/Vue、Naive UI 或 content CSS。
- `client/vue` 可以依赖 `core` 和 `client/editor`，形成 `client/vue -> client/editor` 的单向依赖；`client/editor` 不得反向依赖 `client/vue`、server 或 content CSS。
- `core/presets`、`client/vue/presets`、`server/presets` 和 `content/presets` 是职责内显式的 composition roots，可以组合对应 feature 实现；其他基础设施和具体 feature 不直接组合多个 feature，也不跨越禁止边界。
- content 只包含用于派生 HTML 展示的静态 CSS；它不导入 TypeScript 运行时代码，core/server 不导入 CSS，只有 Vue preset composition root 可通过 side effect 导入对应 content preset。
- server 入口不得引入 client/Vue 模块，Vue/editor 入口不得引入 server 模块；消费方只使用 `package.json` 声明的公开 subpath exports。
- 新增或调整 feature 时，同步检查 feature 声明、editor/server implementation 以及 `all`、`compact` preset；不要让 compact 静态加载未启用 feature。
- 富文本校验、文档约束和 HTML 清洗必须保留在可信服务端；浏览器派生不能作为生产安全边界。
