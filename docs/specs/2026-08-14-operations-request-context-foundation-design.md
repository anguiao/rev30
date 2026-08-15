---
status: implemented
date: 2026-08-14
---

# 运维管理请求上下文基础设计

## 背景

运维管理相关能力需要稳定、可信且可复用的请求元数据。当前服务端没有统一的请求上下文：
请求日志只记录方法、路径、状态码和耗时，无法关联同一次请求中的其他技术日志，也没有
可信代理策略来判断转发头中的客户端 IP 是否可用。

当前 Pino 已配置少量 `redact` 路径，但只覆盖 Authorization、Cookie 等固定 header
位置；项目也还没有统一约束哪些请求字段允许进入日志。权限侧已有数据库驱动的
`system_resources` 和精确资源码授权，但尚未建立运维管理的根资源。

本设计只建立 HTTP 请求元数据、安全日志边界和权限命名根，不实现审计事件或运维页面。

## 目标

1. 为每个进入 Hono 应用的请求创建类型化请求上下文。
2. 始终由服务端生成 `requestId`，并通过 `X-Request-Id` 响应 header 返回。
3. 以“默认不信任任何代理”为基线，提供可配置、可验证的可信代理 CIDR 策略。
4. 统一解析和标记客户端 IP 来源，供后续登录日志和操作日志复用。
5. 为每个请求提供绑定公共字段的 Pino child logger。
6. 扩充结构化日志脱敏策略，并禁止记录完整请求、响应、headers 和 body。
7. 新增默认禁用的 `ops` 根资源，为后续运维模块提供稳定权限命名空间。
8. 用定向测试覆盖请求标识、代理边界、最终日志输出和权限种子行为。

## 非目标

本设计不包含：

- 登录日志表、登录事件写入或日志查询页面。
- 稳定会话、强制下线或认证 token 改造。
- 操作日志表、审计中间件或业务动作标注。
- 定时任务、任务执行记录或系统健康诊断。
- 将每个 HTTP 请求持久化到数据库。
- `AsyncLocalStorage`、分布式 tracing、W3C `traceparent` 或上游 trace ID 透传。
- 动态修改可信代理策略；该策略不进入系统配置数据库。
- `Forwarded`、`X-Real-IP`、`CF-Connecting-IP` 等其他客户端 IP header。
- 日志采集平台、外部日志存储、查询、轮转或保留期限。
- Node 响应 `finish`/`close` 生命周期、流式响应传输耗时、客户端中途取消或响应流后续
  读取错误。
- 前端页面或 `packages/contracts` 共享契约变更。
- 提前定义后续运维子模块的菜单、动作资源或数据库结构。
- 为种子资源增加 `builtIn` 标记、保留资源身份保护或运行时自动修复。

## 决策摘要

| 主题 | 决策 |
| --- | --- |
| 请求上下文 | Hono 类型化 context variable，不使用 `AsyncLocalStorage` |
| `requestId` | 每次请求使用 `crypto.randomUUID()` 生成，不接受调用方提供的值 |
| 响应关联 | 所有响应返回 `X-Request-Id` |
| 代理默认值 | `TRUSTED_PROXY_CIDRS` 默认为空，转发头默认不可信 |
| 代理配置来源 | 服务端启动环境变量，入口最先解析并编译，运行期间只读 |
| 客户端 IP | 从 socket 和可信 `X-Forwarded-For` 链解析，并记录来源 |
| User-Agent | 只读取单个 header，去空白，空值归一为 `null`，最长保留 512 个字符 |
| 请求 logger | Pino child logger，绑定请求公共字段，不建立隐式全局上下文 |
| 日志脱敏 | 使用 Pino 成熟的 `redact`，配合调用侧安全字段白名单 |
| 运维权限 | 只新增禁用的 `ops` 根目录，不预置子模块资源 |

## 请求上下文模型

服务端新增请求上下文类型，语义如下：

```ts
type ClientIpSource = 'socket' | 'x-forwarded-for' | 'unavailable'

type RequestContext = {
  requestId: string
  clientIp: string | null
  clientIpSource: ClientIpSource
  userAgent: string | null
  logger: Logger
}

type RequestContextVariables = {
  requestContext: RequestContext
}
```

`RequestContext` 是服务端内部类型，不进入共享 contracts。需要同时访问认证变量和请求
上下文的 Hono 路由，通过变量类型交集合并两者；请求上下文不持有当前用户、访问码或
其他认证状态。

`clientIpSource` 只表达 `clientIp` 的可信来源：

