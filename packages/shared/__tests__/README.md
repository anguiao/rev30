# shared 测试边界

- `schemas/*.test.ts`：共享 API schema 测试，验证请求、响应和错误结构的运行时解析与规范化，不重复覆盖前后端调用流程。
- `schemas/system/*.test.ts`：系统管理领域 schema 测试，覆盖表单输入、列表查询、树结构响应、资源授权和字段级校验消息。
- `utils/*.test.ts`：纯工具函数测试，关注树转换、过滤、计数和勾选键规范化等可复用行为。
- `helpers/*`：测试辅助函数，集中放置 schema 错误文本和稳定测试 ID 等跨文件夹具。
