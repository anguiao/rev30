# Icon API Design

## 背景

当前前端已经使用 Iconify 生态中的 Tailwind 插件和 `@iconify/json`，但还没有接入
`@iconify/vue` 的运行时按需加载。后续计划是让 `<Icon icon="lucide:sun" />` 这类
不带自定义 provider 的写法也能访问本项目自己的图标接口，因此后端接口需要尽量贴近
Iconify API 的原生路径和返回格式。

Iconify 官方用于按需图标数据的核心接口是：

```text
/{prefix}.json?icons={icons}
```

其中 `prefix` 是图标集前缀，`icons` 是逗号分隔的图标名。返回值是 IconifyJSON。

## 目标

1. 在后端新增 Iconify API 兼容的图标数据接口。
2. 接口读取 `@iconify/json` 中已安装的全部图标集，不限制为单个图标集。
3. 按请求图标名返回 IconifyJSON 子集，不返回完整图标集。
4. 兼容 `@iconify/vue` 后续覆盖默认 API provider 的请求形态。
5. 图标接口不要求业务认证，避免运行时图标组件无法携带 Bearer token。
6. 尽量对齐 Iconify API 的 CORS、缓存、`pretty`、`not_found` 和错误行为。
7. 本轮只做后端 API，不添加前端依赖、初始化代码或组件用法替换。

## 非目标

本轮不实现：

- 前端 `@iconify/vue` 安装、注册或 `addAPIProvider()` 配置。
- 图标搜索、图标集浏览、关键字接口或图标选择器。
- SVG 直出接口 `/{prefix}/{icon}.svg`。
- CSS 直出接口 `/{prefix}.css?icons={icons}`。
- `/last-modified`、`/collections`、`/collection`、`/version` 等完整 Iconify API。
- 业务数据库中的图标元数据、收藏、权限控制或审计。

## 路由

新增后端路由模块：

- `apps/server/src/modules/icons/routes.ts`
- `apps/server/src/modules/icons/service.ts`

挂载位置：

```text
GET /api/icons/:prefix.json?icons=sun,moon
OPTIONS /api/icons/:prefix.json?icons=sun,moon
```

路由挂到 `createApiRoutes()` 的 `/icons` 下，不经过 `/api/system/*` 的认证中间件。
这样后续前端可以覆盖默认 provider：

```ts
addAPIProvider('', {
  resources: [window.location.origin],
  path: '/api/icons/',
})
```

覆盖默认 provider 后，`<Icon icon="lucide:sun" />` 会请求本地服务，而不是公共
Iconify API。

## 请求行为

### `GET /api/icons/:prefix.json`

查询参数：

- `icons`：必填，逗号分隔的图标名。实现不人为限制数量；客户端仍应受 URL 长度限制。
- `pretty`：可选。值为 `1` 或 `true` 时，返回缩进 JSON。

行为：

- `prefix` 从路径中的 `:prefix.json` 解析，必须保留 `.json` 结尾。
- `icons` 按逗号拆分并保留请求顺序；重复名称不会在返回的 `icons` 对象中重复出现。
- 空字符串图标名按 Iconify 公共 API 行为进入 `not_found`，不额外过滤。
- `prefix` 使用 Iconify 命名规则：小写字母、数字和连字符，且不能以连字符开头或结尾。
  不符合规则时返回 `404`。
- 只支持单个图标集；跨图标集仍由客户端拆成多个请求。
- 图标集通过 `@iconify/json` 的 `lookupCollection(prefix)` 懒加载。
- 使用 `@iconify/utils/getIcons(iconSet, names, true)` 提取子集，保留别名关系、
  `width`、`height`、`provider` 和 `lastModified` 等 IconifyJSON 兼容字段。
- 响应始终包含 `aliases` 对象。没有别名时返回空对象，贴近公共 API 的实际响应。
- 图标集加载后用进程内 `Map` 缓存，避免每次请求读取同一个 JSON 文件。

响应：

- 正常返回 `200` 和 IconifyJSON。
- 请求图标部分缺失时仍返回 `200`，缺失图标放入 `not_found`。
- 请求图标全部缺失时仍返回 `200`，`icons` 为空对象，`not_found` 包含缺失图标。
- 图标集不存在时返回 HTTP `404`，body 为纯文本 `404`。
- `icons` 参数完全缺失时返回 HTTP `404`，body 为纯文本 `404`。

这里以 Iconify 官方文档的 HTTP `404` 为准。当前公共 API 在部分边界请求上会返回
`200` 且 body 为 `404`，该行为更像部署层兼容细节，不作为本项目的主要契约。

### `OPTIONS /api/icons/:prefix.json`

返回 `204`，用于 CORS 预检。

## HTTP 头

图标接口响应包含与 Iconify API 接近的头：

```text
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding
Access-Control-Max-Age: 86400
Cross-Origin-Resource-Policy: cross-origin
Cache-Control: public, max-age=604800, min-refresh=604800, immutable
```

JSON 响应使用：

```text
Content-Type: application/json; charset=utf-8
```

纯文本错误响应使用：

```text
Content-Type: text/plain; charset=utf-8
```

## 依赖

`@rev30/server` 新增运行时依赖：

- `@iconify/json`
- `@iconify/utils`
- `@iconify/types`

`@iconify/json` 当前已被客户端依赖，但服务端需要在自己的 `package.json` 中显式声明，
避免依赖提升或 workspace 安装细节影响后端构建。

## 测试

使用 Vitest 按 TDD 添加后端路由测试：

1. `GET /api/icons/lucide.json?icons=sun,moon` 返回 `200`、IconifyJSON、CORS 和缓存头。
2. `GET /api/icons/lucide.json?icons=sun,not-a-real-icon` 返回 `not_found`。
3. `GET /api/icons/lucide.json?icons=not-a-real-icon` 返回空 `icons` 和 `not_found`。
4. `GET /api/icons/not-a-prefix.json?icons=sun` 返回 `404` 和 body `404`。
5. `GET /api/icons/lucide.json` 返回 `404` 和 body `404`。
6. `GET /api/icons/lucide.json?icons=sun&pretty=1` 返回缩进 JSON。
7. `OPTIONS /api/icons/lucide.json?icons=sun` 返回 `204` 和 CORS 头。
8. `GET /api/icons/Invalid.json?icons=sun` 返回 `404` 和 body `404`。

后续实现完成后运行：

```bash
pnpm --filter @rev30/server test
pnpm --filter @rev30/server typecheck
pnpm lint:check
pnpm format:check
```

如果依赖安装或锁文件变更影响 workspace，再运行完整 `pnpm check`。

## 参考

- Iconify API 查询：`/{prefix}.json?icons={icons}` 是图标数据接口，JSON 查询支持
  `pretty` 参数。
- Iconify 图标数据接口：图标集不存在返回 `404`，缺失图标进入 `not_found`。
- Iconify API Providers：可以通过 `addAPIProvider('', config)` 覆盖默认 provider，
  `resources` 不应包含 path，`path` 用于配置 API 根路径。
- Iconify HTTP Headers：默认允许跨域访问，并建议 7 天缓存。
