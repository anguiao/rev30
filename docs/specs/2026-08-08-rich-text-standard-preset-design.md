---
status: completed
date: 2026-08-08
---

# Rich Text Standard Preset 与公告集成设计

## 背景

`@rev30/rich-text` 当前提供两个内置 preset：

- `compact`：面向轻量编辑，只包含基础文档、撤销重做、粗体、斜体、链接、标题和列表。
- `all`：聚合全部内置 feature，用于完整能力展示，也会随内置 feature 增加而扩展。

通知公告当前使用 `compact`，无法表达常见的业务正文格式，也不能插入图片。项目需要增加一个功能集合明确、不会随 `all` 自动扩张的 `standard` preset，并让通知公告使用该 preset。

## 目标

- 新增独立、显式定义的 `standard` core、Vue editor、server 和 content CSS preset。
- 为日常业务正文提供基础格式、常用增强格式、搜索替换、字符统计和图片能力。
- 通知公告使用 `standard` 完成编辑、服务端派生和详情展示。
- 公告图片只使用内部附件 URL，并接入附件引用与未引用附件清理机制。
- 保持 rich-text core、Vue/editor、server 和 content CSS 的现有依赖边界。

## 非目标

本设计不包含：

- 表格、行内代码、代码块、字体/字号/颜色/行高等 text style，以及元素路径。
- 独立单词统计；状态栏继续使用现有字素字符计数并显示“`N 字`”。
- 外部图片 URL、`data:` URL、`blob:` URL 或由用户直接填写图片 URL。
- 公告级图片数量或附件总大小限制；单个图片文件继续使用附件模块现有上限。
- 面向业务方开放自定义 preset 组合器或 toolbar DSL。
- 修改 `compact` 或 `all` 的 feature 集合与交互配置。
- 定义 `standard` 的长期版本化、feature 演进或跨版本迁移策略；后续调整另行设计。
- 新增附件清理任务、清理配置或附件数据库结构。
- 修改通用附件的手动删除语义，或阻止手动删除已被公告引用的附件。
- 数据迁移、正文批处理或 HTML 批量重算。

## 设计决策摘要

| 主题 | 决策 |
| --- | --- |
| preset 定位 | 功能集合固定的日常业务正文 preset |
| 定义方式 | core、editor、server、CSS 均独立显式声明，不继承其他 preset |
| 图片配置 | Vue 和 server 均使用 factory 注入消费方策略 |
| 公告图片来源 | 仅允许 `/api/attachments/:uuid/content` 内部 URL |
| 图片读取策略 | 公告上传使用 `authenticated` |
| 图片访问边界 | 不继承公告可见范围；任意有效登录用户取得 URL 后均可读取 |
| 图片清理策略 | 公告上传使用 `unreferenced`，公告保存时维护附件引用 |
| 图片附件资格 | 必须匹配公告图片的 usage、读取策略、清理策略和栅格图片 MIME 类型 |
| 图片上传者限制 | 不校验 `createdBy`；允许公告操作者引用其他用户上传的合格公告图片 |
| 已引用图片手动删除 | 保持通用附件语义；引用只阻止自动清理，不阻止显式删除 |
| 失效图片错误 | `contentJson` 字段提示“正文包含无效图片，请移除或重新上传” |
| 发布时图片校验 | 不校验；独立发布与重新发布只改变公告生命周期状态 |
| 字符统计 | 复用现有 grapheme 计数和“`N 字`”状态栏 |
| 跨 preset 约束 | 只验证其他内置 preset 的 feature 均包含在 `all` 中 |
| 公告测试边界 | 验证编辑、上传、保存、展示和引用行为，不断言调用了哪个 factory |

## Standard Feature 集合

`standardRichTextPreset` 的 key 为 `standard`，按以下顺序显式启用 feature：

1. `base`
2. `history`
3. `character-count`
4. `search-replace`
5. `bold`
6. `italic`
7. `underline`
8. `strike`
9. `highlight`
10. `link`
11. `remove-format`
12. `heading`
13. `text-align`
14. `blockquote`
15. `list`
16. `horizontal-rule`
17. `image`

