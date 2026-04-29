# AGENTS.md

## 项目约定

- 对话和项目文档使用中文，代码与注释使用英文。
- 使用 pnpm workspace；内部包依赖保持 `workspace:*`。
- 前端位于 `apps/client`，使用 Vue 3、Vite、Tailwind CSS v4 和 Iconify class。
- 服务端位于 `apps/server`，使用 Hono、Drizzle；开发默认 PGlite，生产通过 `DATABASE_URL` 使用 PostgreSQL。
- 共享 zod schema 和 TypeScript 类型放在 `packages/shared`。
- 代码检查使用 oxlint，格式化使用 oxfmt。
- 提交信息遵循 Conventional Commits，标题使用英文，并保持与历史提交格式一致。

## 常用验证

- `pnpm check`
- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`
- `pnpm format:check`
