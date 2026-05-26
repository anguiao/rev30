# 富文本包设计

## 背景

当前通知公告模块已经引入 Tiptap 富文本编辑器。前端在 `apps/client/src/features/content/RichTextEditor.vue` 中配置 editor、toolbar 和 Tiptap extensions；后端在 `apps/server/src/modules/content/announcements/content.ts` 中再次配置相同的 Tiptap extensions，并负责从 Tiptap JSON 派生纯文本、HTML 和安全 HTML。

这造成了两个问题：

- 前后端对富文本能力的定义重复，后续新增 feature 时容易漏改或分叉。
- 富文本编辑器组件与通知公告业务目录绑定，后续知识库、协议、帮助中心等内容类功能复用成本高。

本次设计新增 workspace 包 `@rev30/rich-text`，把当前已实现的富文本能力抽成成熟结构。第一阶段不新增 TinyMCE 对齐能力，只迁移当前行为并保持现有用户可见表现不变。

## 目标

- 新增 `packages/rich-text`，作为项目内富文本能力包。
- 把当前已实现的 Tiptap extension 配置、Vue 编辑器组件、服务端解析、HTML 生成、sanitize 策略和基础 schema/helper 统一到该包。
- 使用 feature-first 结构，让每个富文本能力拥有自己的图标、extension、Vue toolbar 行为和服务端 HTML 策略。
- 使用 preset 组合 feature，业务根据内容形态选择 preset，不把业务名写入 preset。
- 使用 toolbar layout 决定 Vue toolbar 的分组和顺序，不把 UI 排列固定在 feature 或 preset 中。
- 让公告模块继续使用当前能力，并保持 `contentJson`、`contentText`、`contentHtml` 行为不变。
- 保持清晰依赖边界：core/schema/presets 不依赖 Vue、Naive UI 或 sanitize-html。

## 非目标

本阶段不实现：

- TinyMCE open-source demo 全能力对齐。
- 表格、图片、媒体、代码块、搜索替换、预览、全屏、字数统计等新 feature。
- 富文本协同编辑、评论、修订历史、AI、拼写检查、可访问性检查。
- 通用第三方 UI 框架无关组件库；本包的 Vue 子入口面向当前项目的 Naive UI。
- 富文本业务配置后台化或运行时远程配置。
- 将公告业务语义写入富文本包。

## 当前能力范围

`compactRichTextPreset` 覆盖当前已经上线和测试的能力：

- 段落。
- 标题 1-3。
- 加粗。
- 斜体。
- 下划线。
- 引用。
- 无序列表。
- 有序列表。
- 分割线。
- 链接 mark 的服务端安全处理。
- 行内代码和代码块保持 StarterKit 现有底层支持，并保留服务端 `code/pre` HTML 白名单；第一阶段不新增对应 toolbar 控件。
- 撤销、重做。
- Tiptap JSON 校验。
- 空文本判断。
- 纯文本提取，block separator 使用 `\n\n`。
- 服务端 HTML 生成。
- 服务端 HTML sanitize。

## 核心模型

富文本包使用三个概念分离能力、能力集合和界面排列：

- `feature`: 一个富文本能力单元，例如 bold、heading、link。
- `preset`: 启用哪些 feature，例如 compact。
- `toolbar layout`: Vue toolbar 如何分组、按什么顺序展示 toolbar items。

feature 自包含能力默认信息，但不决定 toolbar 的最终排列：

```ts
export const boldFeature = defineRichTextFeature({
  key: 'bold',
  label: '加粗',
  icon: 'i-[lucide--bold]',
  extension: () => Bold,
})
```

preset 只组合 feature：

```ts
export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    boldFeature,
    italicFeature,
    underlineFeature,
    headingFeature,
    blockquoteFeature,
    listFeature,
    horizontalRuleFeature,
    linkFeature,
    historyFeature,
  ],
})
```

toolbar layout 单独描述分组和顺序：

```ts
export const compactRichTextToolbarLayout = defineRichTextToolbarLayout([
  { key: 'marks', items: ['bold', 'italic', 'underline'] },
  { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
  { key: 'lists', items: ['bullet-list', 'ordered-list'] },
  { key: 'insert', items: ['horizontal-rule'] },
  { key: 'history', items: ['undo', 'redo'] },
])
```

