# Client

## 实现约定

- 页面路由由 `src/pages` 的文件结构生成。
- API 调用复用 `src/api.ts` 的 Hono client，并使用 `packages/contracts` 的 schema 解析响应；不要重复声明接口类型。
- 对 `apps/server` 只使用 `AppType` 类型依赖，不引入服务端运行时代码。
- 优先使用 Naive UI 和现有主题工具类，非必要不覆盖组件样式或硬编码等效主题值。
- 图标优先使用 Iconify 原子类，格式为 `i-[collection--name]`。
