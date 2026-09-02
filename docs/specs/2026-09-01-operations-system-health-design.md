---
status: implemented
date: 2026-09-01
---

# 运维管理系统健康设计

## 背景

运维管理前四个切片已经完成请求上下文、登录日志与稳定会话、操作日志框架，以及数据库持久化的定时任务与任务日志。当前服务端只有一个静态 `GET /api/health`：只要请求能够进入路由，就固定返回 `status: ok`。它没有区分进程存活与依赖就绪，也不能帮助管理员判断数据库、附件存储或调度器是否处于可工作状态。

定时任务切片已经建立可复用的共享事实：任务计划、当前运行、完成状态、安全错误分类、耗时和默认保留 90 天的运行记录；实际保留期由既有 `OPS_JOB_RUN_RETENTION_MS` 配置控制。附件模块也已经通过 `AttachmentStorage` 隔离存储实现。因此系统健康不需要新建指标平台，可以在请求时组合当前实例状态、依赖主动探测、调度器内存状态和已有任务记录，为公共部署探针与权限保护的管理页面提供两个不同安全边界。

当前部署仍是单个 Node Server，调度器和 runner 内嵌同一进程。系统没有实例注册、心跳或集群成员表。本设计必须明确区分当前响应实例的内存状态与共享数据库中的调度事实，不能把二者包装成尚不存在的集群视图。

## 目标

- 使用明确路径提供互不混淆的公共 liveness 与 readiness 探针。
- liveness 只证明进程与 HTTP 栈可响应；readiness 只把数据库作为流量就绪硬门槛。
- 提供权限保护的系统健康快照，展示当前实例、数据库、附件存储、调度器运行态和共享积压。
- 复用 `ops_job_runs` 提供 7 日与 30 日任务运行统计和最近异常记录。
- 使用真实、轻量且可清理的附件存储读写探测，而不是只检查配置。
- 页面可见时每 10 秒刷新快照，并在浏览器内展示最近 10 分钟的短时趋势。
- 页面可见时每 60 秒刷新任务统计和最近异常，进入页面、恢复可见及手动刷新时立即更新。
- 使用 Vue ECharts 展示任务状态、失败分类、耗时排行和短时依赖趋势。
- 保持 HTTP 响应和数据库中不出现连接信息、存储路径、原始错误或其他敏感诊断数据；进程 Pino 只在固定 `err` 字段保留内部诊断错误，并沿用现有 redaction。

## 非目标

- API 请求量、响应时间、错误率或路由级指标。
- 跨页面刷新或服务重启保留的 CPU、内存、数据库延迟和存储延迟历史。
- 指标时间序列表、指标采样 worker、保留策略、阈值配置或告警规则。
- 集群实例清单、实例心跳、leader 选举或多实例调度语义。
- hostname、PID、环境变量、数据库连接地址、附件存储目录或 executor ID 展示。
- 把附件存储或调度器异常纳入公共 readiness 硬门槛。
- 为健康接口增加手动修复、重启、清理、取消任务或其他写操作。
- 跨模块关联入口的权限体验专项治理；关联任务日志沿用现有抽屉与接口权限。
- 保留旧 `GET /api/health` 兼容入口。
- 外部 Prometheus、OpenTelemetry、APM、日志平台或基础设施面板集成。

## 术语与语义

- **Liveness**：当前 Node 进程与 HTTP 路由栈能够形成响应。不检查业务依赖。
- **Readiness**：当前实例能够承接依赖数据库的正常业务流量。只有数据库是首版硬门槛。
- **当前实例**：实际处理本次管理端请求的 Node 进程，不代表其他实例。
- **共享状态**：来自数据库的任务计划与运行事实；在当前单实例部署下也仍按共享事实命名。
- **明显积压**：启用任务的 `next_run_at` 已早于观察时刻超过 60 秒。
- **短时趋势**：页面可见期间由浏览器保存的当前实例最近 10 分钟快照，不是服务端历史指标。
- **任务统计**：直接聚合当前留存的 `ops_job_runs`，已清理记录不计入，不另建健康指标记录。

## 决策摘要