该列表是 `standard` 的完整定义。实现不得通过复制并过滤 `all`，也不得通过展开 `compact` 来建立隐式继承关系。

## Rich Text Package 设计

### 公开入口

`packages/rich-text/package.json` 新增以下 subpath exports：

```text
@rev30/rich-text/presets/standard
@rev30/rich-text/vue/presets/standard
@rev30/rich-text/server/presets/standard
@rev30/rich-text/content/presets/standard.css
```

对应文件为：

```text
packages/rich-text/src/presets/standard.ts
packages/rich-text/src/vue/presets/standard.ts
packages/rich-text/src/server/presets/standard.ts
packages/rich-text/src/content/presets/standard.css
```

不新增统一 presets barrel；消费方继续通过具体 preset subpath 导入。

### Core preset

`standardRichTextPreset` 使用 `defineRichTextPreset` 和 canonical feature 对象显式声明上述 17 个 feature。它不依赖 Vue、Naive UI、editor implementation、server implementation 或 CSS。

### Vue editor preset

Vue 入口提供：

```ts
export interface StandardRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

export function createStandardRichTextEditorPreset(
  options: StandardRichTextEditorPresetOptions,
): RichTextEditorPreset
```

图片上传是必填配置，因此不提供静态 `standardRichTextEditorPreset`。factory 负责把消费方的上传 handler 绑定到 image interaction，其余 editor feature 和界面配置保持静态定义。

#### Toolbar

Toolbar 固定为四组：

1. `history`
   - 撤销
   - 重做
   - 搜索替换
2. `marks`
   - 粗体
   - 斜体
   - 下划线
   - 删除线
   - 高亮
   - 链接
   - 清除格式
3. `blocks`
   - 标题 dropdown
   - 对齐 dropdown
   - 列表 dropdown
   - 引用
4. `insert`
   - 分割线
   - 图片

不显示 text style、行内代码、代码块或表格控件。

#### Quick Bar

文本 Quick Bar 包含粗体、斜体、下划线、高亮和链接。Feature Quick Bar 只包含图片与链接操作。

#### Slash Menu

Slash Menu 固定为：

- `basic`：段落、三级标题、引用。
- `list`：无序列表、有序列表。
- `insert`：分割线、图片。

#### Status Bar

状态栏起始区为空，结束区只显示现有 `characterCountStatusBarItem`。不显示 element path，也不新增统计口径。

### Server preset

Server 入口提供：

```ts
export interface StandardRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

export function createStandardRichTextServerPreset(
  options: StandardRichTextServerPresetOptions,
): RichTextServerPreset
```

Server preset 为所有需要可信服务端实现的 `standard` feature 显式登记 implementation。`history`、`character-count`、`search-replace` 和 `remove-format` 只影响编辑交互，不需要 server implementation。图片 implementation 使用消费方传入的 `isAllowedSrc` 策略。

### Content CSS

`standard.css` 独立组合 base、edge 和已启用内容 feature 的样式，包括标题、链接、列表、下划线、删除线、引用、分割线和图片。没有独立内容 CSS 的 feature 不增加空入口。

该 CSS 不导入 table 或 code-block 等未启用 feature 的样式。Vue standard preset 自动导入 `standard.css`；server 和 core preset 入口无 CSS 副作用。

### Preset 之间的约束

`compact`、`standard` 和 `all` 各自独立定义。测试只建立以下约束：

- `all` 继续包含全部内置 feature。
- `compact` 启用的每个 feature 都存在于 `all`。
- `standard` 启用的每个 feature 都存在于 `all`。

不声明或测试 `compact` 与 `standard` 之间的包含关系，也不要求任何严格子集关系。

公告切换时另有一项一次性的兼容要求：切换前由当前 `compact` 生成并已持久化的公告正文必须能由 `standard` 加载和服务端派生，无需数据迁移。当前 `compact` 的持久化 feature 均已包含在本设计列出的 `standard` 集合中。该要求使用冻结的旧公告正文 fixture 验证，不比较两个 preset 的实时 feature 集合；未来 `compact` 独立增加 feature 不会自动扩大 `standard`，也不构成本兼容要求失败。