- `socket`：使用 TCP 直连对端地址，包括未配置可信代理、直连对端不可信、可信转发链
  缺失或无效时的情况。
- `x-forwarded-for`：直连对端可信，且最终地址从有效的 `X-Forwarded-For` 链中选出。
- `unavailable`：运行环境没有提供有效 socket 地址，此时 `clientIp` 必须为 `null`。

该来源字段进入请求上下文和技术日志。后续审计表是否持久化它，由对应子模块 spec 决定。

## 组件与执行顺序

职责拆分为三个独立单元：

1. 客户端 IP 策略单元：读取并验证可信代理配置、规范化 IP、判断可信网段、解析转发链。
   核心解析保持为纯函数，以便不启动 HTTP server 即可覆盖安全边界。
2. 请求上下文中间件：生成 `requestId`，从 Node adapter connection bindings 读取连接
   信息和 User-Agent，创建 child logger，写入 Hono context，并设置响应 header。连接
   bindings 缺失时显式返回无 socket 地址，不通过捕获任意异常判断运行环境。
3. 请求日志中间件：只消费已有请求上下文，记录请求开始，并在下游完成后依据 Hono 的
   `c.error` 与最终响应状态记录完成或失败，不重复解析 header，也不二次执行错误映射。

应用级中间件顺序固定为：

```text
request context -> request logger -> JSON body limit -> auth -> access -> route
```

请求上下文和请求日志覆盖整个 Hono app，而不只覆盖 `/api` 中已注册的成功路由，因此
未匹配路由、认证失败、body limit 拒绝和未知异常也必须带有同一请求的 `X-Request-Id`。

根 app 显式注册 error handler：带有 Hono `getResponse()` 语义的异常继续返回其原始
response，其他未知异常保持 Hono 默认的 `500 Internal Server Error` 状态、响应体和
content type，但不执行默认的 `console.error`。对应原始异常仍保留在 `c.error`，由外层
请求日志中间件使用 request child logger 记录一次。各子应用已有的领域错误映射保持
不变；未知异常继续向根 handler 传播。

child logger 绑定以下稳定公共字段：

- `requestId`
- `clientIp`
- `clientIpSource`
- `method`
- `path`

`path` 只取 URL pathname，不含查询串。User-Agent 只在 `request started` 事件中记录一次，
不绑定到 child logger，避免每条下游技术日志重复携带长字符串。

本设计只让中间件和路由显式取得请求 logger。业务 service 若需要请求关联日志，由调用方
显式传入 logger 或必要元数据；不通过隐式全局状态自动传播。

现有请求路径中，附件删除在数据库软删除成功但存储文件删除失败时会由 service 写技术
错误日志。该操作调整为由路由把当前请求 child logger 显式传给附件 service 的删除方法，
使这条日志携带同一 `requestId` 和请求公共字段。定时清理、服务器关机等没有 HTTP 请求
来源的任务继续使用进程级 logger；本设计不为它们制造伪请求上下文。

## `requestId` 策略

每个请求无条件使用 `crypto.randomUUID()` 生成新的 UUID。请求中已有的
`X-Request-Id` 无论来自普通客户端还是可信代理都不参与生成，避免调用方伪造、复用或
污染内部日志关联键。

`X-Request-Id` 是根 app 的保留响应 header，下游路由和中间件不得自行设置。请求上下文
中间件在调用下游前写入该 header，并在下游完成后以同一个服务端生成值重新确认最终
响应 header，避免下游响应意外覆盖。成功响应、预期 `4xx`、未匹配路由和框架生成的
`5xx` 都必须返回该 header。首版不把 `requestId` 加入 JSON 错误体，也不建立上游 trace
ID 的第二字段；需要跨服务 tracing 时另行设计。

## 可信代理配置

新增服务端环境变量：

```text
TRUSTED_PROXY_CIDRS=
```

配置规则：

- 空字符串表示不信任任何代理，是开发环境和未配置生产环境的默认值。
- 非空值使用逗号分隔，每项允许单个 IPv4/IPv6 地址或 CIDR。
- 单个地址按精确主机匹配处理，相当于 IPv4 `/32` 或 IPv6 `/128`。
- 每项去除首尾空白；非空配置中的空项、hostname、端口、非法 IP、非法网络前缀或
  非法 CIDR 都使应用启动失败。
- 启动错误指出环境变量名称和无效项位置，但不回显整段配置值。
- 生产入口在连接或迁移数据库、启动维护任务和监听端口之前读取并编译配置；非法配置在
  这些启动副作用之前失败。编译后的只读匹配策略显式注入 app，请求期间不再读取
  `process.env`，也不查询数据库或自动刷新。

