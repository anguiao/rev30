# Role And User Management Design

## 背景

当前项目已经完成系统用户、部门、角色、资源的后端 CRUD API，并且前端已经接入登录态、
服务端菜单资源、`accessCodes`、`auth.can()` 和 `v-can` 指令。后台系统页目前主要是
只读列表：角色页能看到角色和操作入口，用户页能看到用户和关联部门、角色，但新增、
编辑、删除按钮还没有实际交互。

权限系统还缺少一个管理员可操作的闭环：创建或编辑角色、给角色授权资源、再把角色分配
给用户。没有这个闭环时，资源访问码和菜单权限只能通过测试数据、迁移或脚本验证，产品
侧很难直接验证普通用户的权限变化。

## 目标

1. 角色管理页支持新增、编辑、删除角色。
2. 角色新增和编辑支持维护角色名称、编码、状态、排序和资源授权。
3. 用户管理页支持编辑和删除用户。
4. 用户编辑支持维护用户名、昵称、邮箱、手机号、状态、部门和角色。
5. 角色和用户编辑都使用右侧抽屉，不新增独立路由。
6. 表单使用字段级校验和必要的字段级服务端错误展示。
7. 保存或删除成功后刷新当前列表。
8. 权限验证链路可以通过“注册普通用户 -> 管理员分配角色 -> 普通用户重新登录或刷新页面”
   完成。

## 非目标

本轮不实现：

- 后台新增用户。
- 后台创建登录凭证、修改密码、重置密码或禁用刷新会话。
- 部门管理和资源管理的新增、编辑、删除表单。
- 资源树拖拽排序、角色批量授权、用户批量操作或导入导出。
- 审计日志、操作记录、回收站或删除恢复。
- 管理操作后自动刷新当前浏览器的 auth session。

注册页仍然是创建可登录用户的入口。后台用户编辑只维护 `users` 基础资料、部门关联和
角色关联，不维护 `auth_password_credentials`。

## 页面交互

### 角色管理

`/system/roles` 保持现有列表、筛选和分页结构。

新增角色：

- 点击 `新增角色` 打开右侧抽屉。
- 抽屉使用空表单默认值。
- 资源授权树通过 `GET /api/system/resources/tree` 加载。
- 提交成功后关闭抽屉并刷新当前角色列表。

编辑角色：

- 点击行内 `编辑` 打开右侧抽屉。
- 抽屉先通过 `GET /api/system/roles/:id` 加载详情。
- 基础字段回填角色详情。
- 资源授权树使用详情里的 `resources[].id` 回填勾选状态。
- 提交成功后关闭抽屉并刷新当前角色列表。

删除角色：

- 点击行内 `删除` 打开确认弹窗。
- 确认后调用 `DELETE /api/system/roles/:id`。
- 成功后刷新当前角色列表。
- 如果角色有关联用户，展示后端返回的删除冲突消息。

### 用户管理

`/system/users` 保持现有列表、筛选、分页和 `新增用户` 按钮现状。`新增用户` 按钮继续按
现有权限规则显示，但本轮不实现创建用户交互。

编辑用户：

- 点击行内 `编辑` 打开右侧抽屉。
- 抽屉先通过 `GET /api/system/users/:id` 加载详情。
- 基础字段回填用户详情。
- 部门选择通过 `GET /api/system/departments/tree` 加载树数据，并用
  `departments[].id` 回填。
- 角色选择通过 `GET /api/system/roles` 加载选项，并用 `roles[].id` 回填。
- 提交成功后关闭抽屉并刷新当前用户列表。

删除用户：

- 点击行内 `删除` 打开确认弹窗。
- 确认后调用 `DELETE /api/system/users/:id`。
- 成功后刷新当前用户列表。

### Session 更新策略

系统管理操作只更新业务数据，不主动更新当前浏览器里的 auth session。

原因：

- 编辑角色和编辑用户都保持一致体验：保存后只刷新当前管理列表。
- 当前会话里的菜单和按钮权限不因为后台数据变化产生隐性刷新规则。
- 目标用户通过刷新页面、重新登录，或后续 token 刷新获得最新权限。

验证权限变化时，使用普通用户重新登录或刷新页面作为明确步骤。

## 组件边界

角色页拆分为：

- `apps/client/src/pages/index/system/roles.vue`
  - 负责列表、筛选、分页、打开抽屉、删除确认和刷新列表。
- `apps/client/src/features/system/RoleFormDrawer.vue`
  - 内部包含 `NDrawer`、角色表单、资源树加载、详情加载、保存和错误展示。

用户页拆分为：

- `apps/client/src/pages/index/system/users.vue`
  - 负责列表、筛选、分页、打开抽屉、删除确认和刷新列表。
- `apps/client/src/features/system/UserFormDrawer.vue`
  - 内部包含 `NDrawer`、用户表单、部门树加载、角色选项加载、详情加载、保存和错误展示。

