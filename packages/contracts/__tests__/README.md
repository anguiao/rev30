# contracts 测试边界

- `schemas/*`：验证公开请求、响应和表单 schema 的解析、默认值、规范化、边界值及领域错误，不重复测试 Zod 自身行为。
- 失败场景通过 `helpers/schema.ts#expectZodIssue` 直接断言 issue 的 `message` 和必要的 `path`，不要依赖 `z.prettifyError` 的展示格式。
- 大型领域测试按 query、input、response 语义组织 describe/用例；只有在文件职责确实独立时才拆文件，避免为减行增加重复导入成本。
