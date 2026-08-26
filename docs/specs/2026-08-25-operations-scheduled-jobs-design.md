---
status: implemented
date: 2026-08-25
---

# 运维管理定时任务与任务日志设计

## 背景

运维管理前三个切片已经建立请求上下文、登录日志与稳定会话，以及显式操作日志框架。当前
服务端能够区分 HTTP 请求日志、业务操作日志和普通 Pino 运行日志，但后台维护任务仍由
`apps/server/src/maintenance` 下的五个进程内 worker 分别管理。

这些 worker 在服务启动后立即执行，再使用各自的 `setTimeout` 和
`*_CLEANUP_INTERVAL_MS` 环境变量安排下一次运行。该方式可以完成基本清理，但计划没有
持久化，服务重启会重新立即执行；管理员无法查看或修改计划、手动执行、合作取消，也没有
统一的任务运行记录。任务失败只进入 Pino，无法在运维界面追踪。附件 worker 还把三个互相
独立的清理阶段串在一次运行中，并分别捕获错误，难以表达每个阶段的真实结果。

项目当前只有一个 Node Server 进程，没有独立 worker、负载均衡、多实例部署或任务队列。
开发环境使用 PGlite，生产环境使用 PostgreSQL。本设计在这个真实边界内建立数据库持久化
计划和执行记录，不为尚不存在的多实例部署引入 leader election、运行时租约或心跳。

## 目标

1. 以代码中的固定任务目录限定可执行任务，禁止数据库配置任意脚本、URL 或动态 handler。
2. 把 Cron、时区、启用状态和下次执行时间持久化到数据库，使重启不重置计划。
3. 使用标准五段 Cron 和 IANA 时区，并让前后端复用同一解析及预览实现。
4. 在当前 Server 进程内可靠调度到期任务，并限制自动与恢复执行同时最多两个。
5. 保证同一任务的定时、手动和恢复执行不重叠，并为冲突尝试留下明确记录。
6. 将停机期间错过的多个计划合并为一次立即执行，不逐次补跑。
7. 为每次执行、跳过、取消和中断保存结构化、安全、可分页的运行记录。
8. 支持管理员修改计划、启停任务、立即执行和合作取消，并沿用现有权限与操作日志框架。
9. 将现有维护 worker 迁移为七个独立内置任务，并新增任务运行日志自清理任务。
10. 保留现有业务保留期配置，删除只负责调度周期的旧环境变量。
11. 让进程崩溃时未完成且尚未请求取消的任务在下次启动后获得一次恢复执行，明确采用至少一次
    语义；已请求取消的中断运行不恢复。
12. 用定向测试覆盖调度计算、状态转换、并发、恢复、取消、迁移和用户可见页面行为。

## 非目标

本设计不包含：

- 多 Server 实例、滚动多实例部署、独立 worker 进程、leader election 或分布式协调。
- 运行时租约、心跳续租、PostgreSQL advisory lock 或长事务持锁。
- Redis、外部任务队列、消息系统、outbox 或新的部署单元。
- 由管理员创建、删除或复制任务，以及执行 shell、JavaScript、SQL、HTTP URL 等任意内容。
- 秒级或年级 Cron、`@daily` 等快捷表达式，以及 `L`、`W`、`#`、`+`、`?` 扩展。
- 任务依赖、DAG、优先级、参数表单、单次临时计划或 handler 失败后的自动退避重试；这里不
  包含运行结果元数据的幂等收尾重试。
- 自动执行超时、子进程隔离、强制杀死 handler 或立刻中止正在进行的数据库、存储调用。
- 对手动执行设置独立容量限制、排队规则或全局任务并发上限产品配置。
- 全局任务日志页面、日志导出、手工删除、任务告警、系统健康或指标面板。
- SSE、WebSocket 或页面级持续轮询。
- 附件删除 outbox、补偿表或每个文件的持久化重试状态。
- 兼容已删除的 `*_CLEANUP_INTERVAL_MS` 环境变量。
- 对数据库外手工修改提供自动修复、默认值回退或专门的错误配置修复界面。

当前单进程是运行前提。若以后允许两个 Server 同时连接同一数据库，必须先重新设计启动恢复
和自动执行容量，不能直接把本实现视为多实例安全。

## 术语与语义

- **内置任务**：由代码注册固定 key、名称和 handler 的任务。数据库只能配置其计划和启用
  状态。
- **计划记录**：`ops_scheduled_jobs` 中每个内置任务唯一的一行。
- **运行记录**：`ops_job_runs` 中一次触发尝试。真正执行和因重叠而跳过都各有一行。
- **运行中**：运行记录尚未成功持久化为终态；通常表示 handler 正在执行，也包括 handler 已
  结束但 runner 正在重试终态事务的阶段。
- **到期**：启用任务的 `next_run_at` 小于或等于当前时间。
- **自动执行**：由 Cron 计划触发的 `scheduled` 运行。
- **手动执行**：管理员通过 API 触发的 `manual` 运行。
- **恢复执行**：上次运行因进程退出成为 `interrupted` 后，由下一次启动安排的
  `recovery` 运行。
- **错过执行**：服务未运行时已经过去的一个或多个 Cron 时刻。
- **合并补跑**：多个错过时刻只生成一次立即执行，再把计划推进到未来。
- **占用**：计划记录的 `active_run_id` 指向当前唯一运行；它没有超时，也不续租。
- **合作取消**：记录取消请求并触发 `AbortController`，由 handler 在安全边界观察后退出。
- **至少一次**：进程可能在业务副作用完成后、运行结果落库前崩溃；恢复执行因此可能再次执行
  同一幂等清理。

## 决策摘要

