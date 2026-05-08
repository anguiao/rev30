# User Password And Account Settings Design

## 背景

当前系统用户管理已经支持查看、编辑和删除用户，但还没有产品可用的后台新增用户功能。
前端用户列表里已有 `新增用户` 按钮的展示规则，但按钮尚未接入创建交互；服务端已有
`POST /api/system/users` 的数据创建接口雏形，但它只创建 `users`、部门关联和角色关联，
不写入 `auth_password_credentials`。因此，本轮不是简单接线已有新增用户能力，而是要
补齐“管理员创建可登录用户”的完整闭环。

同时，用户通过临时密码进入系统后，也需要能自行接管账号：修改自己的基础资料和密码。
这部分能力不应放进系统管理菜单，也不应依赖角色资源授权；它属于当前登录用户的账号
能力。

## 目标

1. 实现后台新增用户功能，新增时由系统生成临时密码，并同时创建密码凭据。
2. 新增成功后只在本次响应和前端提示中展示一次临时密码。
3. 管理员可以重置非内置用户密码，重置后生成新的临时密码并撤销该用户会话。
4. 登录用户可以修改自己的昵称、邮箱和手机号。
5. 登录用户可以修改自己的密码，修改时必须提供当前密码。
6. 管理员生成的临时密码凭据带有“需要改密”标记，为后续强制改密流程预留状态。
7. 个人设置入口放在后台侧边栏用户区域，不加入服务端菜单资源树。
8. 所有新增能力使用共享 zod schema 描述请求和响应。

## 非目标

本轮不实现：

- 用户导入、头像、详情页。
- 管理员手动输入初始密码。
- 强制首次登录改密、密码过期策略、忘记密码或自助找回密码。
- 用户自行修改用户名、状态、部门或角色。
- 菜单资源中的个人设置入口。
- 登录后强制跳转改密页；本轮只记录“需要改密”状态，不启用拦截流程。
- refresh token 历史清理；这类维护任务后续由独立定时任务处理。

## 密码生成与凭据写入

服务端新增一个临时密码生成工具，放在认证密码模块附近，和 `hashPassword()` 保持同一
边界。临时密码使用加密安全随机数生成，长度满足现有密码 schema 的最小要求，并采用
便于复制的 URL-safe 字符串。

后台创建用户时：

1. 校验 `userCreateSchema`。
2. 生成临时密码。
3. 哈希临时密码。
4. 在同一个事务里创建 `users`、`auth_password_credentials`、部门关联和角色关联。
5. 密码凭据写入 `mustChangePassword: true`，表示该密码由管理员生成，用户后续应自行改密。
6. 返回 `{ user, temporaryPassword }`。

`auth_password_credentials` 增加布尔字段 `mustChangePassword`，默认值为 `false`。现有
注册、bootstrap 和用户自行修改密码写入 `false`；管理员新增用户和管理员重置密码写入
`true`。本轮不把该字段加入普通 `User` 响应，也不根据它做登录拦截。

明文临时密码不写数据库、不写日志、不进入普通 `User` 类型，只存在于本次响应里。

## 管理员重置密码

新增接口：

- `POST /api/system/users/:id/password/reset`
- 权限：`system:user:reset-password`
- 响应：`{ userId, temporaryPassword }`

重置流程：

1. 校验用户存在且未删除。
2. 内置用户不可重置密码，返回 409。
3. 生成新的临时密码并更新 `auth_password_credentials.passwordHash`。
4. 将该用户密码凭据的 `mustChangePassword` 更新为 `true`。
5. 撤销该用户所有未撤销 refresh sessions。
6. 返回一次性临时密码。

撤销 refresh session 是重置密码的安全语义，不属于历史 token 清理。用户已有 access
token 在过期前可能仍可用，但无法继续刷新会话。

## 个人设置

新增一个登录用户可访问的个人设置页面：

- 路由：`/account/settings`
- 不加入服务端菜单资源树。
- 由现有登录守卫保护。
- 入口位于后台侧边栏底部用户信息区域。

非折叠侧边栏中，用户昵称和用户名区域可点击进入个人设置。折叠侧边栏中，显示一个账号
或设置图标按钮，并使用 tooltip 标注“个人设置”。

页面包含两个区块。

基础资料：

- 字段：昵称、邮箱、手机号。
- 不允许修改用户名。
- 保存成功后刷新当前 auth store 里的 `user`，侧边栏昵称即时更新。

修改密码：

- 字段：当前密码、新密码、确认新密码。
- 当前密码必须验证通过。
- 新密码沿用现有密码规则。
- 修改成功后更新密码 hash，将 `mustChangePassword` 置为 `false`，并撤销当前用户其它
  refresh sessions。
- 当前浏览器会话尽量保留：如果请求携带可验证的 refresh cookie，则撤销其它 refresh
  sessions 时排除当前 refresh session；如果无法识别当前 refresh session，则撤销该用户
  全部 refresh sessions。

## Auth API

个人设置接口放在认证域，而不是系统管理域：

- `PATCH /api/auth/me/profile`
  - 请求：`{ nickname, email, phone }`
  - 响应：更新后的 `User`