`NDrawer` 本身放在独立表单组件里。页面只通过 `v-model:show`、`role-id` 或 `user-id`
控制抽屉，并监听 `saved` 事件刷新列表。删除确认留在页面里，因为它和表格行操作更紧密。

抽屉宽度使用桌面后台常见宽度，优先从 `640px` 起步。表单内部允许滚动，资源树和部门树
放在抽屉内容区内，不改变列表页面的滚动上下文。

## 表单设计

表单继续沿用现有认证页的模式：

- `@tanstack/vue-form` 管理字段状态。
- shared zod schema 作为提交校验。
- `formItemValidationProps()` 渲染 Naive UI 字段错误。
- `setServerFieldError()` 写入服务端字段错误。

### 角色表单字段

- `name`：必填。
- `code`：必填。
- `status`：启用或禁用。
- `sortOrder`：整数。
- `resourceIds`：资源 ID 数组。

资源授权树展示全部未删除资源。目录、菜单、外链和操作资源都可以被勾选。树节点显示资源
名称和资源编码，避免同名资源难以区分。

### 用户表单字段

- `username`：必填。
- `nickname`：必填。
- `email`：可选，空字符串提交为 `null`。
- `phone`：可选，空字符串提交为 `null`。
- `status`：启用或禁用。
- `departmentIds`：部门 ID 数组。
- `roleIds`：角色 ID 数组。

部门用树选择，角色用多选。角色选项第一版通过 `pageSize: 100` 拉取启用和禁用角色，
保持与后端列表能力一致；如果后续角色数量变大，再增加专用轻量选项接口或远程搜索。

## API 和请求模块

本轮后端不新增业务接口，只复用已有系统接口。

角色请求：

- `listRoles(query)`：已存在。
- `getRole(id)` -> `GET /api/system/roles/:id`。
- `createRole(input)` -> `POST /api/system/roles`。
- `updateRole(id, input)` -> `PATCH /api/system/roles/:id`。
- `deleteRole(id)` -> `DELETE /api/system/roles/:id`。

用户请求：

- `listUsers(query)`：已存在。
- `getUser(id)` -> `GET /api/system/users/:id`。
- `updateUser(id, input)` -> `PATCH /api/system/users/:id`。
- `deleteUser(id)` -> `DELETE /api/system/users/:id`。

辅助请求：

- `getResourceTree()`：已存在。
- `getDepartmentTree()`：已存在。
- `listRoles({ page: 1, pageSize: 100 })`：作为用户角色选项来源。

系统请求错误对象扩展为可携带 `field`。用户唯一约束冲突已经由后端返回字段名；角色编码
冲突需要后端把 `RoleConflictError` 响应扩展为 `{ field: 'code', message }`。前端解析
非 `ok` 响应时保留 `field`，供表单组件设置字段级错误。

## 错误处理

抽屉详情加载失败：

- 抽屉保持打开。
- 顶部显示 `NAlert`。
- 表单保持禁用或加载态，不允许提交缺失详情的数据。

保存失败：

- 抽屉不关闭。
- 如果错误包含字段名，则显示到对应字段。
- 如果错误没有字段名，则在抽屉顶部显示全局错误。

删除失败：

- 关闭确认弹窗 loading。
- 使用页面消息展示后端错误。
- 不刷新列表。

权限不足：

- 继续使用现有 `v-can` 和 `auth.can()` 隐藏入口。
- 没有权限的操作不展示禁用态。

## 测试设计

请求 helper：

- 覆盖 `getRole`、`createRole`、`updateRole`、`deleteRole`。
- 覆盖 `getUser`、`updateUser`、`deleteUser`。
- 覆盖系统错误响应里的 `field` 解析。

角色页和角色抽屉：

- 无权限时新增、编辑、删除入口隐藏。
- 点击新增打开抽屉并提交角色基础字段和 `resourceIds`。
- 点击编辑加载详情并回填基础字段和资源勾选。
- 角色编码冲突显示到 `code` 字段。
- 删除确认调用删除接口，成功后刷新列表。

用户页和用户抽屉：

- 无权限时编辑、删除入口隐藏。
- 点击编辑加载用户详情、部门树和角色选项。
- 提交用户名、昵称、联系方式、状态、`departmentIds`、`roleIds`。
- 用户名、邮箱、手机号冲突显示到对应字段。
- 删除确认调用删除接口，成功后刷新列表。

端到端验证路径：

1. 注册普通用户。
2. 管理员登录。
3. 创建或编辑角色并勾选资源权限。
4. 编辑普通用户并分配角色。
5. 普通用户重新登录或刷新页面。
6. 验证菜单、页面访问和按钮显示符合角色授权。

## 验证命令

实现完成后运行：

```bash
pnpm check
```

必要时单跑：

```bash
pnpm --filter @rev30/client test -- roles
pnpm --filter @rev30/client test -- users
pnpm --filter @rev30/client test -- requests
pnpm --filter @rev30/server test -- roles
```
