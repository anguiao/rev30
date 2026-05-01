# Auth Frontend Design

## 背景

当前项目已经具备认证后端和很薄的前端骨架：

- `apps/server` 已提供 `/api/auth/register`、`/api/auth/login`、`/api/auth/refresh`、`/api/auth/logout` 和 `/api/auth/me`。
- 登录和注册成功时，后端返回 access token、refresh token 和当前用户，同时设置 HTTP-only `refresh_token` cookie。
- `apps/client` 使用 Vue 3、Vite、Vue Router、Pinia、Naive UI、Tailwind CSS v4、TanStack Form 和 Hono RPC client。
- 当前客户端只有空白首页，还没有认证页面、会话状态或受保护路由。

本次实现前端认证入口：登录页、注册页和受保护首页。设计采用工作台式入口，不做营销型落地页。

## 目标

1. 实现 `/login` 登录页，支持 `username + password` 登录。
2. 实现 `/register` 注册页，支持 `username`、`nickname`、`password`、可选 `email` 和可选 `phone`。
3. 登录或注册成功后自动进入 `/`。
4. `/` 是受保护页面；未登录访问时先尝试 refresh，失败后跳转 `/login`。
5. refresh token 只依赖后端设置的 HTTP-only cookie，前端不保存 refresh token。
6. access token 只保存在内存状态，不写入 `localStorage` 或其他持久化存储。
7. 使用 Hono RPC typed client 调用接口，并通过二次封装 fetch 注入 cookie 和 Authorization 行为。
8. 使用 Pinia Colada 管理请求状态，但避免为简单 mutation/query 额外封装组合式函数。
9. 使用 Naive UI 组件构建表单，使用 TanStack Form 管理表单状态和校验。

## 非目标

第一版不实现忘记密码、重置密码、邮箱登录、手机号登录、第三方登录、验证码、记住我、多设备管理、角色权限、完整后台仪表盘或复杂个人资料页。

第一版不把 access token 持久化到浏览器存储，也不在前端读取或保存 refresh token 响应字段。

## 视觉方向

认证入口采用“工作台式入口”：

- 整体背景为浅灰工作区，界面安静、可信、适合后台系统。
- 桌面端使用左右结构：左侧为认证表单，右侧为简短系统上下文、安全提示或入口状态。
- 移动端为单列布局，表单优先，辅助上下文下移或压缩。
- 使用 Naive UI 表单、输入框、按钮和提示组件，减少自绘交互控件。
- 品牌名 `Rev30` 在首屏清晰可见，但不做夸张 hero。
- 不使用营销式卡片网格、装饰性渐变球或大量口号文案。

## 路由与页面

新增页面：

- `apps/client/src/pages/login.vue`
- `apps/client/src/pages/register.vue`

修改页面：

- `apps/client/src/pages/index.vue`

首页 `/`：

- 强制登录。
- 已登录时显示当前用户摘要、用户名、昵称和退出按钮。
- 不实现业务仪表盘，只作为认证流程的第一版承接页面。

登录页 `/login`：

- 已登录访问时跳转 `/`。
- 字段：`username`、`password`。
- 提交成功后写入内存 session 并跳转 `/`。
- 提供去 `/register` 的入口。

注册页 `/register`：

- 已登录访问时跳转 `/`。
- 字段：`username`、`nickname`、`password`、`email`、`phone`。
- `email` 和 `phone` 可选。
- 提交成功后写入内存 session 并跳转 `/`。
- 提供回 `/login` 的入口。

## Hono RPC Client

客户端继续使用 Hono RPC，而不是手写 `fetch('/api/...')`：

```ts
import { hc } from 'hono/client'
import type { AppType } from '@rev30/server'

export const api = hc<AppType>('/api', {
  fetch: authFetch,
})
```

`authFetch` 负责请求边界能力：

- 默认设置 `credentials: 'same-origin'`，让 refresh cookie 随 `/api/auth/refresh` 等同源请求发送。
- 当 `useAuthStore()` 中存在 `accessToken` 时，自动附加 `Authorization: Bearer <token>`。
- 保留调用方传入的 headers，不覆盖 Hono RPC 自动设置的 method 和 body。

业务代码仍使用 typed RPC：

- `api.auth.login.$post({ json: body })`
- `api.auth.register.$post({ json: body })`
- `api.auth.refresh.$post()`
- `api.auth.logout.$post()`
- `api.auth.me.$get()`

## 会话状态

新增 `useAuthStore`，只保存内存会话：

- `accessToken`
- `user`
- `isReady`

Store 行为：

- `setSession(result)`：保存 access token 和用户。
- `clearSession()`：清空 access token 和用户。
- `markReady()`：标记初始 session 恢复流程完成。

Store 不调用接口，不管理 mutation loading 状态，不保存 refresh token，不做本地持久化。

## Pinia Colada

新增 `@pinia/colada` 到客户端依赖，并在 `main.ts` 安装 Pinia Colada 插件。

Pinia Colada 使用原则：

