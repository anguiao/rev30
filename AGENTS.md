# AGENTS.md

## 项目约定

- 对话和项目文档使用中文，代码与注释使用英文。
- 仅当用户明确提及时，才使用 Superpowers 相关技能。
- 使用 pnpm workspace；内部包依赖保持 `workspace:*`。
- 前端位于 `apps/client`，基于 Vue 3 + Vite；具体 UI、状态、表单和路由依赖以 `package.json` 为准。
- 后台区域使用 `apps/client/src/pages/index.vue` 作为布局，后台子路由放在 `apps/client/src/pages/index/` 下；业务模块目录本身默认不作为可导航页面。
- Iconify 图标类使用 `i-[collection--name]` 格式（如 `i-[lucide--sun]`）。
- 服务端位于 `apps/server`，基于 Hono + Drizzle；API 统一挂在 `/api`。
- 共享 zod schema 和 TypeScript 类型放在 `packages/shared`，前后端请求/响应尽量复用这些约束。
- 数据库 schema 在 `apps/server/src/db/schema.ts`；开发环境默认 `.pglite/dev` 并自动应用迁移，生产通过 `DATABASE_URL` 使用 PostgreSQL。
- 代码检查使用 oxlint，格式化使用 oxfmt；提交前注意废弃 API 检查。
- 只添加必要测试：优先覆盖用户可见行为、核心业务规则和回归风险；避免为纯重构、导入整理或内部实现细节添加冗余测试。
- 提交信息遵循 Conventional Commits，标题使用英文，并保持与历史提交格式一致。
- 当用户可见功能、目录结构或项目概览发生明显变化时，按需更新 `README.md`；本文件仅维护协作和实现约定。

## 常用验证

- 完整验证：`pnpm check`
- 按需单跑：`pnpm typecheck`、`pnpm test`、`pnpm lint:check`

## 常用开发命令

- 本地联调：`pnpm dev`
- 单端启动、数据库脚本和其它命令见 `README.md` 的“常用命令”或 `package.json` scripts。
