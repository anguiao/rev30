---
status: implemented
date: 2026-11-24
---

# 操作日志重构与敏感查询审计设计

Rev30 已经能记录后台写操作和自定义图标集导出。业务 handler 调用 `recordOperation` 登记动作与目标，根中间件根据最终 HTTP 状态组装事件，运行时异步写入 `ops_operation_logs`。这次把登记移到路由声明，并将同一机制用于敏感管理查询。例如，用户列表已经展示联系方式和角色，仅审计详情会漏掉通过列表访问这些数据的行为。[原操作日志设计](./2026-08-19-operations-operation-logs-design.md) · [用户数据契约](../../packages/contracts/src/system/users.ts)

## 敏感读操作清单

下表列出本次新增的全部读审计。路径共用 `/api` 前缀。审计动作描述用户做了什么，访问权限仍由各路由现有的 `requireAccess` 检查。

| GET 路由 | 审计动作 | 页面显示 | 访问权限 |
| --- | --- | --- | --- |
| `/system/users` | `system:user:list` | 查询用户列表 | `system:user:list` |
| `/system/users/:id` | `system:user:view` | 查看用户详情 | `system:user:list` |
| `/system/roles` | `system:role:list` | 查询角色列表 | `system:role:list` |
| `/system/roles/:id` | `system:role:view` | 查看角色详情 | `system:role:list` |
| `/system/resources`、`/system/resources/tree` | `system:resource:list` | 查询权限资源 | `system:resource:list` |
| `/system/resources/:id` | `system:resource:view` | 查看权限资源详情 | `system:resource:list` |
| `/ops/login-logs` | `ops:login-log:list` | 查询登录日志 | `ops:login-log:list` |
| `/ops/sessions` | `ops:online-session:list` | 查询在线会话 | `ops:online-session:list` |
| `/ops/operation-logs/:id` | `ops:operation-log:view` | 查看操作日志详情 | `ops:operation-log:list` |

- **按服务端请求计数。** 列表首次加载、翻页、筛选或重新取数，每次实际执行已声明路由且通过校验的请求各登记一次。Hono 将 `HEAD` 分派给同一 `GET` 路由，通过相同检查后按该路由的动作和目标登记一次。命中前端缓存时没有新的服务端访问。
- **按用途选择路由。** 角色详情包括该角色获授的资源。编辑器随后加载的候选资源树 `/system/resources/options/tree` 走请求日志。用户和角色选项、字典、公告、附件浏览、图标搜索、系统健康等读取也沿用请求日志。[角色编辑器](../../apps/client/src/features/roles/RoleFormDrawer.vue)
- **审计日志的查阅。** 打开操作日志列表或翻页产生零条操作日志。请求单条详情时登记一次，当前查阅者是操作者，被查记录的 ID 是目标。持久化使用数据库 INSERT，不会再触发详情路由。登录行为仍由登录日志记录，表中的“查询登录日志”专指管理人员读取登录历史。

## 路由登记与请求结果

在原路由的认证、适用的权限检查和全部 HTTP 输入校验通过后，由路由中间件调用 `operationLog` 登记。业务 handler 和 service 只处理业务。路由继续使用现有校验器及其 Hono 输入类型，前端继续从 `AppType` 推导请求类型。[登记与收口中间件](../../apps/server/src/middleware/operation-log.ts) · [根应用](../../apps/server/src/app.ts)

| 声明场景 | 中间件输入 |
| --- | --- |
| 集合查询 | 直接声明固定动作，例如 `system:user:list`。 |
| 详情和已有的固定动作 | 声明固定动作与同步目标提取函数。详情取已校验的路径 ID，创建用户取已校验的用户名和昵称。 |
| 动作取决于输入 | 路由提供同步动作选择函数。定时任务启停按已校验的 `enabled` 选择 `ops:scheduled-job:enable` 或 `ops:scheduled-job:disable`，目标取路径中的 `taskKey`。 |