| 主题 | 决策 |
| --- | --- |
| 部署边界 | 调度器和 runner 内嵌当前唯一 Node Server |
| 任务定义 | 代码固定 registry；API 不支持创建、删除或动态 handler |
| 调度事实源 | 数据库中的 Cron、时区、启用状态和 `next_run_at` |
| Cron | Croner 严格五段模式；共享工具只解析和计算，不注册 Croner 回调 |
| 默认时区 | `Asia/Shanghai`；每个任务可单独修改为有效 IANA 时区 |
| 初始错峰 | 每个任务使用显式默认相位；新增任务选择空档，不按任务数量重新平衡旧计划 |
| 唤醒方式 | 一个指向最近到期时间的进程内 timer；不固定轮询数据库 |
| 自动容量 | `scheduled` 与 `recovery` 共用两个执行槽 |
| 手动执行 | 原子认领后立即返回 `202 + runId`，不占自动执行槽 |
| 同任务并发 | 所有触发来源统一不重叠；冲突记录 `skipped / overlap` |
| 运行占用 | 持久化 `active_run_id`；无租约、过期时间或心跳 |
| 错过执行 | 多个错过时刻合并为一次，随后推进到当前时间之后的首个 Cron 时刻 |
| 禁用 | 只停止计划执行；允许手动执行，不取消当前运行 |
| 启用 | 从启用时刻计算下一次，不补禁用期间的计划 |
| 启动恢复 | 旧 `running` 记为 `interrupted`；最新非跳过执行仍中断且未请求取消的任务恢复一次 |
| 取消 | 数据库取消请求 + 当前进程 `AbortController`；handler 退出且终态收尾成功后才释放占用 |
| 收尾失败 | runner 在当前调用中保留安全结果，每 60 秒幂等重试终态事务，不重跑 handler |
| 运行结果 | 安全状态、时间、显式计数、固定错误分类和操作者快照 |
| 页面 | 单一定时任务页；每个任务使用分页日志抽屉 |
| 前端刷新 | 查询按钮显式刷新任务列表；仅对用户正在关注的单个运行每 2 秒轮询，终态或离开后停止 |
| 运行日志保留 | 默认 90 天，由第八个内置任务清理 |
| 操作审计 | 用户配置和命令写操作日志；后台执行过程只写任务日志和 Pino |

## 架构与组件边界

### 共享 Cron 工具

`packages/utils` 新增只包含纯计算的 Cron 封装，并把 `croner` 作为该 workspace 的直接依赖。
客户端和服务端都只通过封装使用 Croner，不直接创建 Croner 实例。

封装至少提供：

~~~ts
type CronScheduleInput = {
  expression: string
  timezone: string
}

function validateCronSchedule(input: CronScheduleInput): CronScheduleInput

function getNextCronOccurrences(
  input: CronScheduleInput & {
    from: Date
    count: number
  },
): Date[]
~~~

实现先检查表达式恰好有五个空白分隔字段，字段只含数字、英文月份或星期别名及
`* , - /`，再使用 Croner `mode: '5-part'`、指定 `timezone` 和暂停模式完成语义校验与
时间计算。所有返回时刻必须严格晚于 `from`，不能把刚好匹配的 `from` 本身计入结果；无法
产生未来时刻或不能返回请求数量的表达式视为无效。封装不暴露 Croner 实例、timer 或
callback。

`timezone` 必须是运行环境认可的 IANA 时区。`count` 由内部调用固定为所需数量，API 不开放
任意大预览请求。返回值是绝对 `Date`；数据库只保存对应的 `timestamptz`。夏令时跳跃和重复
时刻遵循 Croner 的时区计算，不在项目内另写 Cron 解释器。

### 共享契约

`packages/contracts/src/ops/scheduled-jobs.ts` 定义：

- 固定任务 key、触发来源、状态、跳过原因和安全错误分类。
- 任务列表、计划修改、启停、分页运行列表和运行详情 schema。
- 手动执行、取消和冲突响应所需的窄结构。
- 路径与 query schema，以及从 Zod 推导的 TypeScript 类型。

任务 key 可以作为共享枚举供路由和前端使用，但 handler、依赖注入、中文任务说明和执行
结果映射不进入 contracts。

### 服务端任务 Registry

服务端 registry 为每个固定 key 提供：

~~~ts
type ScheduledJobResult = {
  deletedCount: number
  failedCount: number
}

type ScheduledJobDefinition = {
  key: ScheduledJobKey
  name: string
  description: string
  run: (context: {
    signal: AbortSignal
    logger: Logger
  }) => Promise<ScheduledJobResult>
}
~~~

Registry 在启动时一次性构造，key 必须唯一且完整覆盖共享任务 key。handler 通过闭包取得
`Db`、附件存储和已经通过系统边界校验的保留期配置，不从运行记录接收任意参数。`logger`
是 runner 从基础进程 logger 创建并已经绑定 task key、run ID 和 executor ID 的 child
logger，不是请求 logger。handler 返回值使用 strict schema 校验后才能持久化；原始返回
对象不会直接进入数据库。

### 服务端运行时

调度能力拆为以下职责：

1. **Repository**：计划和运行记录的查询、短事务认领、状态转换和分页。
2. **Scheduler**：维护最近到期 timer、两个自动执行槽、恢复候选和唤醒信号。
3. **Runner**：管理当前进程的 `AbortController`，调用 registry handler，写安全结果并输出
   Pino。
4. **Service**：供运维 API 查询、修改、启停、手动执行和取消；不直接调用领域 cleanup。
5. **Routes**：输入校验、权限、HTTP 状态和显式操作日志登记。

运行时由生产入口创建并注入 app，不使用模块级全局单例。数据库是计划和运行状态的唯一事实
源；内存只保存当前进程可以重建的 timer、两个自动槽、恢复候选、AbortController，以及
runner 当前调用栈中尚未持久化的安全候选结果。

## 内置任务目录与初始计划

迁移创建以下八条计划记录：

| task key | 显示名称 | 领域 handler | 业务配置 | 初始 Cron |
| --- | --- | --- | --- | --- |
| `auth-session-cleanup` | 认证会话清理 | 过期会话及超过保留期的已撤销会话 | `AUTH_REVOKED_SESSION_RETENTION_MS`，默认 7 天 | `2 */6 * * *` |
| `auth-login-attempt-cleanup` | 登录尝试桶清理 | 过期登录限流桶 | `AUTH_LOGIN_ATTEMPT_RETENTION_MS`，默认 1 天 | `38 */6 * * *` |
| `ops-login-log-cleanup` | 登录日志清理 | 超过保留期的登录日志 | `OPS_LOGIN_LOG_RETENTION_MS`，默认 90 天 | `12 1,7,13,19 * * *` |
| `ops-operation-log-cleanup` | 操作日志清理 | 超过保留期的操作日志 | `OPS_OPERATION_LOG_RETENTION_MS`，默认 180 天 | `48 1,7,13,19 * * *` |
| `attachment-expired-upload-session-cleanup` | 过期附件上传会话清理 | 已过期上传会话及其临时文件 | 上传会话自身到期时间 | `22 2,8,14,20 * * *` |
| `attachment-unreferenced-cleanup` | 未引用附件清理 | 超过保留期且没有引用的附件 | `ATTACHMENT_CLEANUP_RETENTION_MS`，默认 7 天 | `8 3,9,15,21 * * *` |
| `attachment-orphaned-storage-cleanup` | 孤立附件存储清理 | 不再受活动记录保护的 `uploads` 对象 | `ATTACHMENT_CLEANUP_RETENTION_MS`，默认 7 天 | `52 3,9,15,21 * * *` |
| `ops-job-run-cleanup` | 任务运行日志清理 | 超过保留期的终态运行记录 | `OPS_JOB_RUN_RETENTION_MS`，默认 90 天 | `28 4,10,16,22 * * *` |

