# Rev30

Rev30 是一个 TypeScript monorepo 项目，包含 Vue 客户端、Hono API、共享接口契约与工具包，以及基于 Drizzle 的认证和系统管理基础能力。

## 目录结构

- `apps/server`：Node.js + Hono + Drizzle API，提供健康检查、认证、系统管理、内容管理和组件演示接口。
- `apps/client`：Vue 3 + Vite 前端，包含登录、后台管理壳层，以及系统管理、内容管理和组件演示页面，通过 `/api` 代理调用服务端。
- `packages/contracts`：前后端共用的 zod schema、请求/响应契约和 TypeScript 类型。
- `packages/rich-text`：跨端复用的 Tiptap feature、preset、Vue 编辑器和服务端内容派生能力。
- `packages/utils`：前后端共用的纯 TypeScript 工具函数。

## 技术栈

- 前端：Vue 3、Tailwind CSS v4、Naive UI、Pinia、Pinia Colada、TanStack Vue Form、`vue-router/vite`。
- 服务端：Hono、Drizzle、PGlite（开发）/ PostgreSQL（生产）、Hono typed client。
- 工程化：pnpm workspace、TypeScript、Vitest、oxlint、oxfmt。

## 当前项目进度

- 已完成基础 monorepo 结构，包含 Vue 客户端、Hono 服务端、共享接口契约和通用工具包。
- 当前业务核心包含认证、刷新令牌、登录态恢复、权限资源访问码授权、内置系统资源、显式管理员 bootstrap、管理员新增/重置系统用户密码、个人资料和密码维护能力，以及私有通用附件上传基础能力。
- 当前后端新增 Iconify API 兼容图标服务，可从 `@iconify/json` 按需读取全部已安装图标集，供后续 `@iconify/vue` 默认 provider 接入。
- 内容管理新增图标库页面，可浏览内置图标集，并维护自定义 SVG 图标集；自定义图标可导出 Iconify JSON 并接入运行时图标加载。
- 组件演示新增富文本页面，使用完整 preset 验证编辑器交互、代码语言选择与高亮、base64 图片、服务端 JSON 规范化、纯文本提取和安全 HTML 派生，全程不持久化演示正文。
- 当前前端后台管理壳层使用 Naive UI 菜单，由服务端菜单资源驱动，并支持 `v-can` 按钮级权限显示；系统配置页支持通用参数配置的新增、编辑、删除、筛选、分页和类型化值编辑；数据字典页已完成字典类型管理和字典项编辑；通知公告管理已支持草稿、发布、归档流转、可见范围配置、Tiptap JSON 正文存储和 HTML 展示派生，登录用户可从侧边栏入口查看自己可见的已发布通知公告；用户头像上传与回显、内容管理下的附件资源列表和删除管理已可用；登录用户可通过 `GET /api/system/dictionaries/options` 一次按多个 `codes` 获取字典选项；个人设置入口位于后台侧边栏用户区域，不占用菜单资源。

## 本地开发

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm --filter @rev30/server db:bootstrap
pnpm dev
```

服务端默认监听 `http://localhost:3000`，客户端默认监听 `http://localhost:3200`。

开发环境不需要 `DATABASE_URL`，默认使用 `.pglite/dev` 并自动应用迁移。数据库基线为 PostgreSQL 18+；当前 PGlite 版本基于 PostgreSQL 18，表主键默认使用数据库内置 `uuidv7()` 生成。部署到 PostgreSQL 时设置 `NODE_ENV=production` 和 `DATABASE_URL`，并使用 PostgreSQL 18 或更高版本。

服务端环境变量可从 `apps/server/.env.example` 复制起步；执行 bootstrap 前，请先在 `apps/server/.env` 中确认或修改 `BOOTSTRAP_ADMIN_*` 账号信息，认证相关密钥在本地也建议改成非默认值。
通用附件默认使用本地私有存储，文件目录由 `ATTACHMENT_STORAGE_DIR` 控制，默认 `.attachments/dev`。

- 附件上传使用上传会话：先创建上传会话，再通过临时 PUT URL 上传文件，最后 complete 写入附件元数据。
- 附件读取支持两种策略：普通附件默认使用短期签名内容 URL；头像等资源可使用稳定的 `/api/attachments/:id/content` URL。
- 稳定内容 URL 仍要求登录态，浏览器通过 `attachment_token` HttpOnly cookie 完成附件内容读取，不暴露 token 给前端 JS。
- `usage` 是任意非空业务记录字符串，前端不维护全局 usage 常量、选项列表或文案映射。
- 业务可为附件记录引用；常驻维护任务默认每 6 小时清理保留超过 7 天的孤儿上传文件，以及 `cleanupPolicy=unreferenced` 且无引用的附件。

临时 URL 签名密钥由 `ATTACHMENT_SIGNING_SECRET` 配置，内容访问 URL 默认有效期由 `ATTACHMENT_CONTENT_URL_TTL_SECONDS` 控制，上传会话默认有效期由 `ATTACHMENT_UPLOAD_SESSION_TTL_SECONDS` 控制。

图标搜索索引默认在闲置 `15` 分钟后释放，可通过 `ICON_SEARCH_INDEX_IDLE_TTL_MS` 调整毫秒数；设置为 `0` 可关闭自动释放。

系统资源和 `admin` 角色由迁移写入；初始管理员用户通过 `pnpm --filter @rev30/server db:bootstrap` 显式创建，账号信息从 `apps/server/.env` 中的 `BOOTSTRAP_ADMIN_*` 环境变量读取。

## 常用命令

```bash
pnpm dev
pnpm dev:server
pnpm dev:client
pnpm test
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm build
pnpm --filter @rev30/server db:bootstrap
pnpm --filter @rev30/server db:generate
pnpm --filter @rev30/server db:migrate
```
