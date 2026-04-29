# Rev30

Rev30 是一个 TypeScript monorepo 骨架，包含 Hono 服务端、Vue 客户端和前后端共享约束包。

## 目录结构

- `apps/server`：Node.js + Hono + Drizzle API。开发环境默认使用 PGlite，生产环境使用 PostgreSQL。
- `apps/client`：Vue 3 + Vite 前端。开发环境通过 `/api` 代理调用服务端。
- `packages/shared`：前后端共用的 zod schema 和 TypeScript 类型。

## 本地开发

```bash
pnpm install
pnpm dev
```

服务端默认监听 `http://localhost:3000`，客户端默认监听 `http://localhost:5173`。

开发环境不需要 `DATABASE_URL`。部署到 PostgreSQL 时设置 `NODE_ENV=production` 和 `DATABASE_URL`。

## 常用命令

```bash
pnpm dev
pnpm dev:server
pnpm dev:client
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```
