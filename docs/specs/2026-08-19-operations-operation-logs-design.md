---
status: approved
date: 2026-08-19
---

# 运维管理操作日志框架设计

## 背景

运维管理的前两个切片已经建立请求上下文、可信客户端 IP、请求关联日志、登录日志和稳定
会话。服务端现在可以在经过认证的请求中取得服务端生成的 request ID、可信 IP 及来源、
已截断的 User-Agent、当前用户和稳定 session ID，但这些信息尚未形成业务操作审计事件。

当前系统管理、内容管理和运维管理包含约三十个后台写操作，并有一项具备独立权限的业务
导出。Pino 请求日志只能说明某个 HTTP 请求的路径、状态和耗时，无法表达“谁对哪个业务
目标执行了什么动作”；数据库中的 `created_at`、`updated_at` 和软删除时间也不能还原
操作者、失败尝试或请求来源。因此不能使用请求日志或实体时间戳替代操作日志。

本设计建立最小、显式、可持久化的业务操作事实，并覆盖当前适用的系统管理、内容管理和
运维管理写操作。它沿用已完成设计中的安全边界，但不修改已经标记为 `completed` 的历史
spec。

## 目标

1. 建立只追加的 `ops_operation_logs`，回答谁、何时、从哪里、对什么目标执行了什么动作，
   以及最终 HTTP 结果是什么。
2. 使用固定、类型化的动作目录，不按 HTTP method 自动推断业务动作。
3. 由每个适用路由在认证、权限和输入校验通过后，取得目标字段所需的已校验值并完成简单
   纯计算，再在任何可能失败的 handler 预处理或 service 调用前显式标记操作。
4. 统一记录成功、领域失败和未知失败，并以最终 HTTP 状态作为请求结果语义。
5. 只保存登记时已经存在的最小目标标识，不保存完整请求、响应、业务对象或成功后快照。
6. 覆盖当前系统管理、内容管理和运维管理中列出的适用写操作及明确的后台业务导出。
7. 提供带权限保护的分页查询、详情 API 和操作日志管理页面。
8. 默认保留操作日志 180 天，并通过独立维护 worker 自动清理。
9. 通过固定容量的进程内 FIFO 和单消费者隔离审计写入延迟与失败，不让业务 response 等待
   审计 INSERT。
10. 用定向测试覆盖框架语义、代表性路由、敏感信息边界、查询页面和清理能力。

## 非目标

本设计不包含：

- 合规级不可抵赖账本、WORM 存储、哈希链、数字签名或数据库管理员防篡改。
- 操作日志与业务写入之间的事务、outbox、外部消息设施、持久化本地队列或零丢失承诺。
- 独立数据库、第二个 PostgreSQL 客户端或审计专用连接池。
- 成功后生成 ID、目标名称、删除前对象、字段 diff 或其他领域结果补充。
- `details`、`summary`、`changes` 或任意 JSON 扩展容器。
- 将所有 POST、PUT、PATCH、DELETE 请求自动持久化或自动判断业务动作。
- 为未来写路由建立静态路由清单、强制 opt-out 机制或固定动作数量测试。
- 认证中间件或路由级 `requireAccess` 拒绝，以及 HTTP schema 校验失败请求的安全事件审计。
- 登录、refresh、logout、个人资料、个人密码和公告已读事件；登录行为继续由登录日志负责。
- 上传会话创建、原始文件字节传输、附件内容 URL 签发或附件读取。
- 后台清理、服务启动、定时维护等非用户触发运行事件。
- 定时任务、任务执行日志和系统健康；它们仍由后续独立切片设计。
- 导出操作日志本身，以及操作日志的手工删除、清空、编辑或独立详情页面。
- IP 归属地、设备指纹、异常行为检测、告警规则、指标系统或外部日志平台。
- 对历史业务操作进行回填或推断。

## 术语与语义

为避免“技术日志”含义过宽，本设计固定使用以下术语：

- **请求日志**：现有 `request started`、`request completed` 和 `request failed` Pino
  事件。
- **Pino 运行日志**：应用或后台 worker 通过 Pino 输出的其他结构化运行事件。
- **操作日志**：本设计新增并持久化到 `ops_operation_logs` 的业务操作审计记录。
- **登录日志**：现有 `ops_login_logs` 中的认证登录历史。
- **操作标记**：路由在校验后、可能失败的 handler 处理前登记的固定 action 和至少一个目标
  字段。
- **审计缓冲**：容量固定的进程内 FIFO，只吸收短时写入波动，不提供可靠消息交付。

操作日志中的“成功/失败”描述最终 HTTP 请求结果，而不是数据库事务证明。`2xx` 表示成功，
其他最终状态表示失败。若业务写入已经提交、随后 response 构造发生未知错误，操作日志仍按
最终 `5xx` 记录。

对于响应中包含逐项结果的批量接口，操作日志仍只描述整个 HTTP 请求。当前图标批量上传即使
`failed` 非空或所有文件都失败，只要接口正常返回 `2xx`，仍表示“批量请求已被正常处理”，
记录为 `success`；逐项成功、跳过和失败只保留在业务响应中，不进入操作日志。

