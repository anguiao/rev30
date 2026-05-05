# Rev30

Rev30 是一个 TypeScript monorepo 项目，包含 Vue 客户端、Hono API、共享 zod schema，以及基于 Drizzle 的认证和系统管理基础能力。

## 目录结构

- `apps/server`：Node.js + Hono + Drizzle API，提供健康检查、认证和系统用户、部门、角色、资源接口。
- `apps/client`：Vue 3 + Vite 前端，包含登录、注册、后台管理壳层，以及系统用户、部门、角色、资源只读管理页面，通过 `/api` 代理调用服务端。
- `packages/shared`：前后端共用的 zod schema 和 TypeScript 类型。

## 技术栈

- 前端：Vue 3、Tailwind CSS v4、Naive UI、Pinia、Pinia Colada、TanStack Vue Form、`vue-router/vite`。
- 服务端：Hono、Drizzle、PGlite（开发）/ PostgreSQL（生产）、Hono typed client。
- 工程化：pnpm workspace、TypeScript、Vitest、oxlint、oxfmt。

## 本地开发

```bash
pnpm install
pnpm dev
```

服务端默认监听 `http://localhost:3000`，客户端默认监听 `http://localhost:5173`。

开发环境不需要 `DATABASE_URL`，默认使用 `.pglite/dev` 并自动应用迁移。部署到 PostgreSQL 时设置 `NODE_ENV=production` 和 `DATABASE_URL`。

服务端环境变量可从 `apps/server/.env.example` 复制起步；认证相关密钥在本地也建议改成非默认值。

## 常用命令

```bash
pnpm dev
pnpm dev:server
pnpm dev:client
pnpm test
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm check:deprecated
pnpm build
pnpm --filter @rev30/server db:generate
pnpm --filter @rev30/server db:migrate
```
