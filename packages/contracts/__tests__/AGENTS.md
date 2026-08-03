# Contracts 测试约定

- 验证公开 schema 的解析、默认值、规范化、边界值和领域错误，不重复测试 Zod 自身行为。
- 失败场景复用 `helpers/schema.ts` 的 `expectZodIssue`，断言必要的 `message` 和 `path`，不依赖展示格式。
- 大型领域测试按 query、input、response 组织；只有职责确实独立时才拆文件。