`targetKey` 和 `targetLabel` 都是调用 service 前登记的尝试目标。它们不承诺来自数据库确认，
也不因操作成功而替换。

## 决策摘要

| 主题 | 决策 |
| --- | --- |
| 总体方案 | 全局审计收口中间件 + 路由单次显式标记 |
| 范围 | 当前列出的后台写操作及所有具有明确业务导出语义的后台导出 |
| 标记时点 | 校验并完成目标纯计算后，任何可能失败的 handler 预处理或 service 调用之前 |
| 记录结果 | `2xx` 成功；领域 `4xx` 与未知 `5xx` 失败 |
| 不记录请求 | 标记前的认证/路由权限拒绝、HTTP schema 校验失败和未显式标记请求 |
| 事件数量 | 每个 HTTP 请求最多一条操作日志 |
| 动作标识 | 固定类型化目录，使用冒号分隔的稳定动作码 |
| 操作者 | 用户 ID、用户名、昵称、管理员状态和 session ID 快照 |
| 目标 | action 派生类型；键和显示名称均可单独为空，但每条事件至少提供一个请求时尝试目标 |
| 详情 | 初版不设置 `details` 或成功后补充机制 |
| 持久化 | 固定容量 32、单消费者、无重试的进程内 FIFO |
| 数据库资源 | 复用现有 Drizzle `Db`，每个 app 实例的 writer 同时最多一条 INSERT |
| 查询 | 分页列表 + 单条详情 |
| 页面 | 管理列表 + 行详情抽屉 |
| 权限 | `ops:operation-log:list` |
| 保留期 | 默认 180 天，独立 worker 每 6 小时清理 |

## 架构与组件边界

操作日志拆为四类职责：

1. **共享 API 契约**：放在 `packages/contracts/src/ops/operation-logs.ts`，只定义会跨越
   客户端与服务端的模块、动作、结果、查询和响应 schema。不放审计执行器、目标提取规则、
   中文标签或业务输入类型。
2. **请求内操作标记与收口中间件**：服务端内部负责登记当前请求唯一的最小草稿，并在最终
   response 形成后组装不可变事件；不访问数据库，不使用 `AsyncLocalStorage`。
3. **审计缓冲与 writer**：每个 app 实例拥有一个显式创建的固定容量 FIFO；单消费者调用
   writer 单行插入。writer 不判断业务动作，不承担重试或查询。
4. **操作日志查询模块**：在 `apps/server/src/modules/ops/operation-logs` 下独立维护
   repository、service、mapper、routes 和 cleanup，避免继续扩张现有扁平 ops 文件。

现有登录日志和在线会话 API 保持原结构。本切片只为操作日志新增子目录，不搬迁或重构与
本设计无关的代码。

业务路由只依赖 `markOperationAudit`。根中间件之后使用窄接口接收不可变事件：

```ts
type OperationAuditSink = {
  enqueue(event: OperationAuditEvent): void
}
```

操作审计收口中间件和当前 FIFO 分别注入基础 app logger；不把已绑定 method、path、IP 和
request ID 的 request child logger 传入或保存在 FIFO。审计诊断事件需要关联请求时，从请求
上下文或不可变事件中显式加入 request ID。以后具备独立数据库或消息设施时，可以替换 sink，
而不修改各业务路由的操作标记。

## 操作标记

适用路由在取得已校验输入、完成目标字段所需的同步纯计算后执行一次 marker；marker 之后才
进行文件读取、其他可能失败的异步预处理、领域查询、service 调用或副作用：

```ts
markOperationAudit(c, 'system:user:delete', {
  targetKey: id,
})
```

创建操作可以登记已有的自然业务键和安全名称：

```ts
markOperationAudit(c, 'system:user:create', {
  targetKey: body.username,
  targetLabel: body.nickname,
})
```

action 先由共享 schema 校验，再从第一段派生 module、第二段派生 target type。路由不重复
传入这两个字段。marker 同时捕获操作者快照、当时的 `isAdmin`、session ID、request ID、
可信 IP、User-Agent、墙钟发生时间和单调计时起点。

marker 是服务端内部的 fail-open 边界：

- action、目标形状和请求上下文先规范化并通过 strict schema，成功后才写入 context。
- `targetKey` 和 `targetLabel` 可以单独省略，但规范化后必须至少存在一个；该通用约束不建立
  逐 action 的目标类型映射。
- 操作者用户名、昵称、target key 和 target label 最长 512 字符；超长值在限制内截断并以
  `…` 标识，不拒绝或改变业务调用。
- 用户 ID、session ID 和 request ID 等 UUID 始终完整保留。
- 空白 target 值归一为未提供，不保存空字符串。
- marker 校验或事件草稿构造失败时，将该请求的审计状态设为 `discarded`；根收口中间件使用
  基础 app logger 输出不附带 marker 输入、action 或目标值的
  `operation audit registration discarded` Pino 运行事件，并继续执行业务。
- 每个请求最多允许一次 marker。重复标记不覆盖第一次，而是把该请求的审计状态改为
  `discarded`，使用固定 `auditErrorKind = duplicate_mark` 告警，并继续执行业务。