## 公告客户端集成

### Preset 创建

`AnnouncementFormDrawer.vue` 直接使用 `createStandardRichTextEditorPreset`。组件 setup 中创建一次稳定的 preset 引用，不在 render、computed 或 watch 中重复创建。

图片上传函数保留在表单组件中，它只承担公告表单与通用 rich-text image upload 接口之间的转换，不新增独立模块或抽象层。

### 图片上传

图片上传流程为：

1. 使用现有 `compressImageFile` 压缩用户选择、粘贴或拖入的图片：

   ```ts
   {
     maxDimension: 1920,
     quality: 0.86,
   }
   ```

2. 使用 `uploadAttachment` 上传压缩结果：

   ```ts
   {
     usage: 'announcement-content-image',
     readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
     cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
   }
   ```

3. 使用 `getAttachmentContentUrl(attachment.id)` 生成内部内容 URL，并作为 `{ src }` 返回给 image interaction。

4. 压缩、上传或图片载入失败时，通过 preset 的 `image.onError` 将“上传图片失败”写入现有表单错误区域；失败图片不插入正文。

### 详情展示

`MyAnnouncementDetailDrawer.vue` 改为导入 `@rev30/rich-text/content/presets/standard.css`。详情仍使用服务端持久化的安全 HTML 和现有 `rich-text-content rich-text-content--sm` 容器，不新增展示组件。

## 公告服务端集成

### 内容适配

现有 `apps/server/src/modules/content/announcements/content.ts` 继续负责公告正文的业务边界：

- 创建带公告图片策略的 standard server preset。
- 调用 `deriveRichTextContent` 完成 JSON 校验、规范化、纯文本派生、HTML 渲染和清洗。
- 将 `RichTextContentInvalidError` 映射为 `AnnouncementContentInvalidError`。
- 从规范化后的 JSON 提取公告图片附件 ID。

不新增额外 service 层。

### 图片 URL 规则

公告图片只接受以下精确形式：

```text
/api/attachments/:uuid/content
```

其中 `:uuid` 必须通过 `z.uuid()` 校验；通过后将附件 ID 规范化为小写，用于提取、去重和附件引用，但不重写正文中的原始 URL。URL 不接受协议、host、query、hash、前后空白或额外路径片段。外部 URL、协议相对 URL、`data:` 和 `blob:` 均导致正文无效，而不是静默移除图片。

公告图片沿用通用附件的 `authenticated` 读取边界，不继承公告按用户、部门或角色配置的可见范围。服务端不根据公告接收范围对图片内容请求做二次鉴权；任意状态有效的登录用户取得图片 URL 后均可读取。这是明确接受的访问边界，图片 URL 不作为需要公告接收权限才能访问的资源地址。

附件 ID 从 `deriveRichTextContent` 返回的规范化 JSON 中提取，同一附件在单篇正文中只保留一个引用 ID。

### 附件引用

公告 repository 使用现有 `refreshAttachmentReferences` 和 `deleteAttachmentReferences`，引用来源固定为：

```ts
{
  sourceType: 'announcement',
  sourceId: announcementId,
  sourceField: 'contentJson',
}
```

引用同步规则：

- 创建公告：派生正文并提取附件 ID；公告落库后，在同一事务内校验目标附件并建立引用。创建时是否同时发布不改变该规则。
- 更新公告正文：派生新正文并提取附件 ID；在同一事务内校验目标附件并用新集合刷新引用。更新请求同时携带 `publish: true` 时仍执行该规则。
- 更新公告但未提交 `contentJson`：不读取或刷新附件引用。
- 独立发布或重新发布公告：只执行既有生命周期状态变更，不读取正文、不校验图片附件，也不刷新引用；已失效图片不阻止发布。
- 公告下线：只执行既有生命周期状态变更，不读取正文、不校验图片附件，也不刷新或删除引用。
- 软删除公告：在同一事务内删除该公告正文的全部附件引用。
- 建立或刷新引用时，目标附件必须存在、未软删除，并同时满足：
  - `usage = 'announcement-content-image'`；
  - `readPolicy = 'authenticated'`；
  - `cleanupPolicy = 'unreferenced'`；
  - `mimeType` 以 `image/` 开头且不为 `image/svg+xml`，与附件模块现有栅格图片判断一致。