| 主题 | 决策 |
| --- | --- |
| 公共路径 | 只提供 `/api/health/live` 与 `/api/health/ready` |
| 旧路径 | 删除 `/api/health`，不保留兼容别名 |
| Liveness | 不访问数据库、存储或调度器 |
| Readiness | 只执行数据库轻量查询；失败返回 `503` |
| 管理接口 | 快照与任务统计分成两个 GET，避免高频重复聚合历史 |
| 实例语义 | 当前响应实例 + 数据库共享调度事实，不提供集群视图 |
| 整体状态 | `healthy`、`degraded`、`unhealthy` |
| 历史失败 | 只展示，不参与整体状态 |
| 存储探测 | 适配器内轻量读写清理，结果缓存 30 秒并合并并发请求 |
| 调度诊断 | 只读内存快照，不暴露 scheduler、timer、run 集合或 executor ID |
| 明显积压 | 超过计划时刻 60 秒 |
| 任务窗口 | 7 个上海自然日 + 最近 30 天固定统计 |
| 统计覆盖 | 按当前留存日志计算，已清理记录不计入；沿用既有保留配置，不承诺窗口内历史完整 |
| 页面刷新 | 可见时快照每 10 秒、任务统计与最近异常每 60 秒；进入页面、恢复可见及手动刷新时立即更新两者；隐藏或卸载后停止 |
| 短时历史 | 浏览器最多 61 点，页面刷新、卸载或响应实例的 `startedAt` 变化后清空 |
| 图表 | `vue-echarts` + ECharts 按需模块 |
| 权限 | `ops:system-health:list` |
| 关联任务日志 | 沿用现有抽屉和 `ops:scheduled-job:list` 接口权限，本次不专项调整关联入口的权限体验 |
| 持久化 | 不新增健康或指标表，只新增权限资源 migration |

## 架构与组件边界

### 公共探针

`apps/server/src/modules/health` 继续承载公共探针，但由静态单路由改为显式的 live 与 ready 路由。liveness 直接形成常量响应；readiness 只依赖一个窄数据库探针函数，不依赖管理端 contracts、附件存储、调度器或 ops 模块。

公共探针仍经过现有全局请求上下文和请求日志中间件，因此响应保留 `X-Request-Id`，但它们不创建认证上下文，也不登记操作日志。

### 附件存储实例与探针

当前附件 service 在内部读取配置并创建 storage，而进程入口又为定时任务创建另一个 storage 对象。为了让业务、维护任务和诊断指向同一个实际适配器实例，进程入口调整为只创建一次 `AttachmentStorage`，再显式注入：

- 附件 routes/service。
- 定时任务 definitions。
- 系统健康 storage probe。

`AttachmentStorage` 增加适配器级 `probe()`。它不接受业务 storage key，也不通过普通附件 `put/get/delete` 组合伪造健康对象。当前 `LocalAttachmentStorage` 在自身 root 内部创建唯一临时文件，写入固定小字节串，读回并校验，然后删除。临时文件不进入 `uploads` 或任何附件业务前缀。

写入、读取、校验或删除任一步失败都表示探测失败。清理放在适配器边界的 `finally` 中尽力执行；原始错误只交给进程日志，不进入 HTTP 响应。未来新增其他 provider 时必须实现与自身语义等价的轻量可清理探测。

系统健康模块在 storage 外增加缓存协调器：

- 成功与失败结果都从完成时刻起缓存 30 秒。
- 同一时刻只允许一个实际探测；并发调用共享进行中的 Promise。
- 返回 provider、状态、探测耗时、`checkedAt` 和是否复用已完成缓存。
- 30 秒为代码常量，不新增环境变量或系统配置。

### 调度器诊断源

`startScheduledJobs()` 在现有 `service` 与 `stop()` 之外返回只读 `diagnostics`。诊断源通过函数复制当前安全状态，不把可变集合或 scheduler 实例暴露给健康模块。

Scheduler 只额外维护已有生命周期自然产生的字段：

- `runtimeStatus`：`running` 或 `stopped`；首次 `start()` 前为 `stopped`，启动时变为 `running`，`stop()` 开始时变为 `stopped`。
- 固定自动容量与当前自动槽占用数。
- 正在进行数据库认领的手动启动数。
- 尚待恢复认领的队列长度。
- 当前是否处于查询失败后的退避状态。
- 已设置 timer 对应的下一唤醒时间；没有 timer 时为 `null`。
- 最近一次 poll 完成时间与 `success` / `failure` 结果；尚未完成首轮时均为 `null`。

诊断源不暴露 timer、Promise、AbortController、任务 run ID 集合、executor ID 或原始 Error。记录这些字段不新增 timer，也不改变认领、容量、恢复、取消或关闭语义。

`startScheduledJobs()` 同时向系统健康 service 提供只读任务目录快照，只包含 task key 与中文名称，用于把统计结果映射为可展示名称。它不把 handler 或完整 definition 暴露给健康模块。

### 系统健康 repository

`apps/server/src/modules/ops/system-health/repository.ts` 只负责读取数据库事实：