`apps/server/.env.example` 增加空配置和注释，README 的部署说明解释该变量只应填写实际
受控反向代理或负载均衡器的出口地址，而且这些代理必须覆盖或按规范追加
`X-Forwarded-For`，不能原样信任客户端传入的整条链。正式值由部署系统注入，不写死在
代码或 migration 中。

## 客户端 IP 解析

### 地址规范化

- socket 地址和转发链地址都必须是 IP literal，不接受 hostname 或带端口地址。
- IPv4-mapped IPv6 地址规范化为普通 IPv4，例如 `::ffff:127.0.0.1` 归一为
  `127.0.0.1`。
- 有效 IPv4 和 IPv6 保持字符串形式用于匹配和后续记录。
- socket 没有地址或地址无效时，不能建立代理信任，忽略全部转发头并返回
  `{ clientIp: null, clientIpSource: 'unavailable' }`。

### 解析算法

1. 读取并规范化 socket 直连地址。
2. 如果没有配置可信代理，或直连地址不在可信范围，忽略 `X-Forwarded-For`，使用
   socket 地址和 `socket` 来源。
3. 只有直连地址可信时才读取 `X-Forwarded-For`。header 缺失时直接使用 socket 地址且
   不记录警告；header 存在时按逗号拆分并去除每项空白，最多接受 32 个地址。
4. 任一地址为空、不是有效 IP，或地址数量超过 32 时，整条转发链判为无效；使用 socket
   地址，并记录不含原始 header 的警告。
5. 将 socket 地址追加在转发链尾部，从右向左跳过可信代理；遇到的第一个非可信地址即为
   客户端 IP。若链中所有地址都属于可信范围，则使用最左侧地址。
6. 只有选中的地址来自 header 时，来源才是 `x-forwarded-for`；其他情况均为 `socket`。

从右向左解析保证调用方不能通过在链首添加伪造地址越过第一个非可信节点。首版不合并
或比较其他 IP header，避免多套来源产生不明确的优先级。

## User-Agent 策略

只读取 `User-Agent` header，不记录完整 headers。值去除首尾空白，缺失或清理后为空时
归一为 `null`；非空值最多保留前 512 个字符。截断后的值同时供请求开始日志和后续显式
审计元数据使用，不保留另一份未截断值。

## 请求日志与脱敏

### 请求日志事件

现有三类请求事件保持不变，但改为使用请求 child logger：

- `request started`：公共绑定字段加 `userAgent`。
- `request completed`：Hono 完成响应构造后记录，公共绑定字段加 `status`、
  `durationMs`。
- `request failed`：公共绑定字段加 `status`、`durationMs`、`err`；其中 `err` 取 Hono
  保留在 `c.error` 中的原始异常。

Hono 会在下游抛出异常时先执行对应 app error handler，再让外层中间件从 `await next()`
返回；因此请求日志中间件不使用 `try/catch` 捕获或重新抛出下游异常。子应用 error
handler 映射的预期领域 `4xx` 也会保留 `c.error`，不能仅凭它判断失败。`await next()`
返回后，只有 `c.error` 存在且最终响应状态为 `5xx` 时才记录一次 `request failed`，不再
记录 `request completed`，也不重新调用 error handler；其他响应均记录
`request completed`。所有 Error 对象统一放在 Pino 约定的 `err` 字段；现有使用
`{ error }` 的日志调用在本切片中同步改为 `{ err }`，确保错误名称、消息和 stack 使用
Pino 标准序列化。

`durationMs` 从请求日志中间件开始执行计到 `await next()` 返回，语义是应用处理并构造
响应所用时间，不是客户端完整接收响应的网络耗时。流式下载在响应对象构造完成后即记录
`request completed`；日志中间件不读取、包裹或等待响应流，流后续完成、取消或读取失败
不追加完成或失败事件。现有事件名称保持兼容；若以后需要实际传输生命周期，另行在 Node
适配层设计访问日志。

### 允许字段边界

请求日志不得传入或记录：

- 完整 Request 或 Response 对象。
- 完整请求或响应 headers。
- 完整 URL 或查询串。
- 请求体、响应体或文件内容。
- 原始 `X-Forwarded-For` 值。
- 环境变量对象、配置对象或数据库连接串。