- 根收口中间件看到 `discarded` 时不向 sink 入队。

这项重复标记保护只检查单个请求 context 槽位，不引入计数器、注册表或全局状态。审计框架
自身的任何程序错误都不得改变业务 response；不安全或含义不确定的审计事件宁可丢弃。

## 请求生命周期

根应用中间件顺序调整为：

```text
请求上下文 -> 请求日志 -> 操作审计收口 -> JSON body limit -> 认证 -> 权限 -> 参数校验 -> 路由
```

操作审计收口中间件采用与现有请求日志相同的外层观察方式：

1. 调用下游。
2. 等待 Hono 子应用和根 error handler 形成最终 response。
3. context 没有有效操作标记时直接返回原 response。
4. 停止计时并组装不可变 `OperationAuditEvent`。
5. 依据最终 HTTP 状态确定 result，并同步尝试向 sink 入队。
6. 立即返回原 response，不等待数据库 INSERT。

审计中间件不读取或克隆 response body，不解析完整 URL，不复制领域错误映射，也不改变
`c.error`。领域错误即使由子应用映射为 `4xx`，仍会在最终 response 形成后记录为失败；未知
错误沿用根 error handler 的 `500`。

`durationMs` 从 marker 成功执行时开始，到最终 response 形成时结束，不包含认证、权限和
HTTP 输入校验时间；包含 marker 后的 handler 预处理、service 调用和 response 构造时间，
不包含排队、数据库插入或客户端接收 response 的网络时间。

因此：

- 认证中间件的 `401`、路由级 `requireAccess` 的 `403` 和 HTTP schema validator 的 `400`
  发生在 marker 前，不产生操作日志。
- service 在 marker 后抛出的领域 `400`、目标范围 `403`、`404`、`409` 等都会记录为失败。
- 文件读取等 marker 后的 handler 预处理失败也会记录；不得把 marker 延迟到这类处理完成后。
- 用户、角色和资源管理的目标范围 `403` 表示已获基本操作权限的用户尝试了不允许的具体
  目标，属于操作日志范围。
- response 构造本身发生错误时，仍依据根 error handler 形成的最终状态记录。
- 最终事件组装或 sink 调用发生审计框架错误时，只通过基础 app logger 输出安全 Pino 运行
  事件并返回原 response。

## 进程内 FIFO 与异步写入

操作日志是运维追溯能力，不是业务事务的一部分。生产入口显式创建一个审计缓冲并注入 app，
测试可以注入受控 sink；不使用模块级单例。

FIFO 固定规则如下：

- 总容量为 32 条，包含正在执行 INSERT 的队首事件。
- `enqueue` 只进行同步、常数时间的入队判断，不等待数据库。
- 单个消费者严格按接受顺序逐条调用 writer，同时最多一条审计 INSERT。
- 每个事件只尝试写入一次；失败后移除队首并继续下一条，不重试、不重新排队。
- 队列已满或缓冲已停止时拒绝新事件，不覆盖已经接受的旧事件，并输出
  `operation audit enqueue failed`，固定原因为 `full` 或 `stopped`。
- 接受入队只表示当前进程暂存了事件，不表示已经持久化。查询 API 因此是最终一致的。
- 多实例部署时每个实例分别维护容量 32 的 FIFO，不保证跨实例顺序。

事件没有 `details`，所有动态字符串均有界，因此队列总内存通过固定条数和固定事件结构约束；
不增加字节级预算、容量环境变量、批量策略、重试退避或死信机制。

缓冲复用现有 Drizzle `Db`，不创建第二个 `postgres.js` 客户端。它保证业务 response 不进入
审计 INSERT 的等待链路，并把审计数据库并发限制为一条查询；它不提供数据库层绝对隔离。
该查询仍可能占用现有客户端池的一个连接，并与后续业务查询竞争同一 PostgreSQL 的 CPU、
磁盘和锁资源。

停机不提供审计专用排空保证：

- HTTP server 停止接收并等待在途请求结束后，缓冲停止接受新事件。
- 尚未开始写入的队列项被丢弃，只记录有界 `droppedCount`，不输出事件内容。
- 已经执行的单条 INSERT 不主动取消，也不由缓冲等待；它只遵循现有数据库关闭语义。
- 生产 `client.end({ timeout: 5 })` 仍按现有配置最多等待，PGlite 仍沿用现有 close 行为。
- 进程崩溃、强制终止和部署停机都可能丢失尚未持久化的事件。

writer 插入失败时通过 FIFO 注入的基础 app logger 输出
`operation audit persistence failed`，并遵循以下安全边界：

- 捕获范围只包围 `ops_operation_logs` 的单次异步 INSERT。
- `err` 使用新建的通用 Error，不把原始数据库错误对象、message、stack 或 cause 传给 Pino。
- 额外字段只允许固定 action、最终 status、归一化 `auditErrorKind`，以及通过严格格式和长度
  校验后可选的 PostgreSQL error code 与 constraint name。
- 不输出完整事件、操作者、目标值、输入、response、SQL、参数、数据库 detail/hint、连接
  地址或端口。无法安全分类时只使用 `unknown`，不以原始值作为 fallback。