- 管理端数据库探测与耗时。
- 当前 `running` 记录数量。
- 明显积压数量与最早积压时间。
- 7 日每日状态计数。
- 30 日状态分布和失败分类。
- 30 日成功运行平均耗时 Top 5。
- 最近 5 条失败或中断记录。

repository 不读取进程状态、storage 或 scheduler 内存，也不映射中文任务名称。

### 系统健康 service

`apps/server/src/modules/ops/system-health/service.ts` 负责唯一的管理端聚合边界：

1. 捕获一个 `observedAt`，同步读取实例、内存和 scheduler 只读快照。
2. 并行收集数据库诊断与共享状态、缓存后的 storage 探测。
3. 在该系统边界使用 `Promise.allSettled` 隔离数据库与 storage 的预期探测失败。
4. 把失败映射为固定 issue 枚举和 nullable 字段，不返回错误文本。
5. 按固定优先级计算整体状态。
6. routes 使用共享 strict schema 验证最终响应。

任务统计是独立 service 方法。该方法的数据库错误不是可用的部分统计，继续抛出并由根错误处理返回 `500`；它不影响快照接口已经确认的部分失败语义。

Scheduler 的停止和查询退避属于诊断数据中的运行状态；诊断函数本身抛错、实例读取错误和 contracts 不变量错误属于未知错误，继续交给根错误处理，不转换为依赖降级。`Promise.allSettled` 只隔离已返回的依赖失败，不提供查询或文件 I/O 的响应时限；尚未结束的探测仍需等待底层操作完成，沿用下述不制造伪超时的约定。

## 公共探针 API

### `GET /api/health/live`

始终在路由能够执行时返回：

```json
{
  "service": "rev30-server",
  "status": "alive"
}
```

HTTP 状态为 `200`。该 handler 不访问数据库、storage、scheduler、文件系统或进程外依赖。

### `GET /api/health/ready`

通过 Drizzle 公共 `Db` 执行等价于 `SELECT 1` 的轻量查询。成功返回 `200`：

```json
{
  "service": "rev30-server",
  "status": "ready"
}
```

查询抛错时在 readiness 路由边界捕获并返回 `503`：

```json
{
  "service": "rev30-server",
  "status": "not_ready"
}
```

公共响应不包含观察时间、延迟、失败类型或错误信息。两个探针都设置 `Cache-Control: no-store`。

公共 `Db` 抽象没有跨 Postgres.js 与 PGlite 的统一查询取消接口，本设计不使用 `Promise.race` 制造仍在后台运行的伪超时。部署探针客户端负责设置请求超时；数据库客户端自身连接失败继续按现有配置传播。

旧 `GET /api/health` 被删除。仓库中没有部署配置或业务客户端依赖该路径；对应 app 测试、 health 测试和 README 一并迁移到显式新路径。

## 管理端共享契约

共享 schema 放在 `packages/contracts/src/ops/system-health.ts`，并经 ops 与包根入口导出。所有对象使用 strict schema；类型通过 `z.infer` 推导。

### 状态与 issue

```ts
type SystemHealthStatus = 'healthy' | 'degraded' | 'unhealthy'

type SystemHealthIssue =
  | 'database_unavailable'
  | 'storage_unavailable'
  | 'scheduler_stopped'
  | 'scheduler_query_retry'
  | 'scheduler_overdue'
```

`issues` 去重并按上面固定顺序返回，使前端不需要依赖异步探测完成顺序。

### `GET /api/ops/system-health`

接口要求 `ops:system-health:list`，响应结构为：

```ts
type SystemHealthSnapshot = {
  observedAt: string
  status: SystemHealthStatus
  issues: SystemHealthIssue[]
  instance: {
    startedAt: string
    uptimeSeconds: number
    nodeVersion: string
    platform: string
    arch: string
    memory: {
      rssBytes: number
      heapUsedBytes: number
      heapTotalBytes: number
      externalBytes: number
    }
  }
  database: {
    status: 'healthy' | 'unavailable'
    latencyMs: number | null
    checkedAt: string
  }
  storage: {
    status: 'healthy' | 'unavailable'
    provider: string
    latencyMs: number | null
    checkedAt: string
    cached: boolean
  }
  scheduler: {
    runtimeStatus: 'running' | 'stopped'
    automaticCapacity: number
    automaticRunning: number
    manualStarting: number
    recoveryQueued: number
    retryPending: boolean
    nextWakeAt: string | null
    lastPollAt: string | null
    lastPollStatus: 'success' | 'failure' | null
    shared: {
      runningCount: number | null
      overdueCount: number | null
      oldestOverdueAt: string | null
    }
  }
}
```