转发链警告除 child logger 已绑定的请求公共字段外，只增加安全原因码和可选 hop 数，不
记录原始转发头。查询串被排除是安全要求，因为附件签名 token 等秘密可能出现在 URL
query 中。

### Pino redaction

继续使用 Pino 成熟的结构化字段 `redact`，不自行实现递归扫描、正则猜测或部分遮罩算法。
集中维护固定敏感键清单：

- `authorization`、`cookie`、`set-cookie`
- `password`、`currentPassword`、`newPassword`、`passwordHash`
- `accessToken`、`refreshToken`、`attachmentToken`、`signedToken`、通用 `token`
- `secret`、`accessSecret`、`refreshSecret`、`attachmentSecret`、`signingSecret`、`apiKey`
- `databaseUrl`

Pino 路径覆盖每个敏感键的顶层位置和任意一个顶层容器内的位置，并显式覆盖
`req.headers.authorization`、`req.headers.cookie`、`res.headers["set-cookie"]` 等标准
header 容器。禁止记录完整请求和配置对象，因此不为任意深度对象建立自定义递归扫描。
命中值统一替换为 `[Redacted]`，不保留原始长度或片段。以后新增结构化 secret 字段时，
必须在同一变更中扩充键清单和最终 JSON 输出测试。

Pino redaction 路径区分大小写，清单使用项目实际结构化字段的精确名称；header 容器中的
标准 header 名按小写匹配。包含连字符的键必须使用 bracket notation，例如顶层
`["set-cookie"]` 和 `res.headers["set-cookie"]`，不能把普通点路径字符串当作等价写法。

redaction 只能处理结构化字段，不能可靠识别任意普通字符串内部的秘密。因此代码不得把
密码、token、Cookie、连接串或环境变量值拼进日志消息和 Error message；也不得以扩大
redaction 路径为理由放开完整 body 或配置对象日志。

技术日志继续输出结构化 JSON，不写入数据库。采集、外部存储和保留策略由未来部署设计
决定。

## 运维权限根资源

新增数据库 migration，向 `system_resources` 写入一条固定种子资源：

| 字段 | 值 |
| --- | --- |
| `id` | `10000000-0000-4000-8000-000000000300` |
| `parent_id` | `null` |
| `type` | `directory` |
| `name` | `运维管理` |
| `code` | `ops` |
| `path` | `null` |
| `external_url` | `null` |
| `open_target` | `self` |
| `icon` | `lucide:activity` |
| `hidden` | `false` |
| `status` | `0`，禁用 |
| `sort_order` | `300` |

不写入 `system_role_resources`，也不新增子资源。现有访问聚合只返回启用资源，因此该目录
默认不进入管理员或普通用户的 `accessCodes` 和 `menus`。权限资源管理接口仍可查询到该
禁用记录，符合现有完整资源树的管理语义。

项目仍处于未正式使用的开发阶段，`ops` 沿用现有 `system`、`content`、`demo` 等种子
资源的管理语义：本设计只保证 migration 执行后的初始记录，不新增删除保护或
`code`、`type`、`parentId` 的特殊更新限制。开发过程中若手工修改或删除该记录，通过
重建开发数据库并重新应用 migration 恢复，不在运行时静默补写或修复。

后续新增运维资源时遵循以下约定：

- 菜单编码使用 `ops:<module>`。
- 动作编码使用 `ops:<module>:<action>`。
- 权限判断继续使用精确 code，不引入 `ops:*` 通配符。
- 第一个实际运维模块交付时启用 `ops` 根目录，并新增、启用自己的菜单和动作。
- 其他模块按需追加资源，不由本设计预置。

## 错误处理

- 可信代理环境变量在生产入口边界严格校验；非法配置在数据库和维护任务启动前阻止
  启动，不使用静默 fallback。
- 不可信或格式错误的请求转发头不改变业务响应。解析失败时安全使用 socket 地址并记录
  警告，不能把 header 中任意地址标记为客户端 IP。
- socket 信息缺失是 Hono 内存请求等环境允许的状态，使用 `unavailable`，不制造
  `400` 或 `500`。
- 请求日志中间件只通过 `c.error` 和最终 `5xx` 状态记录已经由 Hono error handler 处理的
  未知异常，不二次抛出或重新映射；继续沿用现有 Hono 路由错误映射和未知错误处理，
  不新增宽泛错误 fallback。
- 根 error handler 保留 Hono `getResponse()` 异常的原始响应，并为其他异常复现原有通用
  `500` 响应；handler 不写 console 日志，错误记录统一由请求日志中间件完成，避免重复
  输出和绕过 Pino redaction。