八个初始计划都保持每 6 小时执行一次，并分别使用 `00:02`、`00:38`、`01:12`、`01:48`、
`02:22`、`03:08`、`03:52` 和 `04:28` 的显式默认相位，避免整点和常见的 `:00`、`:05`
边界，同时保留后续任务可用的空档。这些相位不是按任务数量均分得出的全局约束。新增内置任务
在自己的迁移中选择不冲突的空档，不重新平衡或覆盖已有计划。

初始时区均为 `Asia/Shanghai`，初始状态均为启用。迁移把 `next_run_at` 设置为迁移时刻，使
第一次部署立即运行一次；首次执行认领时再进入各自 Cron 对齐的未来计划。附件计划按过期上传
会话、未引用附件、孤立存储排序，使前两项留下的文件可在同一周期由孤立存储任务自然重试。
以后重启保留已持久化的 `next_run_at`，不会无条件立即执行。

新增任务、删除任务或更改默认值都必须通过代码和数据库迁移共同完成。新增任务只写自己的
默认相位；启动和后续迁移不会为重新错峰而改写其他任务，更不会覆盖管理员已经保存的 Cron、
时区或启用状态。启动只加载并校验，不会补建被手工删除的记录。

## 数据模型

### `ops_scheduled_jobs`

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `task_key` | `text` | 主键；固定任务 key，非空且限制长度 |
| `cron_expression` | `text` | 非空且限制长度；语义由共享 Cron 工具校验 |
| `timezone` | `text` | 非空且限制长度；有效 IANA 时区 |
| `enabled` | `boolean` | 非空 |
| `next_run_at` | `timestamptz` | 启用时非空；禁用时为空 |
| `active_run_id` | `uuid` | 可空；引用当前 `ops_job_runs.id`，删除受限 |
| `created_at` | `timestamptz` | 非空 |
| `updated_at` | `timestamptz` | 非空 |

数据库 check 保证 `enabled` 与 `next_run_at` 的空值形状一致，并校验三个文本字段非空及长度。
Cron 和 IANA 时区的完整语义仍在迁移、API 和启动边界通过共享工具校验。

索引覆盖：

- `enabled, next_run_at, task_key`，用于寻找最近到期任务。
- `active_run_id` 唯一且仅对非空值生效，防止同一运行被多个任务引用。

`active_run_id` 外键在两张表创建后添加，以处理计划和运行记录之间的双向引用。正常删除任务
不在产品能力内；任务日志清理也不能删除仍被引用的运行。

### `ops_job_runs`

| 字段 | 类型 | 约束与语义 |
| --- | --- | --- |
| `id` | `uuid` | UUIDv7 主键 |
| `task_key` | `text` | 非空，引用 `ops_scheduled_jobs.task_key`，删除受限 |
| `trigger_source` | `text` | `scheduled`、`manual` 或 `recovery` |
| `status` | `text` | `running`、`success`、`failure`、`skipped`、`cancelled` 或 `interrupted` |
| `skip_reason` | `text` | 仅 `skipped` 使用；初期只允许 `overlap` |
| `scheduled_for` | `timestamptz` | 定时运行必填；手动运行为空；恢复运行复制被中断运行的值 |
| `executor_id` | `uuid` | 真正执行时记录当前启动实例 ID；跳过时为空 |
| `deleted_count` | `integer` | 可空，非负；只保存显式公共计数 |
| `failed_count` | `integer` | 可空，非负；只保存显式公共计数 |
| `error_category` | `text` | 可空；固定安全分类 |
| `error_summary` | `text` | 可空；固定或受控摘要，非空且限制长度 |
| `triggered_by_user_id` | `uuid` | 手动触发人 ID 快照，不设用户外键 |
| `triggered_by_username` | `text` | 手动触发人用户名快照 |
| `triggered_by_nickname` | `text` | 手动触发人昵称快照 |
| `triggered_by_session_id` | `uuid` | 手动触发 session ID |
| `trigger_request_id` | `uuid` | 手动触发 request ID |
| `cancel_requested_at` | `timestamptz` | 首次取消请求时间 |
| `cancel_requested_by_user_id` | `uuid` | 首次取消请求人 ID 快照 |
| `cancel_requested_by_username` | `text` | 首次取消请求人用户名快照 |
| `cancel_requested_by_nickname` | `text` | 首次取消请求人昵称快照 |
| `cancel_requested_by_session_id` | `uuid` | 首次取消请求 session ID |
| `cancel_request_id` | `uuid` | 首次取消请求 request ID |
| `started_at` | `timestamptz` | 真正执行时非空；跳过时为空 |
| `finished_at` | `timestamptz` | 终态非空；`interrupted` 表示下次启动确认中断的时间；`running` 为空 |
| `duration_ms` | `bigint` | `success`、`failure`、`cancelled` 时为非负安全整数；`running`、`skipped`、`interrupted` 为空 |
| `created_at` | `timestamptz` | 非空 |
| `updated_at` | `timestamptz` | 非空 |

`error_category` 初期只允许 `partial_failure`、`database`、`storage` 和 `internal`。
handler 或 runner 只能从固定映射产生 `error_summary`；禁止持久化原始 `Error`、stack、SQL、
连接信息、文件路径、存储 key 或 handler 任意 JSON。

`duration_ms` 在 Drizzle 和 API 中映射为 JavaScript `number`，不是不能 JSON 序列化的
`bigint` 值；应用与数据库边界共同限制为安全整数。

数据库 check 至少保证：

- `running` 没有结束时间；所有终态都有结束时间。
- `skipped` 必须有 `overlap`，没有开始时间、执行器、耗时、计数或错误。
- 真正执行的记录有开始时间和执行器；`success`、`failure`、`cancelled` 有不超过 JavaScript
  `Number.MAX_SAFE_INTEGER` 的非负耗时。
- `interrupted` 有开始时间、执行器和结束时间，但耗时为空，因为进程退出的准确时刻不可知；
  结束时间只表示下次启动确认中断的时刻。