所有计数、秒数、毫秒和字节值必须为非负安全整数。字符串时间使用 ISO datetime。进程内存使用 `process.memoryUsage()`；`startedAt` 在系统健康 service 创建时根据当时墙钟与 `process.uptime()` 固定计算，后续不随墙钟调整重新推导。`uptimeSeconds` 使用当前 `process.uptime()` 向下取整。

数据库诊断与共享调度查询作为同一数据库结果处理：任一步失败时，数据库状态为 `unavailable`、延迟为 `null`，共享计数与时间全部为 `null`，并产生 `database_unavailable`。该接口仍返回 `200`，让调用方读取其他已成功的实例与 storage 状态。 `database.latencyMs` 只记录该结果内部显式轻量探针查询的耗时；共享调度查询失败时即使探针已经成功，也按上述原子失败规则丢弃该延迟。

受保护接口仍先经过稳定会话认证。数据库长期不可用时，认证中间件可能在健康 service 之前失败；公共 readiness 是此场景的权威部署信号。本设计不为了管理诊断绕过会话撤销和用户状态校验。

### `GET /api/ops/system-health/job-statistics`

接口同样要求 `ops:system-health:list`，无 query 参数，返回固定窗口：

```ts
type SystemHealthJobStatistics = {
  generatedAt: string
  timezone: 'Asia/Shanghai'
  dailyRuns: Array<{
    date: string
    running: number
    success: number
    failure: number
    skipped: number
    cancelled: number
    interrupted: number
  }>
  statusDistribution: {
    running: number
    success: number
    failure: number
    skipped: number
    cancelled: number
    interrupted: number
  }
  failureCategories: Array<{
    category: 'partial_failure' | 'database' | 'storage' | 'internal'
    count: number
  }>
  averageDurations: Array<{
    taskKey: ScheduledJobTaskKey
    taskName: string
    averageDurationMs: number
    runCount: number
  }>
  recentAnomalies: Array<
    {
      taskKey: ScheduledJobTaskKey
      taskName: string
      runId: string
      finishedAt: string
    } &
      (
        | {
            status: 'failure'
            errorCategory: 'partial_failure' | 'database' | 'storage' | 'internal'
            errorSummary: string
          }
        | {
            status: 'interrupted'
            errorCategory: null
            errorSummary: null
          }
      )
  >
}
```

`generatedAt` 是一次统计请求唯一的观察时刻。`date` 使用 `YYYY-MM-DD`；最近 7 天固定包含 `generatedAt` 所在上海自然日与之前 6 天，即使某天没有记录也返回该日期的零值桶。30 日统计从 `generatedAt` 所在上海自然日之前第 29 天的 `00:00:00` 开始，到 `generatedAt` 之前，使用左闭右开的时间范围。每日和 30 日窗口都按 `created_at` 判断运行归属，使所有状态包含同一时间基准；日期分桶显式转换为 `Asia/Shanghai`，不依赖数据库会话时区。最近异常按 `finished_at DESC, id DESC` 排序。

30 日状态分布固定包含全部六种状态及零值。失败分类只统计 `status = failure`，并按 `partial_failure`、`database`、`storage`、`internal` 固定顺序返回全部四项及零值。平均耗时只统计 `status = success` 且 `duration_ms` 非空的记录，数据库聚合结果使用 `Math.round` 转换为非负安全整数，再按平均耗时降序、task key 升序取前 5 个并返回样本数。最近异常只包含 `failure` 与 `interrupted`；取消和重叠跳过不视为异常。

7 日、30 日及最近异常都仅查询当前留存日志，沿用既有日志保留配置和清理任务。90 天是默认保留期，不是本接口保证的历史覆盖范围；保留期调整及已执行的清理都可能使统计窗口内的数据不完整。零值仅表示对应窗口或日期没有符合条件的留存记录，不能据此断言过去没有任务运行；接口不重建已清理记录，也不推断历史覆盖率。

最近异常不受 30 日聚合窗口限制，而是在当前留存记录中取最近 5 条，不另加固定 90 天筛选。两个 task key 字段复用已有 `ScheduledJobTaskKey` schema，`runId` 继续使用 UUID schema。failure 必须同时具有安全错误分类和非空安全摘要，interrupted 的两者必须同时为 `null`。

任务名称由 service 使用启动时固定任务目录映射。数据库出现未知 task key 已违反定时任务初始化不变量，统计请求抛出未知错误，不以 task key 兜底为名称。

两个管理接口均设置 `Cache-Control: no-store`，且不登记操作日志。

