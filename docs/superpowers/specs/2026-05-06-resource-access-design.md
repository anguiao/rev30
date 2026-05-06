# Resource Access Design

## 背景

当前项目已经完成认证、刷新令牌、登录态恢复，以及系统用户、部门、角色、资源的
后端 CRUD API。前端也已经有桌面优先的后台管理壳层和四个系统管理只读页面。

现有系统资源、角色、角色资源关联已经存在，但它们还没有参与登录态、接口鉴权或
前端菜单渲染。系统 API 目前只要求 Bearer token，任何已登录且启用的用户都可以访问
全部 `/api/system/*` 接口。后台侧边栏也仍是手写静态导航，没有使用 Naive UI 菜单组件。

这一轮要把资源权限闭环接通，但暂不进入系统模块的新增、编辑、删除表单。

## 目标

1. 登录、刷新、恢复登录态时返回当前用户的资源访问码和可见菜单树。
2. 普通用户通过启用角色关联的启用资源获得访问能力。
3. 拥有启用 `admin` 角色的用户拥有全部启用资源访问能力。
4. 系统 API 通过 `requireAccess(code)` 做接口授权。
5. 未登录仍返回 `401`；已登录但无访问权返回 `403`。
6. 前端 auth store 保存访问码和菜单，并提供 `can(code)` 判断。
7. 前端新增 `v-can` 指令，用于按钮和入口级显示控制。
8. 后台侧边栏改用 Naive UI `NMenu`，菜单项由后端返回的菜单资源树生成。
9. 增加内置系统资源和 `admin` 角色的初始数据方案。
10. 增加显式 bootstrap 命令创建或更新初始管理员用户。
11. 系统资源 `icon` 字段存储 Iconify 图标名称，并通过 `@iconify/vue` 和本地图标 API 展示。

## 非目标

本轮不实现：

- 系统用户、部门、角色、资源的新增、编辑、删除表单。
- 角色资源授权树编辑界面。
- 动态文件路由生成或远程页面组件加载。
- 资源树拖拽排序、菜单在线配置后的热刷新或多标签页同步。
- 数据库层行级权限、租户隔离或审计日志。
- 复杂权限表达式，例如资源码通配符、黑名单、字段权限或数据范围权限。
- `admin` 角色的资源勾选状态展示或特殊编辑限制。
- 继续使用 Iconify Tailwind 原子类作为系统资源 `icon` 的持久化格式。

## 命名约定

后端中间件命名为：

```ts
requireAccess('system:user:list')
```

`requireAccess` 使用动词原形，因为它是中间件工厂，语义是“访问此接口需要某个资源码”。
不使用 `requiresAccess`，该名字更适合布尔属性；也不使用 `requiredAccess`，该名字更
适合配置字段。

前端 store 提供：

```ts
auth.can('system:user:create')
```

模板指令命名为：

```vue
<NButton v-can="'system:user:create'">新增用户</NButton>
```

API 响应字段命名为 `accessCodes`，而不是 `permissions`。本项目的授权来源是
`system_resources.code`，`accessCodes` 能表达“这些 code 可以访问”，也能和
`requireAccess`、`auth.can`、`v-can` 保持同一套语义。

## 资源访问模型

系统资源仍由 `system_resources` 表承载。资源类型沿用现有定义：

- `directory`：菜单目录。
- `menu`：内部菜单。
- `external`：外链菜单。
- `action`：操作权限。

普通用户的访问码来源：

1. 用户必须启用且未删除。
2. 用户关联的角色必须启用且未删除。
3. 角色关联的资源必须启用且未删除。
4. 汇总资源 `code` 并去重，得到 `accessCodes`。

`admin` 用户的访问码来源：

1. 用户必须启用且未删除。
2. 用户拥有启用且未删除的 `code = 'admin'` 角色。
3. 用户获得全部启用且未删除资源的 `code`。

`admin` 全权限只依赖角色编码和服务端规则，不依赖 `role_resources` 绑定。这样后续新增
内置资源时，不会出现 `admin` 角色既有全权限规则、又有一份可能过期授权关系的双重真相。