- `success` 没有错误且 `failed_count` 为 0。
- `failure` 有安全错误分类和摘要；允许保留部分成功计数。
- 手动来源的五个触发人字段全部非空，其他来源全部为空。
- 取消时间与五个取消人字段要么全部为空，要么全部非空。
- 只有 `running` 可以新增取消请求；“取消中”由运行状态和取消时间派生。

索引至少覆盖：

- `task_key, created_at, id`，用于每任务倒序分页。
- `task_key` 在 `status = 'running'` 时的部分唯一索引，作为同任务不重叠的数据库兜底。
- `finished_at, id`，用于终态保留期清理。
- `status`，用于启动一致性检查。
- `trigger_request_id` 的非空唯一索引，保证一次手动触发请求只产生一条尝试记录。

任务运行记录不是操作日志：它在运行期间会从 `running` 更新为终态，并可能增加取消信息；
终态之后不再编辑。

## Cron 与计划变更语义

### 保存和预览

前端用共享工具实时校验并展示从当前时刻开始的未来五次执行；服务端保存时必须重新使用同一
工具校验，不能信任前端结果。数据库保存用户输入规范化后的五段表达式和 IANA 时区，不保存
中文描述或预览数组。

计划时间采用以下固定规则：

- 迁移种子：`next_run_at = now`，用于首次立即执行。
- 修改 Cron 或时区：若任务启用，计算保存时刻之后的首个时刻；若禁用，保持为空。
- 禁用：设置 `enabled = false`、`next_run_at = null`，不改变 `active_run_id`。
- 启用：设置 `enabled = true`，从启用时刻计算未来首个时刻，不补禁用期间的计划。
- 手动执行：不修改 `next_run_at`。
- 定时认领或定时重叠：用认领事务的当前时间计算严格位于未来的首个时刻。
- 恢复认领：只有当启用任务的 `next_run_at` 已到期时才推进到未来，否则保留原计划。

修改计划、禁用或启用都不改变当前运行。runner 收尾也不重新计算计划，避免覆盖管理员在运行
期间保存的新值。

### 唤醒 timer

Scheduler 只保存一个 timer：

1. 没有空闲自动槽时，仍查询并处理 `active_run_id` 非空的到期任务，为其写入重叠跳过并推进
   计划；对没有占用、需要真实执行的到期任务不认领也不忙循环，等待任一运行结束信号。
2. 有空闲槽时，查询最早 `next_run_at`，到期则调度，未到期则设置单一 timer。
3. 配置修改、启停、自动运行结束和恢复候选变化都会主动调用 `wake()` 并重建 timer。
4. 所有任务禁用且没有恢复候选时不设置 timer，等待显式唤醒。
5. 超过 Node timer 安全范围的等待拆成安全长度后重新计算，不把大延时传给 `setTimeout`。
6. timer 唤醒后重新读取数据库并比较墙钟，不把内存中的旧时间视为事实。
7. 到期查询发生数据库错误时写安全 Pino，并设置唯一的 60 秒重试 timer；连续失败时
   每次仍等待 60 秒，不叠加 timer。正常状态不固定轮询。

不支持通过直接 SQL 修改计划；因此不为数据库外修改增加 LISTEN/NOTIFY 或轮询发现机制。

## 认领、并发与错过执行

### 自动执行槽

`scheduled` 和 `recovery` 共用两个进程内执行槽。这个容量是当前运行时常量，不作为管理页面
配置。手动执行不占这两个槽，但仍受同任务 `active_run_id` 约束。

恢复候选优先于普通到期任务，并按被中断记录的 `started_at + task_key` 排序。普通到期任务
按 `next_run_at + task_key` 排序。空闲槽只认领可实际执行的任务；因容量不足未认领的任务
继续保持到期，不生成 `skipped`。

即使两个槽都在使用，Scheduler 仍可以处理已经到期但当前任务自身正在运行的计划：它写入
`skipped / overlap` 并推进该任务的下一计划，因为该操作不占执行槽。

### 定时认领

每个候选在短事务内锁定对应计划行并重新检查状态：

1. 任务已禁用、已不再到期或记录已变化时，不执行。
2. `active_run_id` 非空时，插入 `scheduled + skipped + overlap` 记录；`scheduled_for`
   使用原 `next_run_at`；把计划推进到当前时间之后的首个 Cron 时刻。
3. 没有占用时，插入 `scheduled + running` 记录，设置 `active_run_id`，并在同一事务推进
   `next_run_at`。
4. 事务提交后才占用自动槽并调用 handler；提交失败时不能启动 handler。

从当前时间而不是从每个错过时刻逐次推进，保证停机、系统休眠或槽位等待造成的多个过期时刻
只合并执行一次。

### 手动认领

手动执行在短事务内锁定计划行：

1. 未知 task key 返回 `404`。
2. `active_run_id` 非空时，插入带操作者快照的 `manual + skipped + overlap` 记录并返回
   `409`；不改变计划。
3. 没有占用时，插入带操作者快照的 `manual + running` 记录并设置 `active_run_id`。
4. 事务提交后立即把执行交给 runner，并返回 `202` 和 `runId`；HTTP response 不等待任务。

禁用只控制定时触发，不能阻止手动认领。内存中等待自动槽的恢复候选也不阻止手动认领，且不
因为后来出现手动执行而设置额外的失效或替代状态。

### 启动恢复

当前设计依赖单进程部署，因此新进程启动时，数据库中任何 `running` 都必然来自已经退出的旧
进程。启动初始化在开始正常调度前：

1. 校验所有 `active_run_id` 都指向同 task key 的 `running` 记录，并校验不存在未被计划
   引用的 `running`。不一致时初始化失败，不猜测修复。
2. 使用同一启动时刻把这些记录更新为 `interrupted`，以该时刻补齐 `finished_at`，保持
   `duration_ms = null`，并清除对应 `active_run_id`。该时间表示确认中断的时刻，不冒充无法
   得知的实际进程退出时刻。
3. 按 `created_at DESC, id DESC` 查询每个任务最新一条非 `skipped` 的真实执行记录；状态为
   `interrupted` 且没有取消请求时加入内存恢复候选。较新的重叠跳过记录不能遮蔽中断执行；
   带取消请求的中断记录保留 `interrupted` 状态及首次取消人快照，但不恢复。
4. 恢复认领同样在短事务内锁定计划行：已有 `active_run_id` 时插入
   `recovery + skipped + overlap` 并消费该恢复候选；没有占用时创建新的
   `recovery + running`。两者都不复制原手动操作者，并复制原 `scheduled_for`；禁用状态不
   阻止这次恢复。