一个 feature 可以贡献多个 toolbar item。`headingFeature` 贡献 `heading-1`、`heading-2`、`heading-3`；`listFeature` 贡献 `bullet-list`、`ordered-list`；`historyFeature` 贡献 `undo`、`redo`，但不贡献服务端 HTML policy。

## 包结构

建议结构：

```txt
packages/rich-text/
  __tests__/
    presets/
    server/
    vue/
  src/
    core/
      feature.ts
      preset.ts
      toolbar.ts
    features/
      bold/
        shared.ts
        vue.ts
        server.ts
      italic/
        shared.ts
        vue.ts
        server.ts
      underline/
        shared.ts
        vue.ts
        server.ts
      heading/
        shared.ts
        vue.ts
        server.ts
      blockquote/
        shared.ts
        vue.ts
        server.ts
      list/
        shared.ts
        vue.ts
        server.ts
      horizontal-rule/
        shared.ts
        vue.ts
        server.ts
      link/
        shared.ts
        server.ts
      history/
        shared.ts
        vue.ts
    presets/
      compact.ts
      index.ts
    schema/
      document.ts
      index.ts
    server/
      derive.ts
      registry.ts
      sanitize.ts
      index.ts
    vue/
      RichTextEditor.vue
      RichTextToolbar.vue
      RichTextToolbarButton.vue
      layouts.ts
      registry.ts
      useRichTextEditor.ts
      index.ts
    index.ts
  package.json
  tsconfig.json
  tsconfig.app.json
  tsconfig.test.json
```

目录约定：

- `features/<name>/shared.ts` 定义 feature 身份、标签、默认图标和 Tiptap extension factory。
- `features/<name>/vue.ts` 定义该 feature 的 toolbar item、active 状态、disabled 状态和 command。
- `features/<name>/server.ts` 定义该 feature 的 HTML sanitize policy。

本阶段不引入复杂平台支持矩阵。通过同目录文件约定和测试保证 `compactRichTextPreset` 当前启用的 feature 在 Vue/server 两侧具备需要的实现。`historyFeature` 没有 server policy 是允许的，因为它只影响编辑器交互，不影响存储和 HTML 输出。

## 导出入口

`package.json` 建议使用 subpath exports：

```json
{
  "name": "@rev30/rich-text",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./presets": {
      "types": "./src/presets/index.ts",
      "default": "./src/presets/index.ts"
    },
    "./schema": {
      "types": "./src/schema/index.ts",
      "default": "./src/schema/index.ts"
    },
    "./server": {
      "types": "./src/server/index.ts",
      "default": "./src/server/index.ts"
    },
    "./vue": {
      "types": "./src/vue/index.ts",
      "default": "./src/vue/index.ts"
    }
  }
}
```

根入口导出通用类型：

```ts
export type RichTextDocument
export type RichTextFeature
export type RichTextPreset
export type RichTextToolbarLayout
```

`./presets` 导出：

```ts
export { compactRichTextPreset }
export { compactRichTextToolbarLayout }
```

`./schema` 导出：

```ts
export { richTextDocumentSchema, hasNonBlankRichText }
```

`./server` 导出：

```ts
export { deriveRichTextContent, RichTextContentInvalidError }
```

`./vue` 导出：

```ts
export { default as RichTextEditor } from './RichTextEditor.vue'
```

## 依赖边界

依赖按入口分层：

- `@rev30/rich-text`、`@rev30/rich-text/schema`、`@rev30/rich-text/presets` 不依赖 Vue、Naive UI、sanitize-html。
- `@rev30/rich-text/vue` 依赖 `vue`、`@tiptap/vue-3`、`naive-ui` 和当前 Tiptap editor 运行所需包。
- `@rev30/rich-text/server` 依赖 `@tiptap/core`、`@tiptap/html/server`、`@tiptap/pm` 和 `sanitize-html`。
- `apps/client` 依赖 `@rev30/rich-text`、`@rev30/rich-text/presets` 和 `@rev30/rich-text/vue`。
- `apps/server` 依赖 `@rev30/rich-text/presets` 和 `@rev30/rich-text/server`。
- `packages/contracts` 依赖 `@rev30/rich-text/schema` 复用基础 schema/helper。

## 图标策略

图标属于 feature shared 元数据，使用项目约定的 Iconify 原子类，格式为 `i-[collection--name]`：

```ts
icon: 'i-[lucide--bold]'
```