## 状态判定

整体状态只表达当前可运行性，不表达历史服务等级或过去 24 小时是否出现失败。

判定顺序固定为：

1. 数据库不可用：`unhealthy`。
2. 数据库正常，但 storage 不可用：`degraded`。
3. Scheduler 已停止：`degraded`。
4. Scheduler 正在查询退避或最近 poll 失败：`degraded`。
5. 数据库共享状态存在至少一个明显积压：`degraded`。
6. 其他情况：`healthy`。

对应 issue 可以同时存在。数据库不可用时无法判断共享积压，不额外产生 `scheduler_overdue`。`nextWakeAt = null`、首轮 poll 尚未完成、存在运行中任务或自动槽已满都不单独构成降级。

历史任务 failure、interrupted、cancelled 或 skipped 只进入统计和最近异常，不改变整体状态。内存值没有经过项目验证的可靠阈值，也不参与状态判定。

## 共享调度状态

健康 repository 使用当前 `observedAt` 计算：

- `runningCount`：`ops_job_runs.status = running` 的记录数。
- `overdueCount`：启用、`next_run_at` 非空且 `next_run_at < observedAt - 60 seconds` 的计划数。
- `oldestOverdueAt`：上述计划中最早 `next_run_at`；没有明显积压时为 `null`。

60 秒是固定容忍窗口，与当前 Scheduler 查询失败后的 60 秒重试量级一致；不新增可配置阈值。因自动槽被正常长任务占满而产生超过窗口的积压仍标记降级，因为它代表当前任务吞吐已经落后于计划，而不是 scheduler 错误。

## 权限资源与迁移

新增 migration，只向 `system_resources` 写入：

| ID | 父资源 | 类型 | 名称 | Code | Path | Icon | 排序 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `10000000-0000-4000-8000-000000000327` | `ops` | menu | 系统健康 | `ops:system-health` | `/ops/system-health` | `lucide:heart-pulse` | 50 |
| `10000000-0000-4000-8000-000000000328` | 系统健康 | action | 查看系统健康 | `ops:system-health:list` | `null` | `null` | 10 |

两个资源启用，不写入 `system_role_resources`。管理员继续通过现有运行时语义获得全部启用资源；普通角色必须显式授权。菜单显示和页面访问沿用现有菜单资源授权，两个管理接口要求 `ops:system-health:list`。系统健康只有读取能力，不拆分图表、依赖或刷新权限。

`ops:system-health:list` 授权两个系统健康接口及其统计、异常摘要；关联任务日志继续复用现有 `ScheduledJobRunLogDrawer` 和原请求路径，日志接口仍要求 `ops:scheduled-job:list`。仅有系统健康权限的用户打开关联日志时可能收到 `403`，由现有抽屉错误状态呈现。本次接受这一权限组合下的已知限制，不为该入口新增组合权限处理，也不调整或扩大现有日志接口的授权范围。

## 前端页面

### 路由与职责

新增 `apps/client/src/pages/index/ops/system-health.vue`。页面负责：

- 请求快照与任务统计。
- 管理页面可见性、快照的 10 秒自动刷新及任务统计的 60 秒自动刷新。
- 保存最多 61 个短时快照点。
- 手动刷新两个查询。
- 打开现有 `ScheduledJobRunLogDrawer` 查看最近异常运行。

状态总览、任务统计图组和实时趋势图拆成纯展示组件。展示组件只接收共享 contract 数据或页面已经整理的图表数据，不自行发 API 请求或维护轮询 timer。

### 页面布局

页面布局如下：

1. 顶部整体状态、快照时间 `observedAt` 与手动刷新按钮。
2. 六个摘要卡：实例运行时间、RSS/Heap、数据库延迟、storage、运行中任务和明显积压。
3. 数据库、附件存储和 scheduler 三个依赖诊断卡。
4. 7 日任务运行结果堆叠柱状图。
5. 30 日状态分布环图。
6. 30 日失败分类环图。
7. 成功任务平均耗时 Top 5 横向柱状图。
8. 最近 10 分钟 RSS、数据库延迟和 storage 延迟折线图。
9. 最近 5 条异常任务列表；点击行打开对应任务运行日志抽屉。

字节复用现有 `bytes` 格式化能力，耗时明确标注单位，快照、探测及统计时间显示到秒。`nodeVersion`、platform 和 arch 放在实例详情区域，不占用顶部主指标卡。

任务统计与最近异常区域单独展示统计时间 `generatedAt`，避免把顶部快照时间误认为所有区域的数据时间；同时固定展示“按当前留存日志统计，已清理记录不计入统计”，不把固定查询窗口描述为完整历史覆盖。