5. 若进程在恢复认领前再次退出且期间没有更晚的非跳过执行，最新真实执行仍是
   `interrupted`，下次启动会再次发现；期间若已有其他真实执行，则下一次启动自然以该记录为
   准，不增加特殊替代状态。若恢复已认领后退出，新记录会在下次启动转为新的
   `interrupted`。

恢复执行占自动槽。正常 `failure`、`cancelled`、`skipped` 或带取消请求的 `interrupted` 不触发
立即恢复。

不为“恢复候选排队期间又发生手动执行”建立特殊替代机制。若恢复认领时手动运行仍在执行，
恢复尝试按重叠跳过；若手动运行已结束，恢复仍会随后执行一次。后者可能形成两次连续执行，
本设计接受这一低概率结果，并依赖首批清理 handler 的幂等性。

### 至少一次与幂等

计划推进、运行认领和业务 handler 不在同一个数据库事务中。进程可能在 handler 已完成部分
或全部副作用后、结果落库前退出，下一次恢复因此会重复执行。所有首批 handler 都必须保持
幂等：

- 删除已不存在的数据库行自然无操作。
- 附件存储删除对不存在对象按现有存储契约保持可重复。
- 每个候选在删除前重新校验当前数据库条件。
- 任务日志清理只删除满足终态和截止时间的记录。

本设计不承诺 exactly-once。

## Runner、结果与取消

### 执行与收尾

每次服务启动生成一个 UUID `executorId`。runner 为实际认领的 run 创建
`AbortController`，以 `runId` 为键保存在内存 map，并从基础进程 logger 创建绑定
`taskKey`、`runId`、`triggerSource` 和 `executorId` 的 child logger。runner 和 handler
只使用该 logger 输出本次执行日志。

handler 正常返回后，runner 通过 strict schema 接受 `deletedCount` 和 `failedCount`：

- `failedCount = 0`：候选终态为 `success`。
- `failedCount > 0`：候选终态为 `failure`，分类为 `partial_failure`，摘要由固定模板生成。
- handler 抛错：候选终态为 `failure`；安全分类和摘要来自固定错误映射，原始错误只进入 Pino。

最终事务锁定运行和计划行，确认 `active_run_id` 仍等于当前 `runId`，写结束时间、耗时、
计数和安全错误，再清除占用。该事务必须幂等：若前一次提交成功但调用方没有收到确认，重试
读取到匹配的终态和已经清除的占用时视为成功，不能再次改变结果。若取消请求已经先写入，
终态改为 `cancelled`；若成功或失败收尾先完成，之后的取消请求返回冲突。该顺序以数据库行锁
决定，不依赖内存事件先后。

handler 返回或抛错时，runner 立即捕获候选 `finishedAt`，用单调时钟计算不受墙钟调整影响的
`durationMs`，并在当前 `run()` 调用的局部变量中保留经过 schema 校验的安全候选结果。此时
handler 已不再执行，自动运行立即释放原自动槽并唤醒 Scheduler；手动运行则没有自动槽。
runner 随后立即尝试终态事务，失败时写 Pino，等待固定 60 秒后幂等重试同一事务，直到成功或
运行时开始关闭；每次重试复用相同的候选时间、耗时、计数和安全错误，不把等待时间计入执行
耗时。它不把结果转移到 Scheduler、不创建共享待收尾表，也不重跑 handler。收尾重试期间保留
该 run 的 AbortController 和数据库 `active_run_id`，因此只阻止同一任务重叠，其他任务的自动
容量和业务 HTTP 服务不受影响。终态事务成功后才移除 AbortController 并再次唤醒 Scheduler。

若进程在收尾重试期间退出，局部候选结果可以丢失；数据库中的 `running + active_run_id` 仍由
下次启动按既定中断恢复语义处理。

### 合作取消

取消 endpoint 必须同时确认：

- task 和 run 存在且匹配。
- 该 run 正是计划记录的 `active_run_id`。
- run 仍是 `running`。

首次请求在短事务内写入取消时间和操作者快照。重复请求不覆盖第一次取消人，返回当前已接受
状态。事务提交后，service 查找当前进程的 AbortController 并调用 `abort()`。正常部署下
正在运行的记录一定属于当前进程；缺少 controller 是运行时不变量错误，写 Pino，不清除
占用。

handler 在以下边界检查 `AbortSignal`：

- 单次数据库清理调用之前和之后。
- 附件候选循环的每个项目之前。
- 每个数据库事务和存储调用之间。

已经开始的 SQL、对象存储 list 或 delete 可以完成。取消不会启动第二个 handler，也没有
强制终止或自动超时。若 handler 永远不返回且无法观察 signal，任务保持运行；管理员可以
重启服务。该运行会在启动时记为 `interrupted`，但因为已有取消请求而不会恢复执行。

### 关闭

优雅关闭先停止 Scheduler 新认领和 API 新触发，再等待已经认领的 handler 正常退出；关闭
流程不会冒充管理员发送取消，也不会主动 abort。已经处于收尾重试等待中的 runner 停止继续
等待，不因数据库持续不可用而阻塞关闭；随后停止操作日志运行时并关闭数据库。仍遗留的
`running` 由下次启动标记为 `interrupted`。

## 维护 handler 迁移

删除 `apps/server/src/maintenance` 下五套独立 timer worker，把现有领域 cleanup 组合进固定
registry。保留期仍在服务启动边界读取和校验，handler 不重复解析环境变量。

所有 handler 返回：

~~~ts
{
  deletedCount: number
  failedCount: number
}
~~~

数据库单语句删除成功时 `failedCount = 0`；语句失败直接抛错。附件循环对单项存储失败继续
处理其他候选，累计 `failedCount`，并把原始错误写入带 `runId` 的 Pino。

附件迁移固定如下：

1. **过期上传会话清理**：先删除过期会话；对应临时文件删除失败计入 `failedCount`。已删除
   会话不恢复。
2. **未引用附件清理**：继续逐项锁定并复核引用，先软删除附件记录，再删除存储对象；存储
   失败计入 `failedCount`。
3. **孤立附件存储清理**：把现有“孤立上传文件”名称扩展为准确的“孤立附件存储”，继续扫描
   当前 `uploads` 前缀，保护活动附件和上传会话引用的 key；其余超过保留期对象可删除。

未引用附件软删除后，该 storage key 不再属于孤立扫描的保护集合。因此文件删除失败无需新增
补偿状态，后续“孤立附件存储清理”会在达到保留期条件后重新尝试。两项任务本身都保持幂等。