## 登录态响应

登录、刷新和恢复登录态返回统一结构：

```ts
{
  user,
  accessToken,
  tokenType,
  expiresIn,
  accessCodes,
  menus,
}
```

`accessCodes` 是字符串数组，包含当前用户可访问的启用资源码。

`menus` 是菜单资源树，只包含满足以下条件的资源：

- 当前用户可访问。
- 资源启用且未删除。
- 资源类型为 `directory`、`menu` 或 `external`。
- `hidden` 为 `false`。

`menus` 不包含 `action`。如果父级目录没有访问权，即使某个子菜单有访问权，也不自动补齐
父级目录。资源授权需要保持显式，避免前端菜单表现和后台资源配置不一致。后续角色授权
界面可以引导分配父级目录和子菜单。

## 初始数据

初始数据拆成两部分。

### 内置资源和角色

新增数据库 migration，插入固定 ID 的内置系统资源树和 `admin` 角色：

- 用户管理相关菜单和动作。
- 部门管理相关菜单和动作。
- 角色管理相关菜单和动作。
- 资源管理相关菜单和动作。
- `code = 'admin'` 的管理员角色。

migration 不写入 `role_resources`。`admin` 的全权限由服务端规则保证，普通角色仍通过
`role_resources` 获得访问码。

内置资源 code 采用稳定命名：

- `system:user:list`
- `system:user:create`
- `system:user:update`
- `system:user:delete`
- `system:department:list`
- `system:department:create`
- `system:department:update`
- `system:department:delete`
- `system:role:list`
- `system:role:create`
- `system:role:update`
- `system:role:delete`
- `system:resource:list`
- `system:resource:create`
- `system:resource:update`
- `system:resource:delete`

菜单资源可以使用 `system:user`、`system:department`、`system:role`、`system:resource`
这类 code。列表接口可以同时要求对应 `*:list` 动作资源，避免“能看到菜单”和“能请求列表”
完全绑定在一个资源上。

系统资源 `icon` 字段存储 Iconify 图标名称，例如：

- `lucide:users`
- `lucide:building-2`
- `lucide:shield-check`
- `lucide:blocks`

`icon` 不存储 `i-[lucide--users]` 这类 Tailwind/Iconify 原子类。原子类属于前端展示实现，
持久化 Iconify 名称能复用已实现的图标 API，也方便后续在表格、菜单、选择器等不同位置
用同一份数据渲染图标。

### 初始管理员用户

新增显式 bootstrap 命令：

```bash
pnpm --filter @rev30/server db:bootstrap
```

命令读取环境变量创建或更新初始管理员用户，并绑定 `admin` 角色。密码不写入 migration，
也不在生产启动时隐式创建默认账号。

建议环境变量：

```text
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=change-me-admin-password
BOOTSTRAP_ADMIN_NICKNAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=
BOOTSTRAP_ADMIN_PHONE=
```

如果用户已存在，bootstrap 更新昵称、联系方式、启用状态和密码，并确保绑定 `admin`
角色。如果用户不存在，bootstrap 创建用户、密码凭据和角色绑定。

## 后端设计

新增资源访问查询能力，职责集中在系统资源或认证相关模块中，避免把 SQL 分散到每个路由。

推荐职责：

- 查询用户启用角色。
- 判断用户是否拥有启用 `admin` 角色。
- 查询普通用户角色关联的启用资源码。
- 查询 `admin` 用户的全部启用资源码。
- 根据访问码生成菜单树。

`createAuthService()` 的 `login`、`refresh`、`me` 在拿到用户后补齐 `accessCodes` 和
`menus`。`createAuthMiddleware()` 继续负责解析 token、设置 `currentUser`，并额外设置
当前请求可用的访问上下文，供 `requireAccess` 使用。

`requireAccess(code)` 行为：