- 入队拒绝、登记失败和停机丢弃遵守同一白名单原则。
- 审计诊断事件不继承 request child logger 的 method、path、IP、IP 来源或 User-Agent；现有
  普通请求日志仍沿用原绑定，不由本设计修改。

业务 service、查询 API、cleanup 和其他未知异常不使用这项 fail-open 规则，仍按项目现有
错误传播约定处理。若业务数据库故障同时导致 service 和审计 INSERT 失败，客户端获得原业务
`5xx`，Pino 只留下脱敏运行事件；本设计不承诺此时仍有数据库操作日志。

## 数据模型

### `ops_operation_logs`

新增只追加表：

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | uuid | 主键，默认 `uuidv7()` |
| `actor_user_id` | uuid | 必填操作者 ID 快照，不建立外键 |
| `actor_username` | text | 必填用户名快照，最长 512 字符 |
| `actor_nickname` | text | 必填昵称快照，最长 512 字符 |
| `actor_is_admin` | boolean | 必填；认证中间件在该请求解析出的管理员状态快照 |
| `actor_session_id` | uuid | 必填稳定 session ID 快照，不建立外键 |
| `module` | text | `system`、`content` 或 `ops` |
| `action` | text | 固定动作目录中的稳定代码 |
| `target_type` | text | action 第二段派生的业务目标类型，最长 512 字符 |
| `target_key` | text | 可空；请求时实体 ID、业务编码、前缀或其他安全键，最长 512 字符 |
| `target_label` | text | 可空；请求时可读目标名称，最长 512 字符 |
| `result` | text | `success` 或 `failure` |
| `http_status` | smallint | 最终 HTTP 状态，范围 100–599 |
| `duration_ms` | integer | 从 marker 到最终 response 形成的非负整数毫秒 |
| `request_id` | uuid | 服务端生成的 request ID，必填且唯一 |
| `client_ip` | text | 可空可信客户端 IP |
| `client_ip_source` | text | `socket`、`x-forwarded-for` 或 `unavailable` |
| `user_agent` | text | 可空；复用请求上下文中最长 512 字符的原始值 |
| `created_at` | timestamptz | marker 时间；writer 显式写入，默认值仍为 `now()` |

操作者和 session 字段故意不建立生命周期外键。用户采用软删除，会话也会按保留策略清理；
操作日志必须在这些记录消失后仍能独立读取。目标键同样不建立领域外键，允许被删除实体、
配置键、图标前缀和未来模块使用统一结构。

`actor_is_admin` 只说明该请求通过认证时是否具有活动的 `admin` 角色，用于在角色以后变化后
还原管理员绕过精确资源码的授权背景。操作日志不保存完整角色、`accessCodes`、菜单或权限
对象。

数据库约束至少保证：

- `module` 只接受三个固定值。
- `client_ip_source` 只接受请求上下文已有的三个值。
- action 前缀与 module、target type 一致。
- `http_status` 在 100–599 范围内，`duration_ms >= 0`。
- `result = 'success'` 时 `http_status` 必须为 200–299；其他状态必须使用
  `result = 'failure'`。
- 操作者名称、action 和 target type 去除空白后不能为空。
- 操作者用户名与昵称、target type 以及非空 target key、target label 均不超过 512 字符。
- 可空 target 字段为 `null` 或非空字符串，不保存空白字符串。
- `target_key` 和 `target_label` 至少一个非空。

数据库不重复枚举当前固定动作。完整 action 目录由应用共享 schema 和类型约束维护；数据库
只检查结构与 module/target type 前缀一致，避免新增动作时仅为扩充应用目录而替换 check。

索引包括：

- `created_at, id`，支持稳定倒序分页。
- `actor_user_id`。
- `actor_session_id`。
- `module, action`。
- `result`。
- `http_status`。
- `target_type, target_key`。
- `client_ip`。
- `request_id` 唯一索引。

应用 repository 不提供 update 或普通 delete 方法。唯一删除入口是保留期 cleanup；该限制不
声称能阻止数据库管理员直接修改数据。

## 动作目录与目标规则

动作码是审计标识，不是权限判断输入。部分 CRUD 动作恰好与权限码相同，公告发布、归档等
动作则使用比现有 `update` 权限更精细的审计代码。授权仍由原有 `requireAccess` 完成。

### 当前固定动作