`ops-job-run-cleanup` 只按 `finished_at` 删除超过
`OPS_JOB_RUN_RETENTION_MS` 的终态记录，明确排除 `running` 和任何仍被
`active_run_id` 引用的记录。它不会为被删除日志生成逐条记录；本次清理自身的运行记录在
结束后按正常保留期处理。

## 环境变量与迁移

删除以下调度变量及其读取、校验和文档：

- `AUTH_SESSION_CLEANUP_INTERVAL_MS`
- `AUTH_LOGIN_ATTEMPT_CLEANUP_INTERVAL_MS`
- `OPS_LOGIN_LOG_CLEANUP_INTERVAL_MS`
- `OPS_OPERATION_LOG_CLEANUP_INTERVAL_MS`
- `ATTACHMENT_CLEANUP_INTERVAL_MS`

保留：

- `AUTH_REVOKED_SESSION_RETENTION_MS`
- `AUTH_LOGIN_ATTEMPT_RETENTION_MS`
- `OPS_LOGIN_LOG_RETENTION_MS`
- `OPS_OPERATION_LOG_RETENTION_MS`
- `ATTACHMENT_CLEANUP_RETENTION_MS`

新增 `OPS_JOB_RUN_RETENTION_MS`，默认 `90 * 24 * 60 * 60 * 1000`，只接受正的安全整数
毫秒值。

数据库迁移一次完成：

1. 创建两张表、check、索引和双向外键。
2. 插入八条固定计划，Cron、时区和 key 先通过与运行时相同的规则确认。
3. 在运维根资源下新增“定时任务”菜单和四个 action 资源。
4. 不迁移旧 interval 环境值，不回填历史 worker 运行记录。

启动时 registry key 集合必须与数据库计划集合完全一致，且每条 Cron、时区和状态形状均有效。
迁移和受支持 API 是正常写入边界。直接 SQL、错误备份恢复或代码缺陷造成的不变量破坏会使
初始化失败并输出 Pino；系统不修改数据、不回退默认值，也不只跳过坏任务后继续。

## API 与契约

所有路由挂载在 `/api/ops/scheduled-jobs`，复用现有认证、`requireAccess`、请求上下文和
操作日志中间件。

### 任务列表

`GET /api/ops/scheduled-jobs`

- 权限：`ops:scheduled-job:list`。
- 返回全部固定任务，不分页。
- 每项包含 registry 名称、说明、Cron、时区、启用状态、下次执行、当前运行摘要和最近终态
  摘要。
- 当前运行和最近终态分别查询，当前运行不会遮蔽最近一次已完成结果。

### 修改计划

`PUT /api/ops/scheduled-jobs/:taskKey`

- 权限：`ops:scheduled-job:update`。
- body 严格为 `cronExpression` 和 `timezone`。
- 服务端校验后按当前时间重算启用任务的 `nextRunAt`；禁用任务保持为空。
- 返回更新后的任务。
- 记录 `ops:scheduled-job:update` 操作日志。

### 启用或禁用

`PUT /api/ops/scheduled-jobs/:taskKey/enabled`

- 权限：`ops:scheduled-job:update`。
- body 严格为 `enabled: boolean`。
- 启用计算未来首个时刻；禁用清空 `nextRunAt`；不取消当前运行。
- 根据目标状态记录 `ops:scheduled-job:enable` 或 `ops:scheduled-job:disable`。

### 手动执行

`POST /api/ops/scheduled-jobs/:taskKey/runs`

- 权限：`ops:scheduled-job:execute`。
- 无业务 body。
- 成功认领返回 `202` 和 `runId`。
- 同任务运行中时仍插入手动 `skipped / overlap`，返回 `409`，响应提供本次
  `skippedRunId` 和当前 `activeRunId`，便于 UI 刷新。
- 记录 `ops:scheduled-job:execute` 操作日志；最终 HTTP `202` 或 `409` 决定其成功失败。

### 运行列表与详情

`GET /api/ops/scheduled-jobs/:taskKey/runs`

- 权限：`ops:scheduled-job:list`。
- 使用项目统一 `page`、`pageSize`，按 `createdAt DESC, id DESC` 稳定分页。
- 初期不增加状态、来源或时间筛选。

`GET /api/ops/scheduled-jobs/:taskKey/runs/:runId`

- 权限：`ops:scheduled-job:list`。
- task 与 run 不匹配时返回 `404`。
- 返回完整安全详情，不返回原始异常或任意结果对象。

### 取消

`POST /api/ops/scheduled-jobs/:taskKey/runs/:runId/cancel`

- 权限：`ops:scheduled-job:cancel`。
- 无业务 body。
- 首次接受或重复读取同一取消请求时返回 `202` 和当前运行摘要；终态、非当前运行或不一致
  状态返回 `409`。
- 记录 `ops:scheduled-job:cancel` 操作日志。

`400` 只用于 schema/Cron/时区错误，`404` 用于未知 task/run，`409` 用于合法请求与当前运行
状态冲突。未知错误继续交给根 error handler 返回 `500`。

## 权限、资源与操作日志

在现有 `ops` 根资源下新增：

| 类型 | 名称 | code | 路径或含义 |
| --- | --- | --- | --- |
| menu | 定时任务 | `ops:scheduled-job` | `/ops/scheduled-jobs` |
| action | 查看定时任务 | `ops:scheduled-job:list` | 任务、运行列表和详情 |
| action | 修改定时任务 | `ops:scheduled-job:update` | Cron、时区、启停 |
| action | 执行定时任务 | `ops:scheduled-job:execute` | 手动执行 |
| action | 取消定时任务 | `ops:scheduled-job:cancel` | 合作取消 |

菜单排序在操作日志之后。迁移使用固定 UUID，并沿用现有资源状态、父子结构和图标命名约定。

共享操作日志 action 目录新增：

- `ops:scheduled-job:update`
- `ops:scheduled-job:enable`
- `ops:scheduled-job:disable`
- `ops:scheduled-job:execute`
- `ops:scheduled-job:cancel`

这些动作的 `targetType` 都是 `scheduled-job`，`targetKey` 为 task key；取消操作可以把
`runId` 作为安全显示标签或由请求日志关联，但不增加任意 details。操作日志仍只描述管理员
HTTP 请求是否成功。

`scheduled`、`recovery` 和 handler 内部事件没有用户、session 或 request context，不写
操作日志。运行开始、成功、失败、跳过、中断和取消只进入 `ops_job_runs` 与 Pino。手动
运行记录独立保存触发人快照；取消记录保存首次取消人快照。