Vue toolbar item 默认复用 feature icon：

```vue
<span :class="item.icon" aria-hidden="true" />
```

为了让 Tailwind/Iconify 在构建期生成包内图标 class，`apps/client/src/style.css` 需要扫描 rich-text 包源码。推荐写法：

```css
@source "@rev30/rich-text";
```

如果当前 Tailwind/Vite 对 workspace 包名解析不稳定，则使用 workspace symlink 路径作为兼容写法：

```css
@source "../node_modules/@rev30/rich-text";
```

业务后续如需调整图标，应通过自定义 toolbar item 或 feature 变体实现，不在第一阶段加入全局图标覆盖 API。

## Vue 组件

`RichTextEditor` 面向当前项目的 Naive UI 交互风格，第一阶段 API：

```vue
<RichTextEditor
  :model-value="state.value"
  :preset="compactRichTextPreset"
  :toolbar-layout="compactRichTextToolbarLayout"
  :disabled="isLoading || isSaving"
  :min-height="240"
  @blur="field.handleBlur"
  @update:model-value="field.handleChange"
/>
```

props：

- `modelValue: RichTextDocument`
- `preset: RichTextPreset`
- `toolbarLayout?: RichTextToolbarLayout`
- `disabled?: boolean`
- `minHeight?: number`

事件：

- `update:modelValue`
- `blur`

行为：

- 根据 preset 合并 Tiptap extensions。
- 根据 toolbar layout 渲染 `NButtonGroup`。
- 一个 toolbar item 对应一个 button；后续复杂 feature 可以扩展为 popover 或 dialog。
- 不传 `toolbarLayout` 时使用 preset 对应默认 layout；第一阶段只需要为 `compactRichTextPreset` 提供默认 layout。
- 同步外部 `modelValue` 到 editor。
- editor 更新时 emit Tiptap JSON。
- `disabled` 变化时更新 editor editability。
- 组件卸载时销毁 editor。

第一阶段不增加 toolbar 自定义 slot、按钮覆盖、图片上传、链接弹窗等高级 API。链接能力先保持当前服务端安全策略；如果后续需要前端链接插入 UI，再作为 `linkFeature` 的 Vue adapter 扩展。

## Schema 与 contracts

`@rev30/rich-text/schema` 只导出基础能力，不绑定业务文案：

```ts
export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

export function hasNonBlankRichText(value: unknown): boolean
```

业务 schema 自己组合 refine 和错误文案。公告模块迁移后形态：

```ts
const announcementContentJsonInputSchema = richTextDocumentSchema.refine(hasNonBlankRichText, {
  message: '请输入正文',
})
```

如果业务需要“正文格式无效”这种根节点错误文案，应在业务 schema 中定义或包装，不放入富文本包。这样 rich-text 包保持业务无关，contracts 继续负责用户语义。

`RichTextDocument` 类型从 rich-text 包导出，contracts 可以复用并再导出，以减少现有前端调用点改动。

## 服务端派生

`deriveRichTextContent` 负责当前公告 `deriveAnnouncementContent` 的通用部分：

```ts
deriveRichTextContent(contentJson, {
  preset: compactRichTextPreset,
})
```

返回：

```ts
{
  text: string
  html: string
}
```

流程：

1. 根据 preset features 收集 Tiptap extensions。
2. 使用 `getSchema()` 构建 ProseMirror schema。
3. 使用 `ProseMirrorNode.fromJSON()` 验证并创建 document node。
4. 使用 `document.textBetween(0, document.content.size, '\n\n')` 提取纯文本并 trim。
5. 如果纯文本为空，抛出 `RichTextContentInvalidError`。
6. 使用 `@tiptap/html/server` 的 `generateHTML()` 生成 HTML。
7. 根据 preset features 的 server policy 合并 sanitize 配置。
8. 返回安全 HTML 和纯文本。

公告模块只保留业务错误映射：

```ts
try {
  return deriveRichTextContent(contentJson, { preset: compactRichTextPreset })
} catch (error) {
  if (error instanceof RichTextContentInvalidError) {
    throw new AnnouncementContentInvalidError()
  }

  throw error
}
```

## Sanitize 策略

sanitize policy 由 feature server adapter 贡献。

当前能力需要允许：

- `p`
- `h1`
- `h2`
- `h3`
- `strong`
- `em`
- `u`
- `s`
- `blockquote`
- `ul`
- `ol`
- `li`
- `hr`
- `br`
- `a`
- `code`
- `pre`

