# AGENTS.md

## 项目约定

- 对话和项目文档使用中文，代码与注释使用英文。
- 使用 pnpm workspace；内部包依赖保持 `workspace:*`。
- 前端位于 `apps/client`，基于 Vue 3 + Vite。
- 优先使用 Naive UI 组件，非必要不覆盖样式；优先复用已定义的主题工具类，避免硬编码等效值。
- 图标优先使用 Iconify 原子类，格式为 `i-[collection--name]`。
- 服务端位于 `apps/server`，基于 Hono + Drizzle；API 统一挂在 `/api`。
- 共享 zod schema、请求/响应契约和 TypeScript 类型放在 `packages/contracts`，前后端尽量复用这些约束。
- 跨端纯工具函数放在 `packages/utils`；不要和接口契约混放。
- 优先复用项目和依赖提供的 TypeScript 类型，不为绕过检查自定义宽松类型。
- 数据库 schema 在 `apps/server/src/db/schema.ts`；开发用 PGlite，生产用 `DATABASE_URL`。
- 代码检查使用 oxlint，格式化使用 oxfmt；提交前注意废弃 API 检查。
- 只添加必要测试：优先覆盖用户可见行为、核心业务规则和回归风险；避免为纯重构、导入整理或内部实现细节添加冗余测试。
- 提交信息使用英文，遵循不带 scope 的 Conventional Commits，并保持与历史提交一致的 `type: subject` 格式。
- 当用户可见功能、目录结构或项目概览发生明显变化时，按需更新 `README.md`。

## 常用验证

- 完整验证：`pnpm check`
- 按需单跑：`pnpm typecheck`、`pnpm test`、`pnpm lint:check`
- 定向运行 Vitest 时，使用 `pnpm --filter <pkg> test <package-relative-test-file>`，不要在 `test` 后添加 `--`。

## 常用开发命令

- 本地联调：`pnpm dev`
- 单端启动、数据库脚本和其它命令见 `README.md` 的“常用命令”或 `package.json` scripts。