| 模块 | 领域 | 动作码 |
| --- | --- | --- |
| system | 系统配置 | `system:config:update` |
| system | 数据字典 | `system:dictionary:create` |
| system | 数据字典 | `system:dictionary:update` |
| system | 数据字典 | `system:dictionary:delete` |
| system | 部门管理 | `system:department:create` |
| system | 部门管理 | `system:department:update` |
| system | 部门管理 | `system:department:delete` |
| system | 角色管理 | `system:role:create` |
| system | 角色管理 | `system:role:update` |
| system | 角色管理 | `system:role:delete` |
| system | 资源管理 | `system:resource:create` |
| system | 资源管理 | `system:resource:update` |
| system | 资源管理 | `system:resource:delete` |
| system | 用户管理 | `system:user:create` |
| system | 用户管理 | `system:user:update` |
| system | 用户管理 | `system:user:reset-password` |
| system | 用户管理 | `system:user:delete` |
| content | 通知公告 | `content:announcement:create` |
| content | 通知公告 | `content:announcement:update` |
| content | 通知公告 | `content:announcement:publish` |
| content | 通知公告 | `content:announcement:archive` |
| content | 通知公告 | `content:announcement:delete` |
| content | 自定义图标集 | `content:icon-set:create` |
| content | 自定义图标集 | `content:icon-set:update` |
| content | 自定义图标集 | `content:icon-set:delete` |
| content | 自定义图标集 | `content:icon-set:export` |
| content | 自定义图标 | `content:icon:upload` |
| content | 自定义图标 | `content:icon:rename` |
| content | 自定义图标 | `content:icon:delete` |
| content | 附件管理 | `content:attachment:upload` |
| content | 附件管理 | `content:attachment:delete` |
| ops | 在线会话 | `ops:online-session:revoke` |

当前清单共 32 个动作；该数字只是本设计时的仓库范围快照，不是长期业务不变量，也不写成
固定数量测试。新增需审计的后台写操作时扩充 action schema、路由 marker、前端标签和相关
测试，不通过复用宽泛 `update` 动作隐藏独立状态转换。所有具有明确业务导出语义的后台导出
同样属于操作日志范围；当前只有自定义图标集导出。

### 目标标记

目标字段统一表示 marker 执行时的尝试目标，不因成功而补充：

| 动作类别 | `targetKey` | 可选 `targetLabel` |
| --- | --- | --- |
| 配置更新 | config key | 不记录配置值 |
| 字典、部门、角色、资源创建 | code | 请求中的 name |
| 字典、部门、角色、资源更新 | 路径 ID | 本次请求包含的 name |
| 字典、部门、角色、资源删除 | 路径 ID | 无 |
| 用户创建 | username | nickname |
| 用户更新 | 路径 ID | 本次请求包含的 nickname |
| 用户重置密码、删除 | 路径 ID | 无 |
| 公告创建 | 无 | title |
| 公告更新 | 路径 ID | 本次请求包含的 title |
| 公告发布、归档、删除 | 路径 ID | 无 |
| 图标集创建 | prefix | name |
| 图标集更新、删除 | prefix | 更新请求中的 name；删除时为空 |
| 图标集导出 | prefix | 无 |
| 图标批量上传 | icon-set prefix | 无 |
| 图标重命名 | `prefix:oldName` | new name |
| 图标删除 | `prefix:name` | 无 |
| 附件上传完成 | upload session ID | 无 |
| 附件删除 | attachment ID | 无 |
| 在线会话撤销 | session ID | 无 |

不得为了补齐目标增加查询或改变 service 返回值。创建动作没有稳定 key 时允许只保存 label；
删除和状态动作不知道名称时允许只保存路径 ID。当前动作没有无目标事件；未来若确需增加，
必须显式调整 marker 和数据库约束，而不是在路由中静默省略目标。

### 明确排除

以下当前写请求不标记操作日志：

- `POST /api/auth/login`、refresh、logout。
- 当前用户资料和密码修改。
- 公告已读状态。
- 附件上传会话创建。
- `PUT /api/attachments/uploads/:uploadId/content` 原始字节传输。
- 附件内容 URL 签发。
- 普通 GET、附件读取和下载；具有明确业务导出语义的后台导出除外。
- 维护 worker、cleanup 和数据库 bootstrap。
- demo 路由。

未来定时任务启停、修改和手动执行可以使用同一框架增加新动作，但不在本 spec 中预留尚未
设计的动作码。任务自身的每次运行结果仍进入后续任务日志，而不是操作日志。

## 共享 API 契约

`packages/contracts/src/ops/operation-logs.ts` 定义并从 ops 与公共入口导出：

- `operationLogModuleSchema`：`system | content | ops`。
- `operationLogActionSchema`：当前动作目录。
- `operationLogResultSchema`：`success | failure`。
- 列表查询、列表项、详情和详情路径 schema。

contracts 不包含 marker、FIFO、writer、目标提取规则、动作中文标签或业务输入类型。服务端
内部可以复用 action 类型和 schema，但审计执行逻辑不进入 contracts。前端在自身模块使用
`Record<OperationLogAction, string>` 等穷尽映射维护中文标签。

所有查询条件按交集筛选；module/action 不匹配或 result/HTTP status 不一致的组合返回空
列表，不作为无效请求。前端会在 module 变化时清除不属于该 module 的 action。

## 查询 API

### 操作日志列表

```text
GET /api/ops/operation-logs
```

查询参数：

```ts
type OperationLogListQuery = {
  page: number // default 1
  pageSize: number // default 20, max 100
  actorKeyword?: string
  actorSessionId?: string // UUID
  module?: 'system' | 'content' | 'ops'
  action?: OperationLogAction
  result?: 'success' | 'failure'
  httpStatus?: number // integer, 100–599
  targetKeyword?: string
  clientIp?: string
  requestId?: string // UUID
  occurredFrom?: string // ISO datetime with offset, inclusive
  occurredTo?: string // ISO datetime with offset, inclusive
}
```

