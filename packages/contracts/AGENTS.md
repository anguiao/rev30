# Contracts

## 实现约定

- 这里只放跨端 zod schema、请求/响应契约、常量和由 schema 推导的 TypeScript 类型，不加入业务逻辑、HTTP client、数据库或 UI 代码。
- 类型优先使用 `z.infer` 从 schema 推导，不维护重复的宽松接口。
- 公共能力通过 `src/index.ts` 导出。
- 修改公开契约时同步检查 client 请求解析、server 边界校验和相关测试。