- `PATCH /api/auth/me/password`
  - 请求：`{ currentPassword, newPassword }`
  - 响应：`204 No Content`

这两个接口通过现有 auth middleware 识别当前用户。个人资料更新复用用户唯一约束错误
处理；密码修改失败时，当前密码错误返回 400，并在响应里携带 `field: 'currentPassword'`，
前端展示到“当前密码”字段。

## Shared Schema

共享包新增或扩展 schema：

- `userCreateResponseSchema`
  - `user: userSchema`
  - `temporaryPassword: z.string().min(8)`
- `userResetPasswordResponseSchema`
  - `userId: z.uuid()`
  - `temporaryPassword: z.string().min(8)`
- `authProfileUpdateSchema`
  - `nickname`
  - `email`
  - `phone`
- `authPasswordUpdateSchema`
  - `currentPassword`
  - `newPassword`

`userCreateSchema` 继续不包含密码字段。管理员无需输入初始密码，密码由服务端生成。

## 前端请求与交互

系统用户请求模块新增：

- `createUser(input)` -> `POST /api/system/users`
- `resetUserPassword(id)` -> `POST /api/system/users/:id/password/reset`

认证请求模块新增：

- `updateMyProfile(input)` -> `PATCH /api/auth/me/profile`
- `updateMyPassword(input)` -> `PATCH /api/auth/me/password`

用户管理页：

- 当前 `新增用户` 按钮只按权限展示，本轮为它接入点击行为，打开 `UserFormDrawer` 的
  新增模式。
- 新增模式加载部门树和角色选项，但不加载用户详情。
- 保存成功后关闭抽屉、刷新列表，并弹出一次性临时密码提示。
- 非内置用户行增加“重置密码”操作。
- 重置密码需要确认；成功后弹出一次性临时密码提示。

临时密码提示：

- 展示用户名或用户标识和临时密码。
- 提供复制按钮。
- 关闭后不再保留明文密码；如果管理员忘记复制，只能再次重置密码。

个人设置页：

- 基础资料表单保存成功后调用 auth store 新增的 `setUser(user)` 方法更新当前用户。
- 修改密码表单保存成功后清空密码字段并展示成功消息。

## 权限资源

新增按钮权限资源：

- `system:user:reset-password`

该资源挂在用户管理菜单下，仅控制管理员是否看到和使用重置密码操作。新增用户继续使用
已有 `system:user:create`。个人设置不新增菜单资源或按钮权限，登录用户均可访问。

## 错误处理

新增用户：

- 唯一约束冲突展示到对应字段。
- 部门无效时后端返回 `field: 'departmentIds'`，前端展示到“所属部门”字段。
- 角色无效时后端返回 `field: 'roleIds'`，前端展示到“角色”字段。
- 保存失败不关闭抽屉。

重置密码：

- 用户不存在展示错误消息。
- 内置用户不展示入口；后端仍返回 409 保护边界。
- 请求失败不展示临时密码。

个人设置：

- 当前密码错误展示到当前密码字段。
- 新密码校验错误展示到新密码字段。
- 基础资料唯一冲突展示到对应字段。
- 保存失败保留页面输入。

## 测试设计

共享 schema：

- 创建用户响应包含用户和临时密码。
- 重置密码响应包含用户 ID 和临时密码。
- 个人资料更新不允许 username。
- 修改密码请求校验当前密码和新密码。

服务端：

- 创建用户时写入密码凭据，并返回临时密码。
- 管理员创建或重置密码时，密码凭据 `mustChangePassword` 为 `true`。
- 使用返回的临时密码可以登录。
- 创建用户时，部门或角色失效返回对应字段错误。
- 重置密码后旧密码不能登录，新临时密码可以登录。
- 重置密码撤销该用户 refresh sessions。
- 内置用户不能被重置密码。
- 当前用户可修改昵称、邮箱和手机号。
- 当前用户修改密码需要正确当前密码。
- 当前用户修改密码后，密码凭据 `mustChangePassword` 为 `false`。
- 当前用户修改密码后，其它 refresh sessions 不能继续刷新。

前端：

- 新增用户按钮打开新增抽屉。
- 新增用户提交后调用创建接口、刷新列表并展示临时密码。
- 重置密码操作按权限显示，成功后展示临时密码。
- 个人设置入口不出现在菜单资源中，但可从侧边栏用户区域进入。
- 个人资料保存后更新侧边栏昵称。
- 修改密码表单展示字段级错误并在成功后清空密码字段。

## 验证路径

手动验证时使用下面路径：

1. 管理员新增一个普通用户，复制临时密码。
2. 退出管理员账号。
3. 使用新用户和临时密码登录。
4. 进入个人设置，修改基础资料。
5. 修改密码。
6. 退出并使用新密码重新登录。
7. 管理员重置该用户密码后，确认旧 refresh session 无法继续刷新。

## 实施顺序

1. 先补共享 schema 和服务端创建用户凭据能力。
2. 再补管理员重置密码接口和会话撤销。
3. 接入前端用户新增与重置密码。
4. 最后补个人设置 API、页面和侧边栏入口。

这个顺序让“管理员创建可登录用户”先闭环，再扩展用户自助接管账号。