字符串筛选去除首尾空白，空值归一为未提供。`actorKeyword` 为合法 UUID 时精确匹配
`actor_user_id`，否则对用户名和昵称执行大小写不敏感包含匹配；`targetKeyword` 对 target
key 和 label 执行大小写不敏感包含匹配；`actorSessionId`、`httpStatus`、`clientIp` 和
`requestId` 精确匹配。时间范围两端包含，并要求 `occurredFrom <= occurredTo`。

默认排序为 `created_at DESC, id DESC`。列表项包含：

- 日志 ID。
- 操作者 ID、用户名和昵称。
- module、action。
- target type、key 和 label。
- result、HTTP status 和 duration。
- client IP。
- 发生时间。

列表不返回 session ID、request ID、IP 来源或原始 User-Agent。

### 操作日志详情

```text
GET /api/ops/operation-logs/:id
```

路径 ID 必须是 UUID。详情响应包含完整列表字段，并增加：

- 操作者当时的管理员状态。
- 操作者 session ID。
- request ID。
- client IP 来源。
- 复用现有 `toOpsUserAgent` 映射的 User-Agent 结构。

数据库只保存原始 User-Agent；浏览器、操作系统和设备类型在响应映射时解析。详情接口不返回
数据库内部字段、Pino 内容或任何原始请求/响应。

### 错误映射

| 场景 | HTTP | 响应 |
| --- | --- | --- |
| 查询参数无效 | `400` | `请求参数无效` |
| 日志 ID 无效 | `400` | `操作日志 ID 无效` |
| 未认证或会话失效 | `401` | 沿用 `未授权` |
| 缺少精确资源权限 | `403` | 沿用 `无权访问` |
| 详情不存在 | `404` | `操作日志不存在` |

未知错误继续抛给根 error handler，不增加空数据 fallback。操作日志 GET 请求不标记新的操作
日志。

## 权限资源

在现有启用的 `ops` 根资源下新增：

| ID | 父级 | 类型 | 名称 | 编码 | 路径 | 图标 | 排序 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `10000000-0000-4000-8000-000000000320` | `ops` | menu | 操作日志 | `ops:operation-log` | `/ops/operation-logs` | `lucide:scroll-text` | 30 |
| `10000000-0000-4000-8000-000000000321` | 操作日志 | action | 查看操作日志 | `ops:operation-log:list` | `null` | `null` | 10 |

两个资源均启用，不写入 `system_role_resources`。管理员因现有运行时管理员语义获得全部启用
资源；普通角色必须在资源管理中显式授权。列表和详情共用 `ops:operation-log:list`，首版不
拆出没有独立安全意义的“查看详情”权限。

## 前端页面

新增 `/ops/operation-logs`，沿用现有运维列表的查询表单、错误提示、数据表格和分页结构。
异步 INSERT 带来的短暂最终一致性属于正常行为；页面不增加专用提示、刷新按钮或自动轮询，
新记录在后续正常查询或页面重载时出现。

### 筛选

- 操作者；同一输入框支持用户名、昵称或用户 ID。
- 会话 ID。
- module。
- action；选择 module 后只显示该 module 的 action，module 变化时清除不兼容 action。
- result。
- HTTP status；使用限制为 100–599 整数的数字输入。
- 目标关键词。
- client IP。
- request ID。
- 发生时间范围；本地选择后转为 UTC ISO 字符串。

查询和重置都将页码恢复为 1。module、action 和 result 标签使用穷尽映射，新增动作时
TypeScript 要求同步补充标签。

### 表格

列包括：

- 发生时间。
- 操作者，显示昵称和用户名。
- module 与 action。
- 尝试目标，优先显示 target label 并辅助展示 target key。
- result tag。
- HTTP status。
- client IP。
- duration。
- 查看详情操作。

页面标题下显示总数。列表不展示 session ID、request ID 或原始 User-Agent。

### 详情抽屉

点击“查看详情”后按日志 ID 请求详情。抽屉展示：

- 发生时间、操作者和 result；操作者 ID 提供复制操作。
- 操作者当时是否为管理员。
- module、action 和尝试目标。
- HTTP status 与 duration。
- request ID，并提供复制操作。
- session ID，并提供复制操作。
- client IP 及来源。
- 复用现有 `UserAgentSummary` 的设备摘要和原始 User-Agent tooltip。

详情以结构化列表展示，不使用 JSON viewer。首版不提供导出、编辑、删除、清空、批量操作或
单独详情路由。

## 清理与配置

新增环境变量：

```text
OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS=21600000
OPS_OPERATION_LOG_RETENTION_MS=15552000000
```

规则与现有登录日志 worker 保持一致：

- cleanup interval 默认 6 小时，必须是 0 到 Node timer 最大延迟之间的安全整数。
- interval 为 0 时不启动对应计时。
- retention 默认 180 天，必须是非负安全整数。
- retention 为 0 时，下一次 cleanup 删除 `created_at <= now` 的既有操作日志。
- worker 启动后立即安排首轮执行，再按 interval 调度。
- 删除条件是 `created_at <= now - retention`。
- 删除操作幂等；多实例可能同时运行，但本切片不引入租约调度。