### Vue ECharts

`apps/client` 增加直接依赖 `vue-echarts` 与 `echarts`。图表组件使用 `VChart`，并通过 `echarts/core` 只注册：

- Bar、Line、Pie charts。
- Grid、Tooltip、Legend、Dataset 等实际使用组件。
- Canvas renderer。

不导入 ECharts 全量入口。图表读取现有明暗主题状态，使用项目主题色和 Naive UI 容器；通过 ResizeObserver 或 Vue ECharts 的 autoresize 能力适配布局变化。实现阶段查询第三方 API 时按项目约定优先使用 Context7，再以 Vue ECharts / ECharts 官方文档补充。

每张图都有可见标题、图例、数值摘要和无数据状态，不把 canvas 作为唯一信息来源。ECharts ARIA 能力在实际图表 option 中开启。

### 刷新与短时样本

快照与任务统计查询沿用 Pinia Colada `autoRefetch`，并结合 document visibility：

- 页面可见时快照每 10 秒刷新，任务统计（包含最近异常）每 60 秒刷新。
- 进入页面时立即请求两个查询；页面隐藏或组件卸载后停止两者的自动刷新，再次可见时立即刷新两者并恢复各自周期。
- 同一个 query 不并发执行重叠刷新；两个查询独立执行与展示，任一查询失败不阻塞另一个查询的刷新。
- 手动刷新同时失效快照与任务统计 query。

页面只在获得新的成功快照后更新短时点，按 `observedAt` 去重。以当前实例的首个样本时间为起点划分固定 10 秒时间槽，同一槽内用较新快照替换该槽样本，替换不移动时间槽起点；手动刷新因此不会不断后移槽边界或挤占趋势窗口。每次更新删除早于最新点 10 分钟的数据，并硬性限制为最多 61 点。RSS 和数据库延迟每个新时间槽各产生一个点；数据库不可用时延迟为 `null`，图表显示断点。storage 只有 `checkedAt` 与上一个样本不同时才追加，因此缓存期间不伪造重复探测点；storage 不可用时延迟同样为 `null`，序列单独按相同 10 分钟窗口裁剪。

页面隐藏或请求失败造成的未采样区间不补零、不插值，趋势不跨已知采样空档连接。短时数组不写 Pinia 持久 store、localStorage、sessionStorage 或 URL，页面刷新或卸载即清空；若后续成功快照的 `instance.startedAt` 变化，也清空全部短时序列并以新实例首个样本重新开始，避免混合服务重启前后的数据。任务统计仍独立读取共享留存日志。

### 前端错误状态

- 首次快照失败且没有成功数据：显示页面级错误，不渲染零值或伪正常状态。
- 已有快照后的刷新失败：保留最后成功数据，显示“刷新失败，数据截至 …”，下个周期继续尝试。
- 任务统计首次失败且没有成功数据：在任务统计与最近异常区域显示错误，不渲染零值或“当前留存日志中无异常任务”；实例与依赖诊断仍可使用。
- 已有任务统计后的刷新失败：保留最后成功的统计和最近异常，显示“统计刷新失败，数据截至 …”（使用最后成功的 `generatedAt`），下个 60 秒周期继续尝试。
- 成功快照中的 `degraded` / `unhealthy` 使用状态卡和 issue 标签表达，不重复弹 toast。
- 任务统计为空时图表显示明确空状态，最近异常列表为空时显示“当前留存日志中无异常任务”。

## 错误、日志与安全

系统只在边界捕获预期探测失败：

- readiness 捕获数据库查询错误并映射 `503`。
- storage probe 捕获适配器错误并映射安全状态。
- 管理快照 service 使用 `Promise.allSettled` 聚合部分依赖失败。
- 任务统计、contracts 不变量和其他未知错误继续抛给根 error handler。

日志策略：

- readiness 失败由现有请求日志记录最终 `503`，不再重复写一条组件日志。
- 管理端数据库或 storage 实际探测失败时，进程 logger 写 `system health probe failed`，只显式加入 `component` 和 `err`。
- storage 缓存命中不重复记录失败；同一持续失败最多约每 30 秒执行和记录一次实际探测。
- Scheduler 自身查询失败继续使用现有 `scheduled job scheduler query failed`，健康 service 不重复记录。
- 任务统计未知错误由现有请求失败日志记录，不额外输出查询输入或 SQL。

HTTP 响应和数据库都不得出现：

