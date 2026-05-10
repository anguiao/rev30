# 资源图标选择器设计

## 背景

资源管理表单已经支持 `icon` 字段，并通过 `@iconify/vue` 预览 `lucide:users` 这类
Iconify 图标名。当前体验仍是普通文本输入：用户需要记住图标名或去外部站点查找，再粘贴到
表单中。

项目已经具备两个关键基础：

- 后端 `/api/icons/:prefix.json?icons=...` 可从本地 `@iconify/json` 按需返回
  IconifyJSON 子集。
- 前端已经用 `addAPIProvider('', { resources: [window.location.origin], path: '/api/icons/' })`
  把 Iconify 运行时图标加载指向本地接口。

因此，本次设计聚焦在“搜索和选择合法 Iconify 名称”，不改变资源表的存储结构，也不改变菜单图标
渲染方式。

参考方案是 [Icônes](https://icones.js.org/) 的搜索体验和开源实现：它把 Iconify 集合拆成轻量
metadata，在浏览器端用 `fzf` 做即时模糊搜索，并通过 alias 扩展让 `person`、`profile`、`user`
这类词互相命中。本项目不照搬它的“前端加载全量 metadata 并本地搜索”架构，而是借鉴它的
FZF 召回、alias 扩展和轻量索引思路，将搜索放在服务端完成，避免后台表单为了一个选择器下载
完整图标索引。

## 目标

1. 在资源表单中用图标选择器替换低效的纯文本输入体验。
2. 选择器支持全量 Iconify 本地图库搜索，覆盖已安装的全部 `@iconify/json` 图标集。
3. 支持偏后台管理场景的中文搜索，例如“用户”“角色”“权限”“资源”“部门”。
4. 选中值仍保存为 Iconify 标准名称，例如 `lucide:users`。
5. 选中结果在表单里以类似只读 `NInput` 的形态展示，明确显示最终 Iconify 名称。
6. 用户不能直接手写修改图标名，只能通过搜索结果选择或清空来改变表单值。
7. 尽量复用 Naive UI 组件，并保持资源表单抽屉内完成，不新增独立弹窗。
8. 搜索接口不要求业务认证，和现有图标数据接口保持一致。

## 非目标

本次不实现：

- 图标收藏、最近使用、个人偏好或数据库持久化搜索配置。
- 图标分类浏览、分页浏览完整图标集或高级筛选面板。
- AI、embedding 或外部远程搜索服务。
- 管理后台中的图标词典配置页面。
- 修改资源 `icon` 字段 schema、数据库结构或现有菜单渲染链路。
- 允许用户直接输入任意 Iconify 名称并保存。

## 服务端搜索设计

新增图标搜索能力，放在现有 `apps/server/src/modules/icons` 模块内。

新增文件：

- `apps/server/src/modules/icons/search-config.ts`
- `apps/server/src/modules/icons/search-service.ts`

新增服务端依赖：

- `fzf`：用于服务端本地模糊召回。第一版在 `@rev30/server` 中使用，前端不增加搜索库依赖。

搜索接口：

```text
GET /api/icons/search?keyword=user&limit=60
GET /api/icons/search?keyword=用户&limit=60
GET /api/icons/search?keyword=lucide:users&limit=60
```

该接口挂在现有 `/api/icons` 下，不走 `/api/system/*` 的认证中间件。原因是图标搜索只暴露
本地依赖中已经安装的公开图标元数据，不包含业务敏感数据；同时保持和 Iconify 运行时图标数据接口
一致。

响应结构：

```ts
{
  list: [
    {
      icon: 'lucide:users',
      prefix: 'lucide',
      name: 'users',
      collection: 'Lucide',
      palette: false,
    },
  ],
}
```

共享 schema 放在 `packages/shared/src/schemas/icons.ts`，用于约束请求查询和响应结构。

### 搜索索引

服务端维护一个进程内轻量索引。索引不保存 SVG body，只保存搜索和展示需要的元数据：

```ts
type IconSearchItem = {
  icon: string
  prefix: string
  name: string
  collection: string
  category: string | null
  palette: boolean
  searchText: string
}
```

其中 `searchText` 只用于服务端搜索，不出现在接口响应中。它由图标完整名、图标名、图标集 prefix、
图标集名称和类别拼接而成，例如：

```ts
`${icon} ${name} ${prefix} ${collection} ${category ?? ''}`
```

索引从 `@iconify/json/collections.json` 和各集合 JSON 中构建：

- `collections.json` 提供图标集名称、数量、类别、是否彩色等集合元数据。
- 每个集合 JSON 的 `icons` key 提供图标名。
- 隐藏图标不需要特别过滤，除非 Iconify 工具自身不返回；第一版保持简单。

构建策略：

- 首次搜索时懒加载并缓存索引。
- 构建索引时同时创建两个 `AsyncFzf<IconSearchItem>` finder，`selector` 都指向 `searchText`。
- 后续搜索复用同一个 Promise，避免并发首次请求重复构建。
- 不把完整 IconifyJSON 发给前端；预览仍由现有 Iconify provider 按需请求图标数据。

## 中文搜索与排序

搜索采用“查询候选扩展 + FZF 模糊召回 + 业务重排”的轻量方案，不引入语义向量搜索。

配置放在：

```text
apps/server/src/modules/icons/search-config.ts
```

配置内容包含：

- 后台管理中文词典。
- 英文 alias 词组，参考 Icônes 的 `searchAlias` 形式，例如 `['account', 'person', 'profile', 'user']`。
- 常用图标集加权。
- 彩色、品牌和 emoji 图标集降权。
- 空关键词推荐图标列表。

### 查询候选扩展

服务端把用户输入转换成一个较小的候选查询集合，再交给 FZF 搜索。候选集合最多保留 12 个，避免
组合爆炸。

处理规则：

1. 对原始 `keyword` 做 `trim` 和小写化。
2. 如果输入是完整 Iconify 名称，例如 `lucide:users`，保留原始值作为最高优先候选。
3. 英文关键词按空白拆词；命中英文 alias 词组时，把同组词加入候选。例如 `person` 会扩展出
   `account`、`profile`、`user`。
4. 中文关键词通过后台管理词典扩展成英文候选。例如“用户”扩展成 `user users account profile`。
5. 中文连续短语不做通用分词；第一版仅扫描词典 key。如果输入“用户权限”，会命中“用户”和“权限”
   两个已配置 key，并生成有限数量的英文候选。
6. 英文单复数和横线 token 做轻量扩展，例如 `user`、`users`、`user-check` 可互相增加召回机会。

中文搜索可以实现，但边界是“可维护的业务词典搜索”，不是任意中文语义搜索。未配置的中文词不会
凭空命中；后续如果需要覆盖更泛的中文表达，可以继续扩充词典，或另起设计引入拼音、分词、同义词库
或 embedding。

第一版中文词典偏后台管理场景，例如：

```ts
export const chineseIconSearchAliases = {
  用户: ['user', 'users', 'account', 'profile'],
  角色: ['role', 'shield', 'badge', 'user-check'],
  权限: ['permission', 'lock', 'key', 'shield'],
  菜单: ['menu', 'list', 'panel'],
  资源: ['resource', 'box', 'boxes', 'package', 'database'],
  部门: ['department', 'building', 'network', 'organization'],
  组织: ['organization', 'building', 'network', 'users'],
  系统: ['system', 'settings', 'server', 'monitor'],
  设置: ['settings', 'cog', 'sliders'],
  日志: ['log', 'file-text', 'history', 'clock'],
  首页: ['home', 'house', 'dashboard'],
  统计: ['chart', 'bar-chart', 'line-chart', 'activity'],
  报表: ['report', 'chart', 'file-chart', 'clipboard-list'],
  字典: ['dictionary', 'book', 'list'],
  通知: ['bell', 'notification', 'message'],
  文件: ['file', 'folder', 'files'],
  外链: ['external-link', 'link', 'globe'],
  操作: ['action', 'play', 'mouse-pointer', 'command'],
  状态: ['status', 'check', 'circle', 'badge'],
  排序: ['sort', 'arrow-up-down', 'list-ordered'],
  配置: ['settings', 'sliders', 'cog'],
}
```

英文 alias 词组先覆盖常见 UI 语义，例如：

```ts
export const iconSearchAliasGroups = [
  ['account', 'person', 'profile', 'user'],
  ['add', 'create', 'new', 'plus'],
  ['alert', 'bell', 'notification', 'notify', 'reminder'],
  ['attach', 'connect', 'link'],
  ['building', 'home', 'house'],
  ['cog', 'gear', 'preferences', 'settings'],
  ['delete', 'remove', 'trash'],
  ['document', 'file', 'paper'],
  ['earth', 'globe', 'world', 'global'],
  ['list', 'menu'],
  ['lock', 'secure', 'security'],
  ['refresh', 'reload', 'update', 'sync'],
  ['chart', 'graph'],
]
```

### FZF 召回

服务端使用 `AsyncFzf` 做模糊召回，并保留快路径和扩展匹配路径：

```ts
import { AsyncFzf, asyncExtendedMatch } from 'fzf'

const fastFinder = new AsyncFzf(items, {
  casing: 'case-insensitive',
  fuzzy: 'v1',
  selector: item => item.searchText,
})

const extendedFinder = new AsyncFzf(items, {
  casing: 'case-insensitive',
  match: asyncExtendedMatch,
  selector: item => item.searchText,
})
```

单个候选使用 `fastFinder`，`fuzzy: 'v1'` 是性能优先选择，适合图标搜索这种短文本、大列表场景。
多个 alias 候选使用 `extendedFinder`，通过 ` | ` 拼成 OR 查询。这个分层思路参考 Icônes 对 alias
候选和 extended match 的处理；但本项目不把 FZF 放到前端，也不把全量 metadata 下发给浏览器。

排序规则：

1. 精确匹配完整图标名，例如 `lucide:users`。
2. 精确匹配图标名称，例如 `users`。
3. 图标名称 token 前缀匹配，例如 `user` 命中 `user-cog`。
4. 图标名称包含匹配。
5. FZF 分数和结果顺序。
6. 中文或英文 alias 扩展后的 token 命中。
7. 常用后台风格图标集加权，例如 `lucide`、`tabler`、`heroicons`、`ph`。
8. 单色图标优先，彩色、品牌、emoji 图标降权但不硬过滤。

空关键词不返回全量图库，而返回后台常用推荐图标。推荐图标同样配置在
`search-config.ts`，例如用户、角色、权限、菜单、资源、部门、设置、日志、首页、统计等常用资源图标。
推荐图标只用于空关键词，不参与非空搜索加权。

查询参数：

- `keyword`：可选。为空时返回推荐图标。
- `limit`：可选，默认 `60`，最大 `100`。

## 前端交互设计

资源表单中的“图标”字段改为只读选择控件，不使用独立弹窗。

新增组件：

```text
apps/client/src/features/system/ResourceIconPicker.vue
```

组件职责：

- 接收 `value: string | null`。
- 发出 `update:value`，值为选中的 Iconify 名称或 `null`。
- 展示当前图标预览和 Iconify 名称。
- 打开表单内选择面板，搜索并选择图标。

表单字段展示：

- 使用 `NInputGroup` 作为整体结构。
- 中间用 `NInput` 展示选中值，并启用 `clearable`。
- 不设置 `NInput` 的 `readonly` prop，因为 Naive UI 在 `readonly` 下不会显示内置清空图标。
- 使用 `allow-input` 阻止用户通过键盘直接改写展示值；清空动作走 `NInput` 内置 clear 行为。
- 有值时显示 `lucide:users` 这类完整 Iconify 名称。
- 无值时显示占位文案“未选择图标”。
- 左侧展示当前图标预览；空值时展示淡色“无”。
- 不额外提供选择按钮或清空按钮；展示输入框本身就是打开选择面板的入口。

选择面板：

- 使用 `NPopover`，不使用独立 `NModal` 或新页面。
- `NPopover` 使用受控显示状态，而不是直接依赖 `trigger="focus"`；展示输入框获得焦点或被点击时打开
  面板，避免焦点移入面板搜索框时误关闭。
- 面板内顶部是 `NInput` 搜索框。
- 选择面板打开后，自动聚焦面板内搜索框，用户可以直接输入关键词搜索。
- 结果区使用紧凑网格展示，每项常态只显示图标，不显示完整名称、图标集名称或其它文本信息。
- 结果项悬浮、键盘聚焦或选中时需要有明确样式反馈，例如边框、背景色或主题色变化。
- 结果项悬浮或键盘聚焦时展示完整 Iconify 名称，例如通过 Naive UI tooltip 展示 `lucide:users`。
- 搜索中显示 `NSpin`。
- 无结果显示 `NEmpty`。
- 请求失败显示小型错误提示，并允许用户调整关键词重试。
- 点击结果后更新表单值并关闭面板。

用户不能直接通过展示输入框修改图标名。若用户知道精确名称，可在选择面板搜索框输入
`lucide:users`，从结果中选择。

清空已有值使用 `NInput` 自带的 clear 图标。

## 数据流

1. `ResourceFormDrawer.vue` 的 `form.Field name="icon"` 渲染 `ResourceIconPicker`。
2. 展示输入框聚焦或被点击后打开选择面板；如果搜索词为空，请求推荐图标。
3. 用户输入关键词后，组件带防抖请求 `/api/icons/search`。
4. 服务端根据关键词构建查询候选，执行 FZF 召回，再按业务规则重排并返回结果。
5. 前端用结果中的 `icon` 字段渲染 `<Icon :icon="icon" />` 预览。
6. 悬浮或键盘聚焦结果项时，通过 tooltip 展示 `icon` 字段对应的完整 Iconify 名称。
7. 点击结果后，组件发出 `update:value`，表单保存 `prefix:name` 字符串。
8. 资源保存时继续走现有 `resourceFormSchema`、`resourceCreateSchema` 和 `resourceUpdateSchema`。

## 错误处理

服务端搜索接口：

- 非数字或小于 1 的 `limit` 使用共享 schema 返回标准请求错误；超过 `100` 的 `limit`
  归一为 `100`。
- 搜索索引构建过程中如果某个图标集读取失败，第一版让错误暴露为接口错误，便于开发阶段发现依赖问题。
- 不添加宽泛 fallback，不静默吞掉本地依赖异常。

前端选择器：

- 搜索失败只影响选择面板，不影响资源表单其他字段。
- 已选图标仍按当前值展示；搜索失败不清空现有值。
- 空值通过 `NInput` 内置清空图标显式产生，并保存为 `null`。
- 图标名合法性仍由共享资源 schema 兜底校验。

## 测试设计

共享 schema 测试：

- 搜索查询接受空关键词和合法 `limit`。
- `limit` 缺省为 `60`，超过最大值时归一为 `100`。
- 搜索响应接受 `icon`、`prefix`、`name`、`collection`、`palette` 字段。

服务端测试：

- 空关键词返回后台常用推荐图标，且数量不超过默认限制。
- 英文关键词 `user` 能返回包含 `user` 的图标。
- 中文关键词“用户”能通过别名扩展返回用户相关图标。
- 中文组合关键词“用户权限”能通过已配置中文 key 召回用户和权限相关图标。
- 英文 alias 关键词 `person` 能召回 `user` 相关图标。
- 精确关键词 `lucide:users` 让 `lucide:users` 排在靠前位置。
- 拼写不完全的英文关键词能通过 FZF 召回相近图标名。
- 彩色或品牌图标不被过滤，但在同等匹配下排在单色图标之后。
- `limit=100` 最多返回 100 条。
- 未认证请求可以访问 `/api/icons/search`。

前端组件测试：

- 空值时显示“未选择图标”。
- 有值时显示图标预览和完整 Iconify 名称。
- 聚焦或点击展示输入框后请求推荐图标。
- 输入中文关键词会请求搜索接口并展示图标结果。
- 结果项常态只渲染图标，不渲染完整名称或图标集名称文本。
- 结果项 hover 或 focus 时有样式反馈，并展示完整 Iconify 名称。
- 点击结果后发出 `update:value` 并关闭面板。
- 点击 `NInput` 内置清空图标后发出 `update:value`，值为 `null`。
- 展示输入框不能通过键盘输入直接改变值。
- 搜索失败时显示错误提示，当前选中值保持不变。

资源表单测试：

- `ResourceFormDrawer.vue` 使用 `ResourceIconPicker` 绑定 `icon` 字段。
- 选择图标后提交资源时 `icon` 为选中的 `prefix:name`。
- 清空图标后提交资源时 `icon` 为 `null`。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/shared test -- icons
pnpm --filter @rev30/server test -- icons
pnpm --filter @rev30/client test -- ResourceIconPicker
pnpm --filter @rev30/client test -- ResourceFormDrawer
pnpm check
```

如果测试文件命名或过滤条件不同，可以按实际测试名称调整单跑命令，但最终完整验证仍以
`pnpm check` 为准。