新增独立 `ops-operation-log-cleanup` maintenance worker，不合并或重命名现有登录日志 worker。
成功删除至少一行时输出 `ops operation log cleanup completed` Pino 运行事件和
`deletedCount`；失败时输出 `ops operation log cleanup failed` 与 `err`，等待下一周期。
启动配置非法时继续使维护任务启动失败，不静默使用默认值。

后续“定时任务与任务日志”切片迁移现有 maintenance worker 时，可以把该 cleanup 处理器一并
迁移；本设计不提前引入调度抽象。

## 安全与隐私边界

- 密码、临时密码、password hash、Token、refresh hash、Cookie、secret、配置值和数据库
  连接信息不得进入操作日志。
- 不保存完整请求、响应、headers、query string、body、业务对象或 Error。
- 公告正文、HTML、Tiptap JSON、SVG、文件内容、storage key、checksum、上传文件名和单文件
  错误消息不得进入操作日志。
- 邮箱、手机号和头像值不保存；操作者用户名、昵称以及明确允许的目标名称按 180 天策略保留。
- 操作者只额外保存当时的管理员布尔状态，不保存完整角色、权限码或菜单快照。
- target label、原始 User-Agent 和 IP 只用于追溯与排障，不参与授权、身份认证或行为判断。
- 来自业务数据的字符串快照最长 512 字符；超长值截断而不阻断业务操作。
- 失败操作不保存 response message、领域异常类型或数据库错误。
- request ID 用于关联请求日志和 Pino 运行日志。
- marker、缓冲和 writer 的失败事件遵循严格白名单，不透传原始 PostgreSQL 错误。
- 列表和详情都要求精确动作权限；仅拥有菜单资源不能读取数据。
- 操作日志 API、writer INSERT 和 cleanup 不递归生成操作日志。
- Pino redaction 继续作为结构化运行日志的泄漏防线，但不替代 marker 的最小字段规则。

## 数据迁移与兼容性

新增 `20260819000100_operation_logs` migration：

1. 创建 `ops_operation_logs`、check 和索引。
2. 插入操作日志 menu 和 list action 两条固定资源。

迁移不回填历史记录，不修改 `ops_login_logs`、`auth_sessions` 或既有资源。部署后只有新发生且
显式标记的业务请求会生成操作日志。

同步更新：

- `apps/server/src/db/schema.ts`。
- `apps/server/.env.example`。
- README 的运维能力、权限和保留策略说明。
- client 文件路由生成类型。

不新增第三方运行时依赖。现有 HTTP 请求体、成功 response、领域错误 response 和 service
返回类型保持兼容；本设计不为了操作日志增加查询或改变业务 service 返回值。

## 测试策略

测试只覆盖用户可见语义、核心框架边界和高风险数据，不把当前动作数量固化为测试不变量。

### Contracts

- module、action 和 result 的合法/非法边界。
- 分页、操作者、session ID、module、action、result、HTTP status、目标、IP、request ID 和
  ISO 时间筛选。
- `occurredFrom > occurredTo` 被拒绝。
- 列表与详情响应字段及 User-Agent 结构。
- 前端 action 标签映射由 TypeScript 穷尽性保证，不另写重复枚举测试。

### 数据库迁移

- 表、默认 UUID、字段、check 和索引存在。
- 重复 request ID 被拒绝。
- result/status 不一致、非法 module、IP 来源和负 duration 被拒绝。
- target key 和 label 同时为空被拒绝。
- 两条固定资源存在、启用且没有普通角色绑定。

### 审计框架

- 未标记和 `discarded` 请求不向 sink 入队。
- 合法 marker 捕获最小字段，超长动态字符串被截断且不改变业务 response。
- marker 的两个目标都缺失或规范化为空时丢弃审计事件并告警，业务 response 不变。
- 非法 marker 和重复 marker 只产生安全 Pino 运行事件并继续业务。
- 标记后最终 `2xx` 形成成功事件；领域 `4xx` 和未知 `500` 形成失败事件。
- marker 后、service 前的 handler 预处理失败形成失败事件，duration 包含这段处理时间。
- 图标批量上传在部分或全部单文件失败但最终返回 `2xx` 时仍形成请求级成功事件，不保存逐项
  结果。
- auth `401`、`requireAccess` `403` 和 route validator `400` 不写操作日志。
- 中间件不读取 response body，duration 不包含排队与 INSERT。
- FIFO 总容量 32，包含队首在途事件；严格单消费者和 FIFO 顺序。
- `enqueue` 不等待数据库；队列满时不调用 writer、不覆盖旧事件，并产生安全告警。
- FIFO 只保留不可变审计事件，不保留 request child logger；审计诊断日志不继承 path、IP 或
  User-Agent。
- 单条 INSERT 失败不重试，随后继续消费下一条。
- 停止接收时不等待排空，报告并丢弃尚未开始的队列项。
- writer 未完成时业务 response 已可返回，插入失败不改变 response。
- 失败 Pino 事件不包含原始 error message、stack、cause、数据库 detail/hint、SQL、参数、连接
  地址、完整事件、目标值、请求体或敏感值。