- 如果请求上下文没有当前用户，返回 `401`。
- 如果当前用户拥有启用 `admin` 角色，直接通过。
- 如果当前用户 `accessCodes` 包含目标 code，通过。
- 否则返回 `403` 和 `{ message: '无权访问' }`。

系统模块路由按资源码挂载授权中间件，例如：

- `GET /api/system/users`：`requireAccess('system:user:list')`
- `POST /api/system/users`：`requireAccess('system:user:create')`
- `PATCH /api/system/users/:id`：`requireAccess('system:user:update')`
- `DELETE /api/system/users/:id`：`requireAccess('system:user:delete')`

部门、角色、资源模块使用同样的 `list/create/update/delete` 资源码。

资源创建和更新接口继续把 `icon` 作为可选字段，但共享 schema 需要把它约束为 Iconify
图标名称格式，例如 `lucide:users`。空值仍归一化为 `null`。如果传入
`i-[lucide--users]` 或其他展示层 class，接口返回现有 zod 校验错误。

## 前端设计

auth store 新增状态：

```ts
accessCodes: string[]
menus: MenuResource[]
```

并新增方法：

```ts
can(code: string): boolean
canAny(codes: string[]): boolean
canAll(codes: string[]): boolean
```

`can()` 是页面和业务逻辑最常用的入口。`canAny()`、`canAll()` 主要供 `v-can` 指令和少量
组合操作使用。

### Iconify 图标

客户端新增运行时依赖：

- `@iconify/vue`

客户端启动时配置 Iconify 默认 API provider 指向本项目已实现的图标接口：

```ts
import { addAPIProvider } from '@iconify/vue'

addAPIProvider('', {
  resources: [window.location.origin],
  path: '/api/icons/',
})
```

这样 `Icon` 组件使用 `lucide:users` 这类不带自定义 provider 的图标名时，会请求
`/api/icons/lucide.json?icons=users`，而不是公共 Iconify API。

系统资源 `icon` 字段在前端保持 Iconify 图标名称。需要渲染时使用 `@iconify/vue` 的
`Icon` 组件：

```ts
import { Icon } from '@iconify/vue'

h(Icon, {
  icon: resource.icon,
  height: 16,
})
```

主题切换等仍使用现有 Iconify 原子类不在本轮强制替换；本轮只要求系统资源菜单使用
`@iconify/vue` 渲染数据库中的 Iconify 图标名称。

### `v-can` 指令

新增客户端指令模块：

```text
apps/client/src/directives/can.ts
```

指令支持：

```vue
<NButton v-can="'system:user:create'">新增用户</NButton>
<NButton v-can.any="['system:user:update', 'system:user:delete']">更多操作</NButton>
<NButton v-can.all="['system:role:update', 'system:role:delete']">批量维护</NButton>
```

默认语义等同 `.all`。字符串判断单个资源码，数组在默认或 `.all` 下要求全部拥有，`.any`
要求至少拥有一个。

无访问权时指令移除元素，而不是禁用元素。后台权限语义下，不可用操作不应制造可见噪音。
后续如果需要解释性禁用按钮，可以再扩展 `.disabled`，本轮不实现。

### Naive UI 侧边栏

`AdminLayout.vue` 改用 Naive UI `NMenu`，不再手写 `<ul>` 和 `RouterLink` 列表。

后端返回的 `menus` 转换为 `MenuOption[]`：

- `key` 使用内部路径或外链 URL。
- `label` 对内部菜单渲染 `RouterLink`。
- `label` 对外链菜单渲染 `a`，保留 `openTarget`。
- `icon` 使用资源 `icon` 字段，渲染 `@iconify/vue` 的 `Icon` 组件。
- `children` 递归转换子菜单。

当前选中项根据 `route.path` 计算后传给 `NMenu`。如果当前路径没有匹配菜单，选中值为空。
如果用户没有任何可见菜单，后台壳层展示空状态，不跳转到固定页面。

路由仍保留静态文件路由。直接访问无菜单权限的页面时，页面请求会得到 `403`，页面展示
无权访问状态；后续可以补统一 403 页面，本轮保持在现有页面错误态中处理。