- 环境变量或配置对象。
- 数据库 URL、主机、端口、SQL 或参数。
- storage root、临时文件名、storage key 或文件内容。
- hostname、PID、executor ID、timer 或 run ID 集合。
- 原始 Error、stack 或第三方错误文本。

Pino 是唯一允许保留原始 Error 的边界。新增健康日志只显式附加 `component` 和标准 `err` 字段并沿用现有 redaction；不另行附加配置对象、storage root、临时文件名、storage key、文件内容、SQL 或查询参数。

受保护响应中的单个 task key、run ID、安全错误分类和已限制的错误摘要沿用定时任务日志既有权限边界。

## 生命周期与关闭

服务端系统健康模块不增加后台 sampler 或独立 timer。实例开始时间在 service 装配时固定；storage 缓存只由管理端请求驱动。

关闭顺序保持现有设计：停止接收 HTTP 与停止 scheduled jobs 并行，随后停止操作日志运行时并关闭数据库。HTTP 停止接收后不再接受新请求，但已进入处理链的管理请求仍可能观察到关闭中的 scheduler；diagnostics 在 `stop()` 开始时把 runtime 标记为 stopped。storage cache 不需要显式关闭。

服务启动仍先创建数据库、storage、scheduled jobs 和系统健康 service，再创建 Hono app 并监听端口。scheduled jobs 初始化失败继续阻止 server 启动；storage probe 失败不阻止启动，也不影响 readiness，首次管理快照会显示 degraded。

## 数据迁移与兼容性

- 新增权限资源 migration，不新增业务表或列。
- 删除 `/api/health` 是明确的开发期不兼容变更，不提供重定向或别名。
- `createAttachmentService` / routes 改为接收进程入口创建的 storage；附件外部 API 不变。
- `startScheduledJobs()` 扩充返回值，但既有任务 API、数据库记录和调度语义不变。
- 任务统计直接读取当前留存记录，保留期沿用 `OPS_JOB_RUN_RETENTION_MS`（默认 90 天）；没有符合条件的留存数据时返回完整零值桶和空排行，不调整清理配置或规则。
- `README.md` 更新探针路径、管理页、权限、实例语义、短时趋势非持久化边界和统计仅覆盖留存日志的口径。

## 测试策略

### Contracts

- 快照、状态、issue、nullable 依赖字段和任务统计均通过 strict schema。
- 非安全整数、负字节、负耗时、未知 issue、未知状态和额外字段被拒绝。
- recent anomalies 的状态、错误分类与 nullable 摘要组合正确。

### 公共探针

- liveness 返回精确最小响应、`200` 和 `Cache-Control: no-store`，且不调用数据库探针。
- readiness 查询成功返回 `200 / ready`。
- readiness 查询失败返回 `503 / not_ready`，不泄漏错误内容。
- 旧 `/api/health` 返回 `404`。
- app 级请求仍带 `X-Request-Id`。

### Attachment storage probe

- Local provider 能创建 root、写入、读回校验并删除临时文件。
- 写、读、校验和删除失败都形成失败结果，HTTP 不暴露文件路径。
- 成功和失败结果缓存 30 秒。
- 并发调用只执行一次实际 probe。
- TTL 到期后执行新 probe；缓存时间与探测耗时使用可控时钟测试。

### Scheduler diagnostics

- start 前后和 stop 后的 runtime 状态。
- 自动槽占用与释放、手动认领进行数和恢复队列数。
- 普通唤醒、超长 timer、无计划和清除 timer 时的 `nextWakeAt`。
- poll 成功、失败、退避和恢复后的最近状态。
- diagnostics 返回副本且不暴露可变集合、run ID 或 executor ID。

### Repository 与 service

- 数据库、storage 探测失败及 scheduler 停止、查询退避时的 issue 与整体状态；诊断读取本身抛出的未知错误继续传播。
- 多个 issue 的固定顺序和去重。
- 60 秒边界前不算明显积压，超过边界后计入；最早积压时间正确。
- 数据库失败时共享调度字段为 `null`，其他实例字段仍保留。
- 内存与历史任务失败不改变整体状态。
- 空历史返回 7 个零值日期桶和完整零值状态分布。
- 上海自然日边界、30 日窗口、全部状态、失败分类、Top 5 排序与样本数。
- 已清理记录不计入统计；剩余记录仍按原定 7 日与 30 日窗口聚合，无留存记录的日期补零。
- 最近异常只含 failure / interrupted，并按完成时间与 ID 稳定排序。
- 未知 task key 触发不变量错误，不生成兜底名称。

### 管理 API 与权限迁移