- 引用目标不存在、已软删除或任一业务属性不匹配：映射为 `AnnouncementContentImageInvalidError`，公告事务不落库。

附件业务属性由公告 repository 在刷新引用前批量查询和校验；通用 `refreshAttachmentReferences` 只负责锁定活动附件、再次确认引用目标仍然有效并维护引用，不接收业务校验回调。`usage`、`readPolicy`、`cleanupPolicy` 和 `mimeType` 在附件创建后不提供修改入口；若附件在业务校验后并发软删除，通用引用刷新仍会在锁定活动附件时拒绝该目标。

上述校验位于公告保存的服务端业务边界，不信任客户端上传时声明的属性。附件上传者 `createdBy` 不属于引用资格：只要目标附件满足上述业务属性，具备公告创建或更新权限的操作者就可以引用，包括编辑其他操作者创建且已包含图片的公告。repository 不读取 preset feature，也不负责图片 URL 解析。

## 数据流

```text
用户选择、粘贴或拖入图片
  -> 客户端压缩
  -> 上传为 authenticated + unreferenced 附件
  -> 得到内部 attachment content URL
  -> image node 写入编辑器 JSON
  -> 提交公告
  -> standard server preset 校验并规范化 JSON
  -> 派生 text 与安全 HTML
  -> 从规范化 JSON 提取附件 ID
  -> 在公告事务内批量校验目标附件的业务属性
  -> 通用引用刷新锁定活动附件并再次确认目标有效
  -> 公告数据与附件引用在同一事务内写入
  -> 详情使用 standard.css 渲染安全 HTML
```

## 附件生命周期

附件上传与公告保存是两个独立请求，生命周期由 `unreferenced` cleanup policy 与附件引用表衔接：

- 图片上传后、公告保存前没有引用；正常交互期间由现有保留期保护。
- 用户取消图片、关闭表单或公告保存失败时，附件保持未引用，并由现有清理任务在保留期后删除。
- 公告保存成功后，附件引用阻止清理任务删除正文图片。
- 正文移除图片或公告被软删除时，相应引用被移除；附件的最后一条引用被移除后，从该时间重新开始计算保留期。
- 引用刷新与公告写入使用同一事务；事务失败不会留下半完成的公告引用。
- 清理任务继续使用现有调度和配置；当前默认保留期为 7 天，本设计不新增公告专用清理逻辑。
- 附件引用只参与自动清理判断，不改变通用附件的显式删除权限与语义。具有 `content:attachment:delete` 权限的用户仍可手动删除已引用图片；删除不会反向修改公告 JSON、HTML 或引用记录，后续图片请求失败。
- 含有已手动删除图片的正文再次随公告更新提交时，不再满足有效引用目标约束；操作者必须先移除或替换失效图片，才能保存该次正文更新。未提交 `contentJson` 的局部更新仍按既有规则不校验或刷新附件引用。

## 错误处理

### 客户端

- 图片压缩、上传或载入失败：不插入 image node，并显示“上传图片失败”。
- 公告保存返回 `contentJson` 字段错误：继续使用现有表单字段错误映射。
- 其他保存错误：继续显示现有公告表单级错误。

### 服务端

- JSON 结构、standard schema、文档约束或图片 URL 无效：抛出 `AnnouncementContentInvalidError`。
- 附件引用目标不存在、已软删除或业务属性不匹配：抛出 `AnnouncementContentImageInvalidError`；该错误仍定位到 `contentJson` 字段，固定提示“正文包含无效图片，请移除或重新上传”，不区分或暴露具体失效原因。
- 附件引用和公告写入任一环节失败：回滚整个公告事务。
- 未知错误继续抛出，不增加 fallback。
- 附件清理任务失败继续使用现有日志与重试周期，不改变公告 API 的响应。