- 日志 redaction 是泄漏防线，不参与业务控制流；日志配置或调用方式不得吞掉业务异常。

## 测试设计

### 客户端 IP 与配置单元测试

覆盖：

- 空可信代理配置忽略伪造的 `X-Forwarded-For`。
- 单个 IP、IPv4 CIDR 和 IPv6 CIDR 的合法配置与匹配。
- 非法 IP、CIDR、前缀、端口、hostname 和空配置项导致创建策略失败。
- IPv4-mapped IPv6 规范化。
- 单层和多层可信代理选择第一个非可信地址。
- 全部地址可信时选择最左侧地址。
- 非可信直连对端不能借助转发头伪造客户端 IP。
- 空地址、非法地址和超过 32 跳的链安全返回 socket 地址。
- socket 地址缺失时返回 `unavailable`，且不使用转发头。

### 请求上下文与 app 边界测试

覆盖：

- 不同请求生成不同且格式有效的 UUID。
- 传入 `X-Request-Id` 不会影响服务端生成值。
- context 中的 `requestId` 与响应 `X-Request-Id` 一致。
- 成功、`401`、`403`、`404`、`413` 和测试路由抛出的未知异常都返回请求 ID header。
- Hono 内存请求可以在没有 socket 信息时正常完成。
- User-Agent 的空值归一和 512 字符上限。
- 使用 `@hono/node-server` 启动监听随机端口的最小 app，验证真实 HTTP 请求能从 adapter
  connection bindings 取得 socket 地址；同时验证可信 loopback 代理配置下的有效
  `X-Forwarded-For` 会进入请求上下文。测试完成后关闭 server，不依赖外部网络。

### 日志输出测试

使用内存 destination 检查最终 Pino JSON，而不是只测试配置数组：

- 同一请求的开始、完成或失败日志共享 `requestId` 和请求公共字段。
- path 不包含查询串，日志不包含请求体、响应体和完整 headers。
- 根级和已支持结构化容器中的密码、token、Cookie、secret 和连接串均输出为
  `[Redacted]`，原值在序列化结果中不可见。
- Error 使用 `err` 得到标准序列化；未知异常只产生失败日志，不再额外产生完成日志，且
  Hono 生成的 `500` 响应保持不变。
- 根 error handler 保留带 `getResponse()` 异常的原始状态、headers 和响应体。
- 未知异常不再触发 Hono 默认 `console.error`，最终只存在一条 Pino 失败日志。
- 子应用 error handler 映射为 `4xx` 的领域异常即使存在 `c.error`，仍只产生完成日志。
- 流式响应不被日志中间件读取或包裹，并按响应构造完成语义记录；测试不把流消费完成
  当作 `durationMs` 或日志事件的边界。
- 附件删除触发的存储文件删除失败日志使用显式传入的 request child logger，并与该请求
  的开始、完成日志共享 `requestId`；后台清理日志仍使用进程级 logger。
- 无效转发链警告不包含原始 `X-Forwarded-For`。

### 数据库迁移测试

在迁移后的测试数据库中验证：

- 固定 ID 和 `code = 'ops'` 的根目录存在且字段符合设计。
- `ops` 初始为禁用且没有子资源或角色资源关联。
- 启用 `admin` 角色的用户默认也不会获得 `ops` 访问码或菜单节点。

不增加 client 或 contracts 测试。实现完成后先运行服务端定向测试和 typecheck，最终按仓库
约定运行完整 `pnpm check`。

## 文档与兼容性

- 更新 `apps/server/.env.example`，但不修改或提交开发者本地 `.env`。
- README 增加可信代理配置说明，并明确默认只认 socket 地址。
- 现有 API 请求体和响应体契约不变；新增的 `X-Request-Id` 是向后兼容的响应 header。
- 日志事件名称保持不变，但结构增加请求关联字段，且部分敏感字段会从明文改为
  `[Redacted]`。
- 数据库只新增一条禁用资源，不产生可见菜单，也不改变现有角色访问能力。

## 后续使用边界

本设计不规定后续运维功能的拆分或实施顺序。需要使用 HTTP 请求元数据的功能可以复用
`requestId`、`clientIp`、`clientIpSource` 和 `userAgent`，但技术请求日志不能直接充当
业务审计记录。

需要持久化事件时，应依据事件自身的查询方式和状态语义确定数据模型；本设计不预设一张
通用事件表。相关功能仍需明确自己的数据保留期限、查询权限、目标字段、详情脱敏和失败
语义。