## 错误处理

服务端：

- 未登录、token 无效、token 过期继续由现有 auth middleware 返回 `401`。
- 已登录但无访问权由 `requireAccess` 返回 `403` 和 `{ message: '无权访问' }`。
- bootstrap 缺少用户名或密码时直接失败并输出明确错误。

前端：

- 请求层继续解析非 `ok` 响应的 `message`。
- `403` 作为普通业务错误传给页面。
- 页面加载无权访问时展示 `NAlert` 或 `NResult`。
- 按钮和入口通过 `v-can` 不渲染。
- 侧边栏没有可见菜单时展示空状态。

## 测试

按 TDD 实现，每个行为先写失败测试。

shared schema：

- auth token response 接收 `accessCodes`。
- auth token response 接收 `menus`。
- 菜单节点 schema 不包含 `action` 类型的使用示例。
- 资源 `icon` 字段接受 `lucide:users` 这类 Iconify 图标名称。
- 资源 `icon` 字段拒绝 `i-[lucide--users]` 这类展示层 class。

server service/repository：

- 普通用户汇总启用角色关联的启用资源 code。
- 禁用角色不贡献资源 code。
- 禁用资源不贡献资源 code。
- 启用 `admin` 角色用户获得全部启用资源 code。
- `admin` 不依赖 `role_resources` 绑定。
- 菜单树只包含可访问、启用、未隐藏、非 `action` 的资源。

server routes：

- 无 token 访问系统接口返回 `401`。
- 已登录但缺少 `system:user:list` 访问用户列表返回 `403`。
- 拥有 `system:user:list` 可以访问用户列表。
- `admin` 用户未绑定 `role_resources` 也可以访问用户列表。
- 抽样覆盖用户、部门、角色、资源四个模块都挂载了 `requireAccess`。

server bootstrap：

- 环境变量完整时创建管理员用户、密码凭据和 `admin` 角色绑定。
- 用户已存在时更新密码和资料，并确保绑定 `admin` 角色。
- 缺少用户名或密码时失败。

client store：

- `setSession()` 保存 `accessCodes` 和 `menus`。
- `clearSession()` 清空 `accessCodes` 和 `menus`。
- `can()`、`canAny()`、`canAll()` 按访问码返回正确结果。

client directive：

- `v-can="'code'"` 有权限时保留元素。
- `v-can="'code'"` 无权限时移除元素。
- `v-can.any` 至少一个命中时保留元素。
- `v-can.all` 缺少任意一个时移除元素。

client layout：

- `AdminLayout` 使用 `NMenu` 渲染后端菜单。
- 内部菜单渲染为 `RouterLink`。
- 外链菜单渲染为 `a`。
- 菜单图标使用 `@iconify/vue` 渲染 `lucide:users` 这类资源 `icon` 值。
- 当前路由对应菜单被选中。
- 没有菜单时展示空状态。

实现后运行：

```bash
pnpm test
pnpm typecheck
pnpm lint:check
pnpm format:check
```

如果 migration、bootstrap 或跨包类型改动较大，再运行完整：

```bash
pnpm check
```

## 交付顺序

1. 更新 shared auth 响应 schema 和菜单类型。
2. 添加内置资源和 `admin` 角色 migration。
3. 添加资源访问查询和 auth service 响应扩展。
4. 添加 `requireAccess` 中间件并挂载系统接口。
5. 添加 bootstrap 命令。
6. 更新资源 `icon` schema，使其使用 Iconify 图标名称。
7. 安装并配置 `@iconify/vue`，接入已实现的本地图标 API。
8. 更新客户端 auth store、请求类型和登录态恢复。
9. 添加 `v-can` 指令并注册。
10. 将 `AdminLayout` 侧边栏替换为 `NMenu`，菜单图标使用 `@iconify/vue`。
11. 给系统页面操作入口接入 `v-can`。
12. 运行验证并更新 README、AGENTS.md 中的项目进度。