动作与目标在调用下游前确定。提取函数从该路由已校验的输入中逐字段选取目标，登记逻辑补齐操作者、管理员状态、会话及请求上下文快照。密码、配置值和文件内容等业务输入不会随请求对象带入事件。把声明放在路由旁，可以复用已校验输入，也能分别处理共用同一权限码的列表、详情和选项接口。集中维护方法与路径对照表则需要在路由变化时同步两处定义。

| 请求所处阶段 | 操作日志行为 |
| --- | --- |
| 认证、路由权限或输入校验提前返回 | `401`、路由权限 `403`、参数 `400` 等结果进入请求日志，操作事件为零。 |
| 已登记并执行下游 | 根中间件在最终响应形成后生成一个事件。`2xx` 记成功，其他状态记失败。例如合法 ID 对应的用户不存在时，按该 ID 记一次 `404`。目标范围检查产生的 `403` 及未知错误映射的 `500` 同样记失败。耗时从登记到响应形成。 |
| 动作或目标提取抛错、登记无效或重复 | 丢弃本请求的操作事件。提取失败或登记无效记为 `invalid_registration`，重复登记记为 `duplicate_registration`。异常隔离仅包住审计逻辑，下游仍执行一次，业务异常继续交给现有错误处理器。 |

根中间件使用应用级 logger 输出登记故障，以及组装事件或调用接收器时的 `finalization_error`。这些诊断的自定义字段只有 `operationLogErrorKind` 和 `requestId`。排障时可按同一请求 ID 在请求日志中查到 HTTP 方法、路径、客户端 IP 和 IP 来源。[请求上下文](../../apps/server/src/middleware/request-context.ts)

根中间件将事件交给现有运行时，不读取响应正文。读、写和导出事件共享每实例容量为 32 的 FIFO，由单消费者异步写入。查询事件占满队列时，随后到达的写操作事件也会被丢弃。业务响应独立于 INSERT。队列已满、停机或写入失败都可能造成记录缺失，因此“登记一次”描述每个请求的事件数量，查询接口提供最终一致的持久化结果。[操作日志运行时](../../apps/server/src/runtime/operation-log.ts)

## 目标字段、查询与兼容

动作沿用 `模块:目标类型:动作` 的格式，`module` 和 `targetType` 继续由动作码派生。以查询用户列表为例，`targetType` 为 `user`，操作记录能说明谁查询过用户数据。要追溯针对某个用户 ID 的访问，可以按目标查询详情事件。

| 动作 | `targetKey` | `targetLabel` |
| --- | --- | --- |
| 清单中的五个集合动作 | `null` | `null` |
| 清单中的四个详情动作 | 已校验的路径 `id` | `null` |
| 既有写操作与导出 | 原路由提供的目标键或 `null` | 原路由提供的名称或 `null` |

筛选词、页码、查询结果、返回对象的 ID 和联系方式都留在业务请求或响应中。详情记录使用请求时的目标，即使对象不存在也有可追溯的 ID。操作者身份、会话、请求 ID、可信 IP、User-Agent、发生时间、最终状态和耗时沿用现有事件字段。

`targetKey` 和 `targetLabel` 由路由按需提供，均可为空。四个详情路由统一只提供已校验的 ID。数据库通过新的正向迁移替换 `ops_operation_logs_target_check`，保留对非空目标的非空白及最多 512 字符约束。现有服务写入的历史记录都满足新约束，无需回填。[共享契约](../../packages/contracts/src/ops/operation-logs.ts) · [数据库约束](../../apps/server/src/db/schema.ts)

操作日志列表和详情抽屉按表中中文名称展示动作。集合目标沿用现有占位符 `-`。按动作可以查到集合访问，按目标关键词只匹配实际保存的目标键或名称。新旧动作都参与现有模块筛选。[动作标签和目标格式](../../apps/client/src/features/operation-logs/labels.ts) · [查询条件](../../apps/server/src/modules/ops/operation-logs/repository.ts)

