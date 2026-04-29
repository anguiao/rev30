# Monorepo Scaffold Design

## 背景

项目从空仓库开始搭建一个 TypeScript monorepo。首版目标是提供最小可运行骨架，而不是完整业务应用。仓库需要包含三个子包：

- `apps/server`：Node.js 运行时的 Hono 服务，使用 Drizzle 管理数据库访问；开发环境数据库使用 PGlite，部署环境使用 PostgreSQL。
- `apps/client`：Vue 3 客户端，使用 Hono RPC 与服务端交互，UI 组件库使用 Naive UI。
- `packages/shared`：前后端共用约束，首版包含 zod schema 和由 schema 推导出的类型。

根目录使用 pnpm workspace 管理包，linter 和 formatter 使用 oxc 生态。

## 目标

首版完成后，开发者可以：

1. 安装依赖并启动 server 与 client。
2. 从 Vue 页面通过 Hono RPC 调用 server。
3. 在 server 和 client 之间共享 zod schema 和类型。
4. 在本地开发时使用 PGlite，在部署时通过 `DATABASE_URL` 切换到 PostgreSQL。
5. 使用 oxc 命令执行 lint 和 format 检查。

## 非目标

首版不实现完整业务 CRUD，不搭建认证、权限、复杂路由、CI、容器镜像或部署脚本。数据库迁移只提供基础 Drizzle 配置和 schema 示例，避免把骨架做成过重的 demo app。

## 架构

仓库采用轻量 pnpm workspace：

- 根目录保存 workspace、TypeScript、oxc、脚本和环境示例配置。
- `packages/shared` 作为纯 TypeScript 包，对外导出 `profileSchema`、`Profile` 等共用约束。
- `apps/server` 引用 `@rev30/shared`，定义 Hono app 和 RPC 路由，并导出 `AppType`。
- `apps/client` 引用 `apps/server` 的 `AppType` 类型，通过 `hc<AppType>()` 创建 RPC client。

包之间的依赖方向是：

```text
apps/client -> apps/server types -> packages/shared
apps/server -> packages/shared
```

`apps/server` 的运行时代码不会依赖 `apps/client`。`apps/client` 只通过类型引用 server 的 `AppType`，不引入 server 运行时代码。

## 服务端设计

`apps/server` 使用 Hono 和 `@hono/node-server`。首版提供：

- `GET /api/health`：返回服务状态。
- `GET /api/profile`：返回一个通过 shared zod schema 校验的示例 profile。

数据库层使用 Drizzle：

- 开发环境默认使用 PGlite adapter。
- 当 `DATABASE_URL` 存在且 `NODE_ENV=production` 时使用 PostgreSQL adapter。
- `src/db/schema.ts` 定义一个最小 `profiles` 表，字段与 shared schema 保持一致。
- `src/db/index.ts` 负责根据环境创建 db 实例。

首版接口可以返回示例数据，但数据库连接和 schema 必须真实存在，确保后续添加 CRUD 时有清晰入口。

## 客户端设计

`apps/client` 使用 Vue 3、Vite、Composition API 和 Naive UI。首屏是一个真实可运行的应用界面，而不是落地页。界面包含：

- 应用标题。
- 一个健康状态区域，展示从 `/api/health` 获取的服务状态。
- 一个 profile 区域，展示从 `/api/profile` 获取的数据。
- 一个刷新按钮，重新通过 Hono RPC 请求数据。

开发环境下，Vite 通过代理把 `/api` 请求转发到 server，避免跨域配置成为首版复杂度。

## Shared 包设计

`packages/shared` 只保存跨端约束：

- zod schema。
- schema 推导出的 TypeScript 类型。
- 必要的常量约束。

首版不放业务逻辑、HTTP client、数据库工具或 UI 相关代码。

## 工具链

根目录脚本：

- `pnpm dev`：并行启动 server 和 client。
- `pnpm dev:server`：启动 server。
- `pnpm dev:client`：启动 client。
- `pnpm build`：构建所有包。
- `pnpm lint`：运行 oxlint。
- `pnpm format`：运行 oxfmt 写入格式化。
- `pnpm format:check`：运行 oxfmt 检查。
- `pnpm typecheck`：运行各包 TypeScript 检查。

代码格式由 oxc 生态负责，不引入 Prettier。ESLint 不作为首版工具链。

## 错误处理

首版只做系统边界校验：

- 服务端返回 shared schema 校验后的 profile。
- 客户端请求失败时展示 Naive UI message，并保留页面结构。
- 不添加过度 try/catch、fallback 或宽泛空值兜底。

## 验证

实施完成后至少运行：

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm format:check`
5. `pnpm build`

如果依赖安装受网络限制阻塞，需要记录阻塞原因，并在可用命令范围内完成静态检查。
