# Rich Text

## 架构边界

- 按 feature-first 结构维护 shared、editor、server 和 Vue 实现；通用 core、schema 与 preset 不依赖 Vue、Naive UI 或服务端清洗代码。
- server 入口不得引入 Vue/editor 模块，Vue/editor 入口不得引入 server 模块；消费方只使用 `package.json` 声明的公开 subpath exports。
- 新增或调整 feature 时，同步检查 feature 声明、editor/server implementation 以及 `all`、`compact` preset；不要让 compact 静态加载未启用 feature。
- 富文本校验、文档约束和 HTML 清洗必须保留在可信服务端；浏览器派生不能作为生产安全边界。