## 测试策略

### Rich Text package

沿用现有 preset、import-boundary 和类型契约测试结构，增加 `standard` 对应案例：

- `standard` feature key、顺序和 canonical identity 与本设计一致。
- editor preset 提供规定的 Toolbar、Quick Bar、Slash Menu 和 Status Bar 行为。
- 图片 interaction 使用传入的 upload handler，其他 feature 能完成相应编辑命令。
- server preset 能派生 standard 内容，并按注入策略接受或拒绝图片 URL。
- `compact` 与 `standard` 各自启用的 feature 均存在于 `all`；不比较二者关系。
- server standard 入口不带入 Vue、editor 或 CSS。
- Vue standard 入口带入 standard 内容 CSS；standard CSS 可独立加载且不包含未启用 feature。
- factory 的公开 options 和返回类型能被消费方按声明使用。

不新增另一套 subpath、模块图或类型测试机制。

### 公告客户端

测试以用户和业务可见行为为边界：

- 从公告编辑器触发图片操作后，图片经过既定压缩参数上传为指定 usage、read policy 和 cleanup policy，并得到内部 URL。
- 图片处理失败时显示表单错误，正文不增加失败图片。
- 至少一种 standard 新增格式能够从公告编辑器进入提交的正文 JSON；各 feature 的编辑细节不在公告测试中重复覆盖。
- 编辑冻结的旧 `compact` 公告正文 fixture 时，standard editor 能加载并保持原有语义地提交。
- 详情继续渲染服务端 HTML。

客户端测试不以 factory 调用、preset key 或内部配置对象作为断言目标。Rich-text package 已覆盖的图片弹窗内部细节不在公告测试中重复覆盖。

### 公告服务端

- 支持 standard 新增的格式并生成预期规范化 JSON、纯文本和安全 HTML。
- 冻结的旧 `compact` 公告正文 fixture 能由 standard server 保持语义地规范化和派生。
- 接受合法内部附件图片，拒绝外部、非法或带前后空白的图片 URL。
- 从规范化正文中提取去重后的附件 ID。
- 创建、更新正文和软删除公告时正确同步附件引用。
- 引用不存在、已软删除或不符合公告图片业务属性的附件时返回 `contentJson` 字段错误“正文包含无效图片，请移除或重新上传”，且公告事务不落库。
- 允许引用其他用户上传但业务属性合格的公告图片。
- 已引用图片被手动删除后，再次提交该正文会返回失效图片字段错误；不提交 `contentJson` 的局部更新仍可成功。
- 独立发布或重新发布不校验图片；带有已失效图片的草稿或已下线公告仍可完成状态变更。

通用附件清理 worker 的保留期、并发锁和物理删除行为继续由附件模块测试负责，公告测试只验证引用维护职责。

### 验证命令

实现阶段先运行 rich-text、client 和 server 的定向测试，再运行完整验证：

```bash
pnpm check
```

完整验证按仓库约定在沙箱外运行，以支持 Chromium 浏览器测试。

## 文档更新

- 更新 `packages/rich-text/README.md`，列出 standard content CSS 和 Vue preset 的自动 CSS 行为。
- 更新根 `README.md` 的功能概览，说明公告正文使用 standard 富文本能力并支持内部附件图片，不增加实现细节。

## 完成标准

- 四个 standard 公开入口可按既有 package 边界使用。
- standard editor 只提供本设计列出的能力和交互区域。
- standard server 能可信校验、派生并清洗对应内容。
- 公告可以编辑、保存和展示 standard 格式及内部附件图片。
- 公告创建、正文更新和软删除正确维护附件引用，只接受符合公告图片业务属性的引用目标，未引用图片由现有清理任务处理。
- 公告测试验证行为而非 factory 调用等内部实现。
- `pnpm check` 通过。