## 前端

新增文件路由 `apps/client/src/pages/index/ops/scheduled-jobs.vue`，页面标题“定时任务”。
不新增全局任务日志页。

### 任务表

表格展示：

- 任务名称和稳定 key。
- Cron 与时区。
- 启用状态和当前状态使用同一组状态标签；`running + cancelRequestedAt` 显示“取消中”。
- 下次执行时间按任务配置的 IANA 时区格式化；禁用时不重复展示下次执行文案。
- 最近终态使用与日志列表一致的状态标签，并展示结束时间。
- 按权限显示编辑、启停、立即执行、取消和查看日志。

操作列固定在表格右侧，并按实际四个文字操作使用紧凑固定宽度，不为操作区保留额外空白。

页面列表复用前端统一的查询缓存，初次进入、用户操作成功和聚焦运行到达终态后使列表失效并
重新查询。页面采用与系统配置注册表一致的关键词筛选区，可按任务 key、名称和说明在前端
筛选；输入仅在点击“查询”后生效，同时该操作使任务列表查询失效并重新拉取，以此承载显式
刷新能力，不另设刷新按钮。“重置”清除关键词并恢复完整列表，不额外发起请求。编辑和日志
drawer 按首次打开懒加载。页面不持续轮询全部任务，也不为八个固定任务增加分页。

### 编辑

编辑 drawer 或 modal 使用：

- 原始五段 Cron 输入。
- 可搜索 IANA 时区选择。
- 共享 Cron 工具生成的未来五次执行预览，显示明确日期、时间、时区和 offset。
- 标准五段字段及不支持扩展语法的简短说明。

编辑 drawer 使用与其它表单 drawer 一致的静态标题“编辑定时任务”，不把具体任务名拼接到
标题中；正文顶部只用一行弱化文字提示当前任务名称，不重复展示稳定 key 和说明。

保存前客户端校验只改善体验，服务端仍是安全边界。编辑界面明确提示：修改计划或禁用不会
影响当前运行；重新启用不会补跑禁用期间的计划。表单发生修改后关闭抽屉必须先确认是否放弃
未保存更改。保存请求使用前端统一的 mutation 状态管理，并忽略抽屉会话失效后的迟到结果。

### 手动执行与取消

立即执行先使用警告确认明确提示任务可能按业务保留规则删除数据。已知任务正在运行时页面不再
提供立即执行入口；服务端仍处理页面状态过期或并发请求造成的竞态。手动执行成功后显示已提交
状态，保存 `runId` 并直接打开该运行详情，每 2 秒查询该单条详情；到达任一终态立即停止。
`409 overlap` 显示当前已有运行、打开 `activeRunId` 详情并刷新任务行，不自动重试。

取消按钮只对当前 `running` 且拥有取消权限的用户显示。请求接受后显示“取消中”，继续轮询
同一运行直到终态，并不再提供重复取消入口；不承诺立即停止当前数据库或存储调用。每个任务的
命令 pending 状态独立维护；同一任务有命令未完成时禁用其它配置和命令入口，不阻塞其它任务。

### 日志抽屉

每行“查看日志”打开该任务的分页 drawer。列表展示状态、来源、计划时间、开始、结束、耗时
和计数；点击单条后在同一 drawer 内从列表切换到详情，并提供返回日志列表的入口。手动执行、
重叠和取消聚焦的运行直接打开详情视图，不先把详情追加到日志表下方。drawer 始终使用静态
标题“定时任务日志”，列表与详情切换时不改变标题；正文顶部只用一行弱化文字提示当前任务
名称。详情展示：

- run ID、task key、状态和触发来源。
- `scheduledFor`、创建、开始、取消请求、结束时间和耗时。
- executor ID。
- 删除、失败计数和安全错误分类、摘要；`interrupted` 的耗时显示为“未知”。
- 手动触发人和取消人快照；不适用时不展示空块。

打开到 `running` 详情时每 2 秒只轮询该 run。终态、切换记录、关闭 drawer 或离开路由时
取消 timer 和未完成查询。聚焦运行到达终态后刷新日志列表和任务列表，避免详情、日志行和
任务行显示不同状态。状态中文映射、状态标签类型和操作日志 action 中文标签集中放在 ops
feature labels，不在页面内重复散落。日志列表和详情使用与其它页面一致的查询缓存、查询 key、
loading/error 状态及请求 `AbortSignal`；页面只自行维护视图切换和运行中详情的轮询 timer。

## 错误、日志与安全

系统只在边界捕获错误：

- Scheduler 顶层负责记录到期查询和 dispatch 失败并重新唤醒。
- Runner 顶层负责把 handler 抛错映射为安全运行终态。
- 附件逐项循环负责隔离单个存储对象失败并继续统计。
- Routes 只映射明确的 `400`、`404` 和 `409` 领域错误，未知错误重新抛出。

Pino 事件至少包括：

- `scheduled job started`
- `scheduled job completed`
- `scheduled job failed`
- `scheduled job skipped`
- `scheduled job interrupted during startup recovery`
- `scheduled job cancellation requested`
- `scheduled job finalization failed`
- `scheduled job scheduler query failed`

所有事件包含可用的 `taskKey`、`runId`、`triggerSource` 和 `executorId`，使用基础进程
logger；后台运行不创建假的 request logger。原始 Error 只进入 Pino 的 `err` 字段并沿用已有
redaction。数据库运行记录绝不保存 raw Error、stack、SQL、连接参数、文件路径、storage key、
完整请求、响应或任意 JSON。

运行详情中的用户名、昵称和 UUID 是已批准的管理员审计快照。普通 `list` 权限可以读取任务
运行及这些快照，与现有操作日志查看权限模型保持一致。

## 验证策略

### 共享工具与契约

- 接受标准五段数字、英文月份/星期别名及 `* , - /`。
- 拒绝字段数量错误、秒/年、快捷表达式和不支持的扩展字符。
- 校验合法与非法 IANA 时区。
- 固定时钟验证未来五次计算、严格未来语义和至少一个夏令时跳跃/重复边界。
- 拒绝语法可解析但没有未来执行时刻的表达式。
- 验证请求和响应 strict schema、状态派生、计数、操作者与取消快照形状。

### 服务端

- 迁移为 registry 中每个任务产生且只产生一条种子；默认 Cron 语义合法、每项保持约六小时
  一次、相位互不冲突，并满足附件任务的既定先后关系。测试只断言这些性质，不快照或逐项断言
  具体小时、分钟；首次到期且以后不被启动覆盖，新增任务不重新平衡旧计划。
