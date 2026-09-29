# Rev30

Rev30 是一个 TypeScript monorepo，包含 Vue 客户端、Hono API、共享契约与工具包，提供认证、系统管理、内容管理和运维管理能力。

## 目录结构

- `apps/server`：Node.js + Hono + Drizzle API，提供健康检查、认证、系统管理、内容管理和组件演示接口。
- `apps/client`：Vue 3 + Vite 前端，包含登录、后台管理壳层，以及系统管理、内容管理、运维管理和组件演示页面；后台侧栏支持菜单搜索及 Ctrl/Cmd+K 快捷导航，通过 `/api` 代理调用服务端。
- `packages/contracts`：前后端共用的 zod schema、请求/响应契约和 TypeScript 类型。
- `packages/rich-text`：跨端复用的 Tiptap feature、preset、Vue 编辑器和服务端内容派生能力；图片插入支持本地多图与按用途接入的图片库混选。
- `packages/utils`：前后端共用的纯 TypeScript 工具函数。
- `playgrounds/*`：仅供本地开发、展示和实验的私有 package，不属于生产应用；当前包含 `playgrounds/rich-text`。

前端业务代码按功能放在 `apps/client/src/features`，页面路由由 `apps/client/src/pages` 的文件结构生成。

## 技术栈

- 前端：Vue 3、Tailwind CSS v4、Naive UI、Pinia、Pinia Colada、Vue ECharts、TanStack Vue Form、`vue-router/vite`。
- 服务端：Hono、Drizzle、PGlite（开发）/ PostgreSQL（生产）、Hono typed client。
- 工程化：pnpm workspace、TypeScript、Vitest、oxlint、oxfmt。

## 本地开发

首次运行先复制服务端环境文件，并在执行 `db:bootstrap` 前确认 `BOOTSTRAP_ADMIN_*` 账号信息；本地认证密钥也建议改成非默认值。`db:bootstrap` 只需执行一次。

```bash
pnpm install
cp apps/server/.env.example apps/server/.env
pnpm --filter @rev30/server db:bootstrap
pnpm --filter @rev30/server icon-search:build
pnpm dev
```

服务端默认监听 `http://localhost:3000`，客户端默认监听 `http://localhost:3200`。

开发环境默认使用 `.pglite/dev` 并自动应用迁移，不需要 `DATABASE_URL`。生产环境使用 PostgreSQL 18 或更高版本，并设置 `NODE_ENV=production` 和 `DATABASE_URL`。

客户端 IP 默认只使用 socket IP。只有实际受控的反向代理或负载均衡器出口 IP/CIDR 才应配置到 `TRUSTED_PROXY_CIDRS`；这些代理必须覆盖客户端传入的 `X-Forwarded-For`，或按规范向现有链追加其直连来源地址，不能原样信任客户端传入的整条链。正式值由部署系统注入。

通用附件默认使用本地私有存储，文件目录由 `ATTACHMENT_STORAGE_DIR` 控制，默认 `.attachments/dev`。

## 运行与运维

### 图标搜索

图标选择器和内容管理图标库共用数据库搜索索引。内置图标数据来自 `@iconify/json` 和[中文维护数据](apps/server/resources/icon-search/README.md)，自定义图标使用名称及关键词参与搜索。

首次开发、搜索产物缺失，或图标包及维护数据变更后，运行 `pnpm --filter @rev30/server icon-search:build` 并重启服务；发布构建会自动生成搜索产物。索引更新需要交换 `icon_search_documents` 与 `icon_search_documents_staging` 及其索引，生产数据库连接角色必须拥有这些对象。

### 系统配置

配置项由[代码注册表](apps/server/src/modules/system/configs/registry.ts)定义，数据库仅保存自定义覆盖值。系统配置页支持按配置键、名称和说明筛选，以及编辑自定义值或恢复默认值；恢复默认值会清除数据库中的覆盖记录。

### 健康检查

公开探针 `GET /api/health/live` 检查进程和 HTTP 路由；`GET /api/health/ready` 检查数据库，失败时返回 `503`。两个接口无需登录，均设置 `Cache-Control: no-store`；部署探针客户端应设置请求超时。

运维系统健康页面 `/ops/system-health` 展示当前实例、数据库、附件存储及定时任务状态，并提供任务统计和最近异常，要求 `ops:system-health:list` 权限。页面只展示当前响应实例，不提供集群视图；关联运行日志另需 `ops:scheduled-job:list` 权限。

### 认证会话与审计

登录会创建数据库会话；退出、修改或重置密码、停用或删除用户、管理员强制下线后，关联令牌在下一次认证检查时失效。短期签名附件 URL 独立于会话撤销。

运维页面 `/ops/login-logs`、`/ops/online-sessions` 和 `/ops/operation-logs` 分别提供登录日志、在线会话管理和业务操作日志。菜单资源由迁移创建，不自动授权普通角色；接口仍按各自访问码校验权限。

会话、登录日志、操作日志和附件清理由数据库持久化的定时任务计划管理；保留期等参数见 [`apps/server/.env.example`](apps/server/.env.example)。

### 附件

附件上传依次创建上传会话、使用临时 PUT URL 上传、完成登记。普通附件使用短期签名内容 URL；头像等资源可使用要求登录态的稳定内容 URL。上传会话和签名内容 URL 的有效期由系统配置控制，签名密钥由 `ATTACHMENT_SIGNING_SECRET` 配置。

附件列表会显示公告图片和用户头像的使用位置。有附件删除权限的用户可以删除正在使用的附件；删除不会改写业务记录，头像读取失败时显示默认头像。附件清理由定时任务处理。

### 管理员初始化与应急恢复

系统资源和 `admin` 角色由迁移写入；初始管理员由 `pnpm --filter @rev30/server db:bootstrap` 创建，账号信息读取 `BOOTSTRAP_ADMIN_*` 环境变量。该命令仅用于首次初始化：数据库已有内置用户记录时会拒绝再次执行，不会覆盖或提升同名普通用户。

知道原密码时可在个人设置中修改；普通用户忘记密码时，由有权限的管理员在用户管理中重置。内置管理员忘记密码时，由具备服务器及数据库管理权限的运维人员在目标环境的交互式终端执行：

```bash
pnpm --filter @rev30/server db:recover-admin --username admin
```

恢复命令只接受已启用、未删除且持有有效 `admin` 角色的内置管理员。确认账号后生成随机临时密码，仅在终端显示一次，并在同一事务中撤销旧会话；登录后页面会提醒修改密码。

## 常用命令

```bash
pnpm dev
pnpm dev:server
pnpm dev:client
pnpm dev:playground:rich-text
pnpm --filter @rev30/rich-text-playground exec playwright install chromium
pnpm check
pnpm test
pnpm coverage
pnpm typecheck
pnpm lint:check
pnpm format:check
pnpm build
pnpm --filter @rev30/server db:generate
pnpm --filter @rev30/server db:migrate
```

`pnpm coverage` 生成各测试 package 的 V8 覆盖率报告，不包含在 `pnpm check` 中。单包和定向测试分别使用 `pnpm --filter <pkg> coverage`、`pnpm --filter <pkg> test <package-relative-test-file>`。

富文本 Playground 默认监听 `http://localhost:3210`；Chromium 浏览器测试首次运行前执行一次安装命令即可。