- 页面或路由启动逻辑直接使用 `useMutation`、`useQuery` 或 query cache。
- 不为简单登录、注册、退出额外创建 `useLoginMutation`、`useRegisterMutation` 之类的二次组合式函数。
- 只有当重复逻辑明显影响可读性时，才抽取薄工具函数；不提前抽象。

请求状态由 Pinia Colada 管理：

- 登录提交 loading 和错误。
- 注册提交 loading 和错误。
- refresh 恢复 session 的 pending 状态。
- logout 提交状态。

## Session 恢复与路由守卫

新增路由守卫：

- 进入 `/` 前，如果 store 已有 `accessToken`，允许进入。
- 如果没有 `accessToken` 且 `isReady` 为 false，调用 `api.auth.refresh.$post()` 尝试恢复 session。
- refresh 成功时写入 store 并允许进入 `/`。
- refresh 失败时清空 store，标记 ready，并跳转 `/login`。
- 进入 `/login` 或 `/register` 前，如果已经登录，跳转 `/`。

页面刷新后的流程：

1. 内存里的 access token 丢失。
2. 用户访问 `/`。
3. 路由守卫调用 `/api/auth/refresh`。
4. 浏览器自动携带 HTTP-only refresh cookie。
5. 成功后拿到新的 access token 和用户，进入 `/`。
6. 失败则进入 `/login`。

## 表单与校验

表单使用 TanStack Form 管理字段状态、提交状态和错误信息，使用 Naive UI 展示控件。

登录表单：

- 使用 `authLoginSchema` 作为校验来源。
- `username` 必填。
- `password` 最少 8 位。

注册表单：

- 使用 `authRegisterSchema` 作为校验来源。
- `username` 必填。
- `nickname` 必填。
- `password` 最少 8 位。
- `email` 可选。
- `phone` 可选。

当前项目使用 `@tanstack/vue-form` 和 `zod`。实现时用 TanStack Form 管字段、字段错误和提交边界，在 validate/submit 阶段调用共享 zod schema，并将 zod issue 映射到 TanStack Form 字段错误。

提交注册前，表单值先经过共享 schema 解析；空的 `email` 和 `phone` 会按当前 `userCreateSchema` 语义转换为 `null`，避免把无意义空字符串当成有效业务输入。

## 错误处理

错误只在用户可见边界处理：

- 登录返回 `401` 时，表单顶部显示“用户名或密码错误”。
- 注册返回 `409` 且包含 `field` 时，在对应字段显示冲突错误。
- 注册返回 `409` 但没有字段信息时，显示表单顶部通用错误。
- refresh 失败时清空 session 并跳转 `/login`，不显示全局错误。
- logout 无论服务端是否成功，都清空本地 session，之后跳转 `/login`。
- 网络错误或未知错误显示 Naive UI `n-alert`。

不添加宽泛 try/catch、重复 fallback 或与后端规则不一致的前端防御逻辑。

## 文件结构

预计新增或修改：

- `apps/client/package.json`：增加 `@pinia/colada`。
- `apps/client/src/api.ts`：保留 Hono RPC，注入 `authFetch`。
- `apps/client/src/stores/auth.ts`：内存 session store。
- `apps/client/src/router.ts`：添加认证路由守卫。
- `apps/client/src/main.ts`：安装 Pinia Colada。
- `apps/client/src/pages/login.vue`：登录页。
- `apps/client/src/pages/register.vue`：注册页。
- `apps/client/src/pages/index.vue`：受保护首页。
- `apps/client/src/api.test.ts`：覆盖 custom fetch 行为。
- `apps/client/src/stores/auth.test.ts`：覆盖 session store。
- `apps/client/src/router.test.ts`：覆盖受保护路由和 refresh 恢复。
- `apps/client/src/pages/auth-pages.test.ts`：覆盖登录和注册页面行为。

如果认证 shell 布局在登录和注册之间产生明显重复，可新增一个局部组件，例如：

- `apps/client/src/components/AuthShell.vue`

该组件只负责布局，不持有认证业务逻辑。

## 测试设计

实现按 TDD 执行，先写失败测试再写实现。

客户端 API 测试：

- Hono RPC custom fetch 默认带 `credentials: 'same-origin'`。
- 有 access token 时，RPC 请求带 `Authorization` header。
- 无 access token 时，不发送 Authorization。

Store 测试：

- `setSession()` 写入 access token 和用户。
- `clearSession()` 清空 access token 和用户。
- `markReady()` 标记 session 恢复完成。

路由守卫测试：

- 未登录访问 `/` 时会尝试 refresh。
- refresh 成功后进入 `/` 并写入 session。
- refresh 失败后跳转 `/login`。
- 已登录访问 `/login` 或 `/register` 时跳转 `/`。

页面行为测试：

- 登录表单非法时，TanStack Form 阻止提交并显示字段错误。
- 登录成功后写入 session 并导航 `/`。
- 登录 `401` 显示用户名或密码错误。
- 注册表单非法时，TanStack Form 阻止提交并显示字段错误。
- 注册成功后写入 session 并导航 `/`。
- 注册唯一字段冲突时显示对应字段错误。

视觉不做快照测试。完成后通过本地浏览器检查桌面和移动端布局。