- 定时与手动同时认领同一任务时只有一个 `running`，另一条为
  `skipped / overlap`。
- 自动同时最多运行两个；其他已到期任务保持到期而不是跳过。
- 长任务跨过下一个 Cron 时刻时记录定时 overlap，并继续不重叠。
- 长任务先产生定时 overlap、随后进程中断时，较新的 `skipped` 不遮蔽原执行，重启后仍安排
  恢复。
- 多个错过时刻只运行一次，`next_run_at` 推进到当前时间之后。
- 修改计划、禁用、启用和运行中编辑符合固定语义。
- 手动执行禁用任务成功，正常触发返回 `202`，冲突返回 `409`。
- 启动把旧 `running` 变为 `interrupted`，以启动时刻作为中断确认时间、保持耗时为空并清除
  占用；未请求取消的任务只安排一次恢复，带取消请求的中断运行保留取消快照且不恢复；恢复
  受两个槽限制。
- 崩溃前计划已推进的任务仍通过最新 `interrupted` 获得恢复。
- 取消请求只保留首个操作者，signal 在批次/项目边界生效；数据库占用在 handler 退出且终态
  收尾成功后才释放。
- 取消与正常收尾竞争由事务顺序得到唯一终态。
- handler 结束后的终态事务失败时不重跑 handler；runner 在当前调用中保留安全结果，每 60 秒
  幂等重试，成功后任务无需重启即可继续调度，关闭时停止等待并交给下次启动恢复。
- 部分附件失败保留成功计数并产生 `failure`；未引用文件失败可由孤立存储清理再次发现。
- 任务日志清理只删除超过保留期的终态，不删除当前运行或自身活动记录。
- 数据库非法 Cron、registry/计划集合不一致和悬空活动记录使启动失败，不自动修复。
- 各 endpoint 权限、`400/404/409`、响应 schema 和操作日志 action 正确。
- 运行记录与 Pino 安全边界测试确认敏感原始内容不会进入 API 或数据库。

以 PGlite 完成主要 repository、service 和 route 集成测试；不为不存在的多实例拓扑添加并发
集成设施。

### 前端

- 无 `list` 权限时菜单/页面不可访问；按钮按 `update`、`execute`、`cancel` 独立控制。
- Cron 错误、时区错误和未来五次预览可见。
- 修改计划后关闭编辑抽屉会触发未保存更改确认。
- 启停、保存、手动执行、overlap 和取消反馈正确。
- 关键词查询按任务 key、名称和说明筛选，并同时刷新任务列表；重置只恢复完整列表。
- 表格同时区分当前运行和最近终态。
- 每任务日志分页、详情字段和状态标签正确。
- 单运行轮询以 2 秒为周期，并在终态、关闭、切换和卸载时停止。
- 页面不存在全局日志入口或后台持续全表轮询。

完成定向测试后运行 `pnpm check`。

## 实施边界与顺序

实施按以下依赖顺序推进：

1. 共享 Cron 工具、contracts 和相应测试。
2. 数据表、迁移、固定资源和初始任务记录。
3. Registry、repository、runner、scheduler 及启动/关闭接线。
4. 八个 handler 迁移、AbortSignal 和结构化计数。
5. 运维 service、routes、权限与操作日志 action。
6. 定时任务页面、编辑体验和每任务日志 drawer。
7. 定向回归、敏感信息检查、README 或环境变量文档更新，以及完整验证。

旧 maintenance worker 与新 Scheduler 不能同时启动。切换提交必须删除旧入口接线和 interval
配置后再启用新运行时，避免同一清理逻辑重复执行。

## 验收标准

满足以下条件才视为验收通过：

1. 数据库存在八个固定任务，管理员不能通过 API 创建、删除或改变 handler。
2. 初始 Cron 使用显式默认相位错峰；新增任务不重新平衡旧计划。重启保留 Cron、时区、启用
   状态和 `next_run_at`，且不会无条件重跑所有任务。
3. 正常定时、手动和启动恢复均产生完整运行记录，同一任务不会重叠。
4. 自动与恢复任务最多两个同时执行，容量等待不被误记为跳过。
5. 停机错过多个 Cron 时刻只合并执行一次；禁用期间不补跑。
6. 手动执行立即返回 `202`；冲突返回 `409` 并留下 `skipped / overlap`。
7. 合作取消可以在安全边界结束任务，终态和操作者快照正确，handler 退出且终态收尾成功前不
   释放占用。
8. 进程中断的运行在下次启动标记为 `interrupted`；未请求取消的运行获得一次恢复尝试，已
   请求取消的运行保留取消快照但不恢复。
9. 运行记录只含允许字段和安全摘要，原始错误及敏感诊断信息不进入数据库或 API。
10. 三个附件清理任务独立记录；文件删除失败可由孤立存储清理自然重试，无新增补偿表。
11. 五个旧 interval 环境变量和旧 worker 已移除，业务保留期配置继续生效。
12. 页面可以配置、启停、执行、取消和查看每任务历史，且只轮询用户正在关注的单个运行。
13. 配置命令写操作日志，后台执行过程不写操作日志或伪造请求上下文。
14. 定向测试和 `pnpm check` 全部通过。

## 方案取舍依据

选择持久化计划行和短事务占用，而不是：

- **PostgreSQL advisory lock**：会话级锁要在整个 handler 生命周期占用同一连接；事务级锁会
  保持长事务。计划、取消和运行历史仍需额外表状态，也不适合当前 PGlite/`Db` 抽象。官方
  语义见 [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)。
- **Croner 内存 callback**：初始代码较少，但重启、错过执行、配置变更、手动冲突和恢复仍要
  另建持久化状态，形成两个事实源。Croner 在本设计中只负责解析和下一时刻计算，参考
  [Croner documentation](https://github.com/Hexagon/croner)。
- **运行时租约与心跳**：它用于旧执行器可能仍存活时的跨实例接管。当前单进程不存在这一
  条件；加入租约会引入续租频率、过期阈值和误过期重叠风险。
- **硬取消**：JavaScript 同进程无法安全强杀任意异步 handler；为此引入子进程会显著扩大
  部署和通信边界。当前清理任务适合 AbortSignal 合作取消。

如果以后引入真正的多实例或独立 worker，应新建后续设计，重新评估 lease、heartbeat、
fencing token、全局自动容量和滚动发布语义，而不是修改本 spec 的单进程假设。