链接策略保持当前行为：

- `a` 允许 `href`、`target`、`rel`。
- 允许协议为 `http`、`https`、`mailto`、`tel`。
- `allowProtocolRelative` 为 `false`。
- 所有链接强制 `target="_blank"`。
- 所有链接强制 `rel="noopener noreferrer nofollow"`。
- 不安全协议的 `href` 被移除。

合并规则第一阶段保持简单：

- `allowedTags` 合并去重。
- `allowedAttributes` 按 tag 合并去重。
- `allowedSchemes` 合并去重。
- `transformTags` 按 tag 合并；当前只有 `linkFeature` 定义 `a` transform，不处理多 feature 同 tag transform 组合问题。

如果后续多个 feature 需要处理同一 tag 的 transform，再引入 transform pipeline。

## 公告迁移方式

客户端：

- `apps/client/src/features/content/RichTextEditor.vue` 被 `@rev30/rich-text/vue` 替代。
- `AnnouncementFormDrawer.vue` 直接导入 `RichTextEditor`、`compactRichTextPreset`，必要时导入 `compactRichTextToolbarLayout`。
- 原本针对 editor 组件内部 toolbar 的测试迁移到 `packages/rich-text`。
- 表单层测试保留 blur/update/error 集成验证。

服务端：

- `apps/server/src/modules/content/announcements/content.ts` 保留或改为很薄的业务适配层。
- 该适配层调用 `deriveRichTextContent(contentJson, { preset: compactRichTextPreset })`。
- 捕获 `RichTextContentInvalidError` 并转换为 `AnnouncementContentInvalidError`。
- repository 中派生 `contentText`、`contentHtml` 的调用位置不变。

contracts：

- `tiptapDocumentSchema` 替换为 rich-text 包导出的 `richTextDocumentSchema`。
- `hasNonBlankTiptapText` 替换为 `hasNonBlankRichText`。
- `TiptapDocument` 类型可以兼容导出，减少外部改动；后续可逐步重命名为 `RichTextDocument`。

## 测试策略

`packages/rich-text` 包内测试：

- `schema.test.ts`: `richTextDocumentSchema` 和 `hasNonBlankRichText` 行为与当前 contracts 一致。
- `presets/compact.test.ts`: compact preset 包含当前所有 feature，且不会注册重复 extension。
- `server/derive.test.ts`: JSON 验证、纯文本提取、HTML 生成、sanitize、link 安全策略、空文档拒绝、不支持节点拒绝。
- `server/derive.test.ts`: 确认使用 `@tiptap/html/server` entry。
- `vue/RichTextEditor.test.ts`: 渲染内容、toolbar layout 分组、按钮存在、更新事件、外部值同步、disabled 切换。

`apps/server` 保留业务集成测试：

- 无效富文本映射为 `AnnouncementContentInvalidError`。
- create/update 继续派生 `contentText` 和 `contentHtml`。
- routes/repository 行为不变。

`apps/client` 保留业务集成测试：

- `AnnouncementFormDrawer` 能使用富文本组件。
- blur/update 与表单字段联动不变。
- `MyAnnouncementDetailDrawer` 继续渲染服务端生成的 HTML。

常用验证命令：

```bash
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/contracts test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
pnpm check
```

## 后续扩展方向

结构稳定后，再按 feature 增量对齐 TinyMCE open-source 能力。每个新能力应遵循同一目录约定：

```txt
features/<name>/shared.ts
features/<name>/vue.ts
features/<name>/server.ts
```

如果某个 feature 只影响编辑体验而不影响文档结构或 HTML 输出，可以只提供 `shared.ts` 和 `vue.ts`。如果某个 feature 只影响服务端导入/导出，可以只提供 `shared.ts` 和 `server.ts`。

复杂 feature 示例：

- `tableFeature`: shared 定义 table extensions，vue 提供 dropdown 或 menu，server 允许 table 相关 tags/attributes。
- `imageFeature`: shared 定义 image extension，vue 提供上传/插入 UI，server 限制 `img` attributes 和 URL 策略。
- `codeBlockFeature`: shared 定义 code block extension，vue 提供语言选择，server 允许 `pre/code` class 或 language attrs。

第一阶段不提前实现这些 feature，也不提前设计上传协议。