### 代表性路由与安全边界

选择不同接入形态做少量集成测试，包括 JSON 创建、局部更新、`204` 删除、状态动作、业务
导出、附件上传完成和在线会话撤销。代表性失败覆盖标记后的目标范围 `403`、其他领域错误和
未知 `500`。

高风险数据定向覆盖：

- 配置更新不保存 custom/default/effective value。
- 用户创建、更新和重置密码不保存密码、hash、邮箱、手机号或头像值。
- 公告操作不保存正文、HTML、Tiptap JSON 或目标列表。
- 图标操作和导出不保存 SVG、上传文件名或单文件错误消息。
- 附件操作不保存文件内容、storage key 或 checksum。
- 在线会话撤销不保存 token、refresh hash 或权限快照。

实现和 review 阶段按本 spec 的当前动作清单核对 marker 范围一次；不为每个动作新增一套重复
集成测试，也不断言固定数量。未来新路由的标记由开发约定、代码审阅和相关业务测试负责。

### 查询 API

- 权限允许与拒绝。
- 所有筛选、交集、稳定排序和分页。
- result 与 HTTP status 不一致的筛选组合返回空列表，不作为无效请求。
- 操作者同时匹配用户名和昵称，目标同时匹配 key 和 label。
- 操作者输入为合法 UUID 时精确匹配 actor user ID，不再按用户名或昵称模糊匹配。
- session ID 精确匹配同一认证会话的操作。
- 详情映射 User-Agent。
- 无效 query、无效 ID、详情不存在和未知数据库错误的响应语义。
- 操作日志 GET 本身不产生新的操作日志。

### 清理

- 180 天截止点两端语义。
- interval 为 0 不调度，retention 为 0 清理全部既有记录。
- 非法配置启动失败。
- 删除成功与失败的 Pino 运行事件。
- worker stop 等待当前执行并取消后续调度。

### 前端

- 筛选序列化、分页和重置行为。
- session ID 筛选序列化。
- HTTP status 的输入边界和筛选序列化。
- module 变化清除不兼容 action。
- 表格标签、尝试目标、result、status 和 duration 展示。
- 详情抽屉按需加载并展示管理员、session、request、IP 来源和设备信息。
- 详情抽屉展示并可复制操作者 ID。
- session ID 复制。
- request ID 复制。
- 页面不提供原始 JSON、导出、删除或清空入口。
- API 返回不符合共享 schema 时拒绝渲染。

实现阶段先运行 contracts、服务端和客户端定向测试及 typecheck，最终按仓库约定在沙箱外运行
完整 `pnpm check`。

## 验收标准

1. 数据库迁移后存在空的 `ops_operation_logs` 和两条未自动授权普通角色的操作日志资源。
2. 当前动作目录列出的适用写操作和业务导出均在可能失败的 handler 预处理和 service 前显式
   标记；不通过固定数量测试把该清单冻结为长期不变量。
3. 标记前的认证、路由权限和 HTTP schema 校验失败不写；标记后的目标范围 `403`、其他领域
   错误和未知错误写失败记录。
4. 每条日志都能关联操作者及其当时的管理员状态、session、request、可信 IP、action、请求时
   尝试目标和最终状态。
5. 数据库没有 `details`；敏感与大体积字段在数据库、内存 FIFO 和 Pino 输出中均不可见。
6. 业务 response 不等待审计 INSERT；队列拒绝、异步写入失败、审计框架错误和停机丢弃都不
   改变业务结果，并输出仅含白名单诊断字段、不含操作者、目标或请求/响应内容的明确 Pino
   运行事件。
7. FIFO 容量固定为 32，每个 app 实例的 writer INSERT 并发为一条；单条失败不重试并继续
   后续事件。
8. 有权限用户可以筛选列表、按 session ID 追踪同一会话、打开详情并复制操作者、session 和
   request ID；无权限用户不能读取列表或详情。
9. 页面没有导出、编辑、删除、清空、原始 JSON 或 `details` 扩展区域。
10. 默认 180 天清理生效，现有 API 与前两项运维能力保持兼容，完整 `pnpm check` 通过。

## 实施顺序

后续 `implement` 阶段按以下顺序执行：

1. 新增共享 action、查询和响应契约，不增加 `details` 扩展容器。
2. 新增数据库 schema、migration、约束、索引和权限资源。
3. 实现请求内 marker、全局收口中间件、容量 32 的 FIFO、writer 和无等待 stop。
4. 按系统管理、内容管理、运维管理顺序标记当前动作目录中的适用写路由和业务导出。
5. 实现操作日志列表和详情 repository、service、mapper 与 routes。
6. 实现前端列表和详情抽屉。
7. 实现 180 天 cleanup、环境变量和维护任务接入。
8. 更新 README、`.env.example` 和必要测试。
9. 运行定向验证和完整 `pnpm check`。

本 spec 在 `draft` 阶段只记录设计，不开始上述实现，不创建提交。
