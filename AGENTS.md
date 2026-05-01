# AGENTS.md

## 项目约定

- 对话和项目文档使用中文，代码与注释使用英文。
- 使用 pnpm workspace；内部包依赖保持 `workspace:*`。
- 前端位于 `apps/client`，使用 Vue 3、Vite、Tailwind CSS v4、Naive UI、Pinia、Pinia Colada、TanStack Vue Form 和 `vue-router/vite` 文件路由。
- Iconify 图标类使用 `i-[collection--name]` 格式（如 `i-[lucide--sun]`）。
- 服务端位于 `apps/server`，使用 Hono、Drizzle、PGlite/PostgreSQL；API 统一挂在 `/api`。
- 共享 zod schema 和 TypeScript 类型放在 `packages/shared`，前后端请求/响应尽量复用这些约束。
- 当前业务核心包含认证、刷新令牌、登录态恢复，以及受 Bearer token 保护的系统用户管理。
- 数据库 schema 在 `apps/server/src/db/schema.ts`；开发环境默认 `.pglite/dev` 并自动应用迁移，生产通过 `DATABASE_URL` 使用 PostgreSQL。
- 代码检查使用 oxlint，格式化使用 oxfmt；提交前注意废弃 API 检查。
- 只添加必要测试：优先覆盖用户可见行为、核心业务规则和回归风险；避免为纯重构、导入整理或内部实现细节添加冗余测试。
- 提交信息遵循 Conventional Commits，标题使用英文，并保持与历史提交格式一致。

## 常用验证

- `pnpm check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint:check`
- `pnpm format:check`
- `pnpm check:deprecated`

## 常用开发命令

- `pnpm dev`
- `pnpm dev:server`
- `pnpm dev:client`
- `pnpm --filter @rev30/server db:generate`
