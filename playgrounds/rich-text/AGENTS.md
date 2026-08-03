# Rich Text Playground

## 边界

- 这是本地展示和真实 Chromium 契约测试 package，不属于生产应用；不要加入业务 API、认证、数据库或内容持久化。
- 只通过 `@rev30/rich-text` 的公开 exports 使用能力，不导入应用代码或 package 私有源码。
- 在浏览器中显式使用 server preset 是测试配对和派生流程的有意行为，不代表生产安全边界。

## 测试与验证

- `test:browser:clipboard:ui` 会覆盖系统剪贴板且不会恢复；未经用户明确确认不要运行。