- 未登录、无 `list` 权限和有权限用户的 `401`、`403`、`200`。
- 快照与统计响应都经过共享 schema 且设置 `no-store`。
- 两个 GET 不登记操作日志。
- migration 创建正确菜单与 action，排序为 50，不建立普通角色授权。
- 管理员访问聚合包含系统健康菜单与 code。

### 前端

- API helper 使用共享 schema 解析快照和统计。
- 首次加载、部分诊断异常、后续刷新失败和统计区独立失败；已有统计刷新失败时保留最后成功数据并标明统计时间。
- document 可见性控制两个查询的 auto-refetch；快照每 10 秒、统计每 60 秒，进入页面、恢复可见及手动刷新时立即刷新两者，同一查询不重叠执行。
- 短时点按 observedAt 去重、合并固定 10 秒时间槽、裁剪 10 分钟窗口并限制为 61 个；同槽替换不移动槽起点。
- storage 按 checkedAt 去重，数据库和 storage 的 `null` 延迟形成断点；已知采样空档不连接，响应实例 `startedAt` 变化时清空短时序列。
- 五类图表的数据映射、空状态、主题切换和响应式容器。
- 统计区展示留存口径说明，最近异常为空时使用留存范围内的空状态文案。
- 最近异常点击后复用任务运行日志抽屉并传递正确 task/run ID。
- 不测试 ECharts canvas 像素或第三方内部实现。

实现完成后运行仓库要求的完整 `pnpm check`。

## 实施顺序

1. 增加共享 system-health contracts 和 contracts 测试。
2. 调整 storage 单例注入，增加 provider probe 与缓存协调器。
3. 增加 scheduler 只读 diagnostics 与相关测试。
4. 实现公共 live/ready 探针并删除旧路径。
5. 实现系统健康 repository、service、routes 与权限 migration。
6. 增加客户端请求层、Vue ECharts 展示组件和系统健康页面。
7. 补充集成、前端、迁移测试和 README。
8. 运行完整验证并把 spec 标记为 `implemented`；后续 review 确认后再标记为 `completed`。

## 验收标准

1. `/api/health/live` 不访问任何依赖并稳定返回 `200`；旧 `/api/health` 不存在。
2. `/api/health/ready` 只以数据库为硬门槛，成功返回 `200`，失败返回安全的 `503`。
3. 有权限用户能看到当前实例、数据库、storage、scheduler 和共享积压，且语义不冒充集群。
4. 数据库不可用产生 `unhealthy`；storage 或 scheduler 当前异常产生 `degraded`；历史失败不改变整体状态。
5. Storage 使用真实轻量读写探测，30 秒内复用结果且并发调用不重复执行。
6. Scheduler diagnostics 不暴露可变内部对象、executor ID 或 run ID 集合，也不改变现有调度行为。
7. 任务统计提供 7 日每日状态、30 日状态与失败分布、平均耗时 Top 5 和最近 5 条异常，明确只统计当前留存日志、已清理记录不计入；既有保留配置和清理规则保持不变。
8. 页面可见时快照每 10 秒刷新、任务统计与最近异常每 60 秒刷新；进入页面、恢复可见及手动刷新时立即更新两者，隐藏后停止。两类数据分别显示最后成功的数据时间；短时快照最多保存 61 点，页面刷新、卸载或响应实例 `startedAt` 变化后清空。
9. Vue ECharts 图表支持明暗主题、响应式布局、文字摘要、空状态和安全错误展示。
10. 公共和受保护响应及数据库不包含原始诊断信息；新增 Pino 事件只使用约定的安全结构化字段与标准 `err` 字段，并沿用现有 redaction。
11. 普通角色的菜单显示和页面访问沿用现有菜单资源授权，两个系统健康接口均要求显式的 `ops:system-health:list` 权限；关联任务日志沿用原接口权限。
12. 完整 `pnpm check` 通过，README 与用户可见能力保持一致。

## 方案取舍依据

选择按请求聚合并把短时历史保存在浏览器，是因为当前目标是诊断当前实例和复用已有任务日志，不是建立监控平台。服务端内存采样环虽然能跨页面刷新保留几分钟数据，但会新增 timer、生命周期和共享内存状态，重启后仍会丢失；收益不足以抵消复杂度。持久化指标则需要时间序列模型、采样、保留、聚合和告警，是独立后续能力。

Readiness 只依赖数据库，是因为认证、权限与主要业务都以数据库为事实源；storage 只影响附件子能力，scheduler 能在失败后退避恢复。把局部故障作为 readiness 硬门槛会让本来可用的业务流量退出服务。管理端仍明确显示这些依赖的 degraded 状态，使局部故障可诊断而不扩大影响面。