项目当前处于开发期，前后端一并升级。开发服务启动时自动对 PGlite 应用迁移，新版查询 API 和前端使用同一份契约读取历史记录和新增记录。已打开的旧页面刷新后即可读取新动作。[开发数据库初始化](../../apps/server/src/db/index.ts)

## 现有路由迁移

将所有业务模块内的 `recordOperation` 调用移到路由声明。系统管理涵盖用户、角色、资源、部门、字典和配置。内容管理涵盖公告、自定义图标集与图标、附件完成上传与删除。运维管理涵盖在线会话撤销和定时任务的计划、启停、执行与取消。

迁移时逐项核对原动作码、目标来源和登记时点，尤其注意以下行为。

- 创建公告可以只用标题作为 `targetLabel`。附件完成上传以 `uploadId` 为目标。自定义图标集导出继续按已校验的 `prefix` 记录 `content:icon-set:export`。共享枚举和客户端标签保留历史动作 `content:icon:rename`，使已有日志仍可解析和筛选。
- 图标批量上传表单中的可选 `metadata` 仍以 JSON 字符串传输。将 handler 中的 JSON 解码、结构校验及条数与文件数的一致性检查移至登记前的表单校验，handler 复用解析结果。无效元数据沿用现有 `400` 响应且产生零条操作日志。登记只取图标集前缀，发生在读取文件内容之前，因此文件读取异常会按最终错误状态记一次失败。若接口正常返回 `2xx`，即使响应中含单文件失败，仍记一次请求级成功。[自定义图标路由](../../apps/server/src/modules/content/icon-sets/custom/routes.ts)

## 验收与验证

| 验收场景 | 预期结果 |
| --- | --- |
| 使用带关键词的请求查询用户列表，再打开其中一个用户的详情 | 接收器先收到 `system:user:list`，目标双空，再收到 `system:user:view`，目标键为用户 ID。事件中没有搜索词或返回的联系方式。 |
| 对已有用户详情发送一次通过认证和权限检查的 `HEAD` 请求 | 返回 `200`，响应正文为空。接收器收到一个 `system:user:view` 事件，目标键为该用户 ID。 |
| 打开角色编辑器，另行浏览权限资源管理页 | 编辑器的角色详情请求产生一个事件，候选资源树产生零个。管理页的完整资源树和资源列表接口各使用 `system:resource:list`。 |
| 查阅操作日志自身 | 翻页或筛选产生零个事件。合法详情请求的 `200` 和缺失记录的 `404` 各产生一个以被查 ID 为目标的事件。无效 ID 的 `400` 和路由权限 `403` 产生零个。 |
| 迁移已有登记，模拟审计故障 | 核对动态启停、仅标题的创建、图标上传校验及导出等代表路由。目标提取抛错时业务只执行一次，登记后的领域错误和未知错误保留原响应。接收器或异步写入失败仍由现有日志管线隔离。 |
| 在带有目标 ID 和客户端 IP 的请求中分别触发登记故障与事件收口故障 | 检查实际输出的诊断日志，除 Pino 的通用字段外，只有对应的 `operationLogErrorKind` 和该请求的 `requestId`。 |
| 校验数据库、响应及展示 | 两个目标字段均为空的操作仍可登记和查询。集合记录与历史写操作可同页返回。列表、详情抽屉和动作筛选能显示新动作，目标关键词仍能查到对应的实体操作。 |

实现阶段复用 contracts、数据库迁移、中间件、代表性路由及客户端现有测试，更新操作日志详情测试中原有的“所有读取均无事件”断言。逐条复核清单的路由登记，检查业务模块中手工登记调用已迁完。最后按仓库约定在沙箱外运行 `pnpm check`，覆盖 Hono 客户端类型推导和浏览器测试。
