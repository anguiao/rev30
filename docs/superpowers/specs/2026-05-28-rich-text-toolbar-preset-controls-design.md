# 富文本工具栏预设复杂控件设计

## 背景

项目已经新增 `@rev30/rich-text` workspace 包，并由通知公告模块使用：

- 前端表单从 `@rev30/rich-text/vue` 引入 `RichTextEditor`。
- 前端表单从 `@rev30/rich-text/vue/presets` 引入 `compactRichTextEditorPreset`。
- 服务端从 `@rev30/rich-text/server/presets` 引入 `compactRichTextServerPreset`，并通过 `deriveRichTextContent` 派生纯文本和安全 HTML。

当前富文本包的 toolbar 模型只有两类 control：

```ts
type RichTextToolbarControlConfig =
  | RichTextToolbarButtonControl
  | RichTextToolbarDropdownControl
```

这适合加粗、斜体、标题、列表、引用、分割线、撤销和重做等简单命令。但 Highlight 和 Link 不是单纯的 button 或 dropdown：

- Highlight 需要颜色面板、当前颜色状态和清除高亮动作。
- Link 需要 URL 输入、应用、移除、URL 规范化、协议校验、读取当前链接和恢复 selection。
- 后续图片、Mention、表格、Emoji 等能力也会有自己的局部状态、弹层和异步逻辑。

同时，当前 `RichTextEditor` 还存在 `toolbar?: RichTextToolbarConfig` prop，`@rev30/rich-text/vue` 也公开导出了 toolbar DSL。这个边界会鼓励应用层绕过 preset 直接拼 toolbar，与当前产品预期不一致。

本阶段的核心方向是：

```txt
应用层只能选择内置 preset。
toolbar 仍然由 preset 内部声明。
toolbar runtime 支持复杂 component control。
component control 和 toolbar DSL 暂不作为 public API 暴露。
```

## 目标

- 支持 Highlight 和 Link 这类复杂 toolbar 控件。
- 让 `RichTextToolbarControlConfig` 内部支持 `component` control。
- 保持应用层 API 收敛：业务只传入内置 `RichTextEditorPreset`。
- 移除 `RichTextEditor` 的 `toolbar` prop。
- 不开放 toolbar slot。
- 不从 public entry 暴露 toolbar DSL、toolbar config 类型和 custom toolbar helper。
- 将 Highlight 和 Link 加入现有 `compact` preset，使当前通知公告编辑器直接获得这两个能力。
- 本阶段直接扩展现有 `compactRichTextEditorPreset` 和 `compactRichTextServerPreset`，不新增 `standard` 或其他富文本 preset。
- 同步补齐 server preset 和 sanitizer 策略，保证 `contentHtml` 展示安全且不会丢失已支持的富文本语义。
- 为后续开放自定义 preset 或完全覆盖 toolbar 保留内部结构扩展点。

## 非目标

本阶段不实现：

- 业务方传入自定义 `toolbar`。
- 业务方通过 slot 完全覆盖 toolbar。
- 业务方传入自定义 toolbar component。
- 对外公开 `defineRichTextToolbar`、`richTextToolbarButton`、`richTextToolbarDropdown`、`richTextToolbarComponent`。
- 对外公开 `RichTextToolbarConfig`、`RichTextToolbarControlConfig`、`RichTextCommand` 等 toolbar DSL 类型。
- 开放 `defineRichTextEditorPreset` 或 `defineRichTextServerPreset` 给业务方自定义 preset。
- 新增移动端独立 toolbar 子视图。
- 开放任意 highlight 颜色输入。
- 允许任意 URL 协议。
- 新增图片上传、附件上传、表格、Mention、Emoji、HTML 源码编辑等能力。

## Public API 边界

### RichTextEditor props

`RichTextEditor` 面向应用层只接受 preset，不接受独立 toolbar：

```ts
defineProps<{
  modelValue: RichTextDocument
  preset: RichTextEditorPreset
  disabled?: boolean
  minHeight?: number
}>()
```

内部只从 preset 读取 toolbar：

```ts
const activeToolbar = computed(() => props.preset.toolbar)
const richTextPreset = computed(() => props.preset.preset)
```

不支持以下用法：

```vue
<RichTextEditor
  v-model="content"
  :preset="compactRichTextEditorPreset"
  :toolbar="customToolbar"
/>
```

也不支持以下用法：

```vue
<RichTextEditor>
  <template #toolbar="{ editor, disabled }">
    <MyToolbar :editor="editor" :disabled="disabled" />
  </template>
</RichTextEditor>
```

### Vue public exports

`@rev30/rich-text/vue` 只公开编辑器组件、编辑器 composable 和必要 preset 类型：

```ts
export { default as RichTextEditor } from './RichTextEditor.vue'
export { useRichTextEditor } from './useRichTextEditor'
export type { RichTextEditorPreset } from './presets/types'
```

`@rev30/rich-text/vue/presets` 只公开内置 editor preset 和必要类型：

```ts
export { compactRichTextEditorPreset } from './compact'
export type { RichTextEditorPreset } from './types'
```

短期不公开：

```ts
defineRichTextEditorPreset
defineRichTextCommand
defineRichTextToolbar
richTextToolbarButton
richTextToolbarDropdown
richTextToolbarComponent

RichTextCommand
RichTextToolbarConfig
RichTextToolbarControlConfig
RichTextToolbarGroup
RichTextToolbarButtonControl
RichTextToolbarDropdownControl
RichTextToolbarComponentControl
```

这些类型和 helper 可以继续存在于包内部模块，例如：

```txt
packages/rich-text/src/vue/toolbar/types.ts
packages/rich-text/src/vue/presets/types.ts
```

但不从 public entry 暴露。

### Server public exports

`@rev30/rich-text/server` 保持当前派生能力：

```ts
export { deriveRichTextContent, RichTextContentInvalidError }
```

`@rev30/rich-text/server/presets` 只公开内置 server preset 和必要类型：

```ts
export { compactRichTextServerPreset }
export type { RichTextServerPreset }
```

不公开 `defineRichTextServerPreset`，避免业务侧绕过内置 server preset 拼装 HTML policy。

## Toolbar Control 模型

### 内部 DSL

`button`、`dropdown` 和 `component` 都是 `@rev30/rich-text` 内部用来描述 preset toolbar 的 DSL，不作为稳定 public API 承诺。

简单控件继续使用 command：

- Bold
- Italic
- Underline
- Heading
- List
- Blockquote
- HorizontalRule
- Undo
- Redo

这些控件的模型是：

```txt
点击控件 -> 执行 editor command -> 根据 editor 状态更新 active / disabled
```

复杂控件使用 component control：

- Highlight
- Link
- 后续 ImageUpload、Mention、Table、Emoji、Color 等能力

这些控件自己处理局部状态、popover、input、校验、selection 和异步逻辑。

### 类型设计

`packages/rich-text/src/vue/toolbar/types.ts` 内部新增 component control：

```ts
import type { Editor } from '@tiptap/core'
import type { Component } from 'vue'

export type RichTextIconClass = `i-[${string}--${string}]`

export interface RichTextCommand {
  key: string
  label: string
  icon: RichTextIconClass
  run: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
}

export interface RichTextToolbarButtonControl {
  type: 'button'
  command: RichTextCommand
}

export interface RichTextToolbarDropdownControl {
  type: 'dropdown'
  key: string
  label: string
  icon: RichTextIconClass
  commands: RichTextCommand[]
  getActiveCommand?: (editor: Editor, commands: RichTextCommand[]) => RichTextCommand | undefined
}

export interface RichTextToolbarComponentControl {
  type: 'component'
  key: string
  component: Component
  props?: Record<string, unknown>
}

export type RichTextToolbarControlConfig =
  | RichTextToolbarButtonControl
  | RichTextToolbarDropdownControl
  | RichTextToolbarComponentControl

export interface RichTextToolbarGroup {
  key: string
  controls: RichTextToolbarControlConfig[]
}

export interface RichTextToolbarConfig {
  groups: RichTextToolbarGroup[]
}
```

新增内部 helper：

```ts
export function richTextToolbarComponent(
  control: Omit<RichTextToolbarComponentControl, 'type'>,
): RichTextToolbarComponentControl {
  return {
    type: 'component',
    ...control,
  }
}
```

### 渲染逻辑

`RichTextToolbarControl.vue` 从二分支改为三分支：

```vue
<template>
  <RichTextToolbarButton
    v-if="control.type === 'button'"
    :command="control.command"
    :editor="editor"
    :disabled="disabled"
  />

  <RichTextToolbarDropdown
    v-else-if="control.type === 'dropdown'"
    :control="control"
    :editor="editor"
    :disabled="disabled"
  />

  <component
    :is="control.component"
    v-else
    :editor="editor"
    :disabled="disabled"
    v-bind="control.props"
  />
</template>
```

所有 component control 默认接收：

```ts
editor: Editor | null
disabled: boolean
```

复杂控件自行处理 active、disabled、popover、input、focus 等状态。

## Highlight Feature

### 依赖与目录

新增依赖：

```txt
@tiptap/extension-highlight
```

新增目录：

```txt
packages/rich-text/src/features/highlight/
  shared.ts
  vue.ts
  server.ts
  vue/HighlightToolbarControl.vue
```

### shared adapter

`shared.ts` 定义 Tiptap extension。根据 Tiptap 3 文档，Highlight 需要开启 `multicolor` 才能保存颜色：

```ts
import { Highlight } from '@tiptap/extension-highlight'
import { defineRichTextFeature } from '../../core/feature'

export const highlightFeature = defineRichTextFeature({
  key: 'highlight',
  extension: () =>
    Highlight.configure({
      multicolor: true,
    }),
})
```

### vue adapter

`vue.ts` 使用内部 component control：

```ts
import { richTextToolbarComponent } from '../../vue/toolbar/types'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'

export const highlightToolbarControl = richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: [
      { key: 'yellow', label: '黄色', value: '#fef08a' },
      { key: 'green', label: '绿色', value: '#bbf7d0' },
      { key: 'blue', label: '蓝色', value: '#bfdbfe' },
      { key: 'pink', label: '粉色', value: '#fbcfe8' },
    ],
  },
})
```

颜色只允许固定 palette，不提供任意输入。

本阶段固定 palette 为：

| key | label | value |
| --- | --- | --- |
| `yellow` | 黄色 | `#fef08a` |
| `green` | 绿色 | `#bbf7d0` |
| `blue` | 蓝色 | `#bfdbfe` |
| `pink` | 粉色 | `#fbcfe8` |

### toolbar 行为

`HighlightToolbarControl.vue` 使用 `NPopover` 承载颜色面板。

trigger button：

- 图标：`i-[lucide--highlighter]`
- `data-test`: `rich-text-highlight`
- 当前 selection 有 highlight 时 active。
- `props.disabled || !editor` 时 disabled。

popover：

- 展示固定颜色按钮。
- 每个颜色按钮使用颜色色块，不使用纯文字矩形作为主要识别。
- 打开时根据 `editor.getAttributes('highlight').color` 标记当前 selection 对应的颜色。
- 当前颜色命中固定 palette 时，对应颜色色块显示选中态。
- 当前颜色未命中固定 palette 或没有 highlight 时，不选中任何颜色色块。
- 提供清除按钮，清除当前 selection 的 highlight。
- disabled 状态下不能打开或执行 command。

执行命令：

```ts
editor.chain().focus().toggleHighlight({ color }).run()
editor.chain().focus().unsetHighlight().run()
```

状态读取：

```ts
editor.isActive('highlight')
editor.getAttributes('highlight').color
```

### server policy

`server.ts` 贡献 `mark` 标签的安全 HTML 策略。

服务端派生 HTML 时保留 Tiptap Highlight 默认的 `data-color` 和受控 inline style。处理策略：

- 允许 `<mark>` 标签。
- 允许 `<mark>` 的 `data-color` 和 `style` 属性。
- sanitizer transform 只识别固定 palette 对应的 Tiptap Highlight 输出。
- Tiptap Highlight 默认会通过 `data-color` 和 `style.backgroundColor` 保存颜色；服务端优先使用 `data-color` 判断颜色归属，`style.backgroundColor` 只作为兼容输入。
- 匹配到固定 palette 后，输出 `data-color="<color>"` 和 `style="background-color: <color>; color: inherit"`。
- 未匹配固定 palette 的 highlight 降级为无颜色 `<mark>`，丢弃 `data-color` 和 `style`，不自动改写为默认 palette 颜色。
- 无颜色 `<mark>` 依赖浏览器默认高亮作为反馈；如果项目样式覆盖了 `<mark>` 默认样式，应在展示样式中为裸 `<mark>` 提供默认高亮背景，但不写入 `data-color`。
- 不允许除固定 highlight palette 以外的任意 inline style。
- 实现时可以结合 `transformTags` 和 `allowedStyles`，先规范化 Tiptap 输出，再由 sanitizer 保底过滤 CSS 属性和值。

示例输出：

```html
<mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">维护通知</mark>
```

当前公告详情通过 `v-html="visibleDetail.contentHtml"` 渲染，固定 palette 的 inline style 可以直接还原展示效果。后续如果改为 design token 或 CSS variable，必须同步更新 sanitizer 的固定白名单。

## Link Feature

### 依赖与目录

新增依赖：

```txt
@tiptap/extension-link
```

新增目录：

```txt
packages/rich-text/src/features/link/
  shared.ts
  vue.ts
  server.ts
  vue/LinkToolbarControl.vue
```

### shared adapter

根据 Tiptap 3 文档，Link 支持 `openOnClick`、`enableClickSelection`、`autolink`、`linkOnPaste`、`defaultProtocol` 和 `isAllowedUri`。

本阶段允许自动链接：用户输入或粘贴合法 URL 时，编辑器可以自动创建 link mark。无协议 URL 按 `defaultProtocol: 'https'` 处理。

```ts
import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'

const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function normalizeUrlForProtocolCheck(url: string, defaultProtocol: string) {
  const trimmedUrl = url.trim()

  if (/^[a-z][a-z\d+.-]*:/i.test(trimmedUrl)) {
    return trimmedUrl
  }

  return `${defaultProtocol}://${trimmedUrl}`
}

export const linkFeature = defineRichTextFeature({
  key: 'link',
  extension: () =>
    Link.configure({
      openOnClick: false,
      enableClickSelection: true,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
      isAllowedUri: (url, ctx) => {
        if (!ctx.defaultValidate(url)) {
          return false
        }

        try {
          const normalizedUrl = normalizeUrlForProtocolCheck(url, ctx.defaultProtocol)

          return allowedProtocols.has(new URL(normalizedUrl).protocol)
        } catch {
          return false
        }
      },
    }),
})
```

URL 解析属于用户输入边界，允许在这里使用 `try/catch` 做协议校验。

### vue adapter

`vue.ts` 使用内部 component control：

```ts
import { richTextToolbarComponent } from '../../vue/toolbar/types'
import LinkToolbarControl from './vue/LinkToolbarControl.vue'

export const linkToolbarControl = richTextToolbarComponent({
  key: 'link',
  component: LinkToolbarControl,
})
```

### toolbar 行为

`LinkToolbarControl.vue` 使用 `NPopover`、`NInput` 和图标操作按钮。

trigger button：

- 图标：`i-[lucide--link]`
- `data-test`: `rich-text-link`
- 当前 selection 有 link 时 active。
- `props.disabled || !editor` 时 disabled。

popover：

- URL input，`data-test`: `rich-text-link-url`。
- 输入框回车时应用当前 URL。
- 输入框尾部提供一个图标按钮作为补充应用入口，图标使用 `i-[lucide--check]` 或同等语义图标。
- 当前 selection 有 link 时展示移除链接图标按钮，图标使用 `i-[lucide--unlink]`。
- 展示新窗口打开图标按钮，图标使用 `i-[lucide--external-link]`。
- 新窗口打开按钮使用当前输入框内的规范化 href；输入框为空时使用当前 link href；没有合法 href 时 disabled。
- 新窗口打开方式为新窗口或新标签页，并使用 `noopener,noreferrer`。
- popover 内操作按钮都使用图标展示，并通过 `title` 或 `aria-label` 提供可访问名称。
- 打开时读取当前 link href 并预填 input。
- disabled 状态下不能打开或执行 command。

URL 规则：

- 输入先 `trim()`。
- 空输入视为移除当前 link。
- 无协议输入自动补 `https://`。
- 只允许 `http:`、`https:`、`mailto:`、`tel:`。
- 禁止 `javascript:`、`data:`、`vbscript:` 和其他未知协议。
- 非法输入不写入 editor，input 显示 error 状态，补充应用按钮和新窗口打开按钮 disabled。

规范化 helper：

```ts
const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function normalizeHref(value: string) {
  const href = value.trim()

  if (!href) {
    return ''
  }

  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return href
  }

  return `https://${href}`
}

function isAllowedHref(href: string) {
  try {
    return allowedProtocols.has(new URL(href).protocol)
  } catch {
    return false
  }
}
```

设置链接：

```ts
editor
  .chain()
  .focus()
  .extendMarkRange('link')
  .setLink({ href: normalizedHref })
  .run()
```

移除链接：

```ts
editor
  .chain()
  .focus()
  .extendMarkRange('link')
  .unsetLink()
  .run()
```

状态读取：

```ts
editor.isActive('link')
editor.getAttributes('link').href
```

### server policy

`server.ts` 贡献 `<a>` 标签的安全 HTML 策略：

- 允许 `<a>`。
- 允许 `href`、`target`、`rel`。
- 允许协议：`http`、`https`、`mailto`、`tel`。
- `allowProtocolRelative` 保持 `false`。
- 所有链接强制 `target="_blank"`。
- 所有链接强制 `rel="noopener noreferrer nofollow"`。
- 不允许事件属性，例如 `onclick`。
- 不安全协议的 `href` 必须被移除或整段 link mark 被降级为纯文本，不能保留危险 URL。

## Compact Preset 调整

### core preset

`packages/rich-text/src/presets/compact.ts` 加入：

```ts
highlightFeature,
linkFeature,
```

示意：

```ts
export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    baseFeature,
    historyFeature,
    boldFeature,
    italicFeature,
    underlineFeature,
    highlightFeature,
    linkFeature,
    headingFeature,
    blockquoteFeature,
    listFeature,
    horizontalRuleFeature,
  ],
})
```

### Vue preset

`packages/rich-text/src/vue/presets/compact.ts` 在 marks group 加入 Highlight 和 Link：

```ts
export const compactRichTextToolbar = defineRichTextToolbar([
  { key: 'history', controls: historyCommands.map(button) },
  {
    key: 'marks',
    controls: [
      button(boldCommand),
      button(italicCommand),
      button(underlineCommand),
      highlightToolbarControl,
      linkToolbarControl,
    ],
  },
  {
    key: 'blocks',
    controls: [
      dropdown({
        key: 'heading',
        label: '标题',
        icon: 'i-[lucide--heading]',
        commands: headingCommands,
      }),
      dropdown({
        key: 'list',
        label: '列表',
        icon: 'i-[lucide--list]',
        commands: listCommands,
      }),
      button(blockquoteCommand),
    ],
  },
  { key: 'insert', controls: [button(horizontalRuleCommand)] },
])
```

### Server preset

`packages/rich-text/src/server/presets/compact.ts` 加入：

```ts
highlightHtmlPolicy,
linkHtmlPolicy,
```

`compactRichTextServerPreset` 必须和 core preset 的文档能力保持一致。当前 server 测试会拒绝 link mark；加入 Link feature 后应改为接受安全 link，并继续拒绝 unsupported node/mark。

## 数据流

编辑时：

```txt
AnnouncementFormDrawer
  -> RichTextEditor(preset = compactRichTextEditorPreset)
  -> useRichTextEditor(preset.preset)
  -> Tiptap extensions
  -> RichTextToolbar(preset.toolbar)
  -> button / dropdown / component controls
```

保存时：

```txt
contentJson
  -> deriveAnnouncementContent
  -> deriveRichTextContent(contentJson, compactRichTextServerPreset)
  -> ProseMirror schema validation
  -> textBetween 派生 contentText
  -> generateHTML
  -> sanitizeRichTextHtml
  -> contentHtml
```

要求：

- Vue editor preset 和 server preset 使用同一份 core `compactRichTextPreset`。
- 前端允许写入的 mark，服务端必须能验证、生成和 sanitize。
- 服务端 sanitizer 是 `contentHtml` 的安全边界，不能依赖前端输入已经安全。

## 前端交互

工具栏继续使用当前紧凑排列和 Naive UI 组件。

新增控件放在 marks group 中，顺序为：

```txt
bold -> italic -> underline -> highlight -> link
```

Highlight popover 使用色板按钮。Link popover 使用输入框和明确的应用/移除操作。

所有新增按钮必须具备：

- 可访问名称或 `aria-label`。
- `data-test`，便于测试稳定定位。
- active 状态。
- disabled 状态。
- 不因 popover 内容变化造成 toolbar 布局跳动。

## 安全边界

Link 安全边界：

- 前端 toolbar 先校验并阻止明显非法 URL。
- Tiptap Link extension 使用 `isAllowedUri` 再做编辑器层校验。
- 服务端 sanitizer 最终限制协议和 HTML 属性。

Highlight 安全边界：

- 前端只提供固定 palette。
- Tiptap JSON 中只预期出现固定 palette 的 color。
- 服务端 sanitizer 只保留固定 palette 对应的 highlight inline style。
- 展示页通过 `mark[data-color][style]` 还原颜色。

公共 API 安全边界：

- 应用层不能传 toolbar config。
- 应用层不能传 toolbar component。
- 应用层不能 import toolbar DSL helper。
- 内置 preset 是唯一公开组合点。

## 测试策略

`packages/rich-text` 包内测试：

- `vue/RichTextEditor.test.ts`：`RichTextEditor` 不接受独立 `toolbar` prop；没有 toolbar 的 preset 不渲染 toolbar。
- `vue/RichTextEditor.test.ts`：渲染 compact preset 时展示 Highlight 和 Link 控件；该测试只覆盖 preset 集成，不覆盖控件内部行为。
- `features/highlight/vue/HighlightToolbarControl.test.ts`：选择固定颜色后，model JSON 出现 highlight mark；清除后 mark 消失。
- `features/highlight/vue/HighlightToolbarControl.test.ts`：popover 打开时，当前 selection 的颜色命中固定 palette 时，对应颜色色块显示选中态。
- `features/highlight/vue/HighlightToolbarControl.test.ts`：disabled 为 true 时 trigger disabled，且不能执行 command。
- `features/link/vue/LinkToolbarControl.test.ts`：输入 `example.com` 并按回车后，model JSON 出现 `href: 'https://example.com'`；再次打开时 input 预填当前 href；移除后 link mark 消失。
- `features/link/vue/LinkToolbarControl.test.ts`：补充应用、新窗口打开和移除操作提供可访问名称。
- `features/link/vue/LinkToolbarControl.test.ts`：点击新窗口打开按钮时，使用规范化后的合法 href 打开新窗口或新标签页。
- `features/link/vue/LinkToolbarControl.test.ts`：输入 `javascript:alert(1)`、`data:text/html;base64,...`、`vbscript:...` 时不会写入 link mark。
- `features/link/vue/LinkToolbarControl.test.ts`：disabled 为 true 时 trigger disabled，且不能执行 command。
- `features/link/server.test.ts`：link HTML policy 输出带安全 `target` 和 `rel` 的 `<a>`。
- `features/link/server.test.ts`：link HTML policy 拒绝或净化危险 href。
- `features/highlight/server.test.ts`：highlight HTML policy 接受固定 palette color，输出带 `data-color` 和受控 inline style 的 `<mark>`。
- `features/highlight/server.test.ts`：highlight HTML policy 遇到非固定 palette color 时，降级为无颜色 `<mark>`，并移除 `data-color` 和 `style`。
- `server/derive.test.ts`：`deriveRichTextContent` 继续覆盖通用派生管线，包括 schema 验证、纯文本提取、HTML 生成、sanitize 组合和 unsupported node/mark 失败。
- `presets/compact.test.ts`：compact preset 支持 link 和 highlight 文档能力。

应用侧测试：

- `AnnouncementFormDrawer` 继续能使用 `RichTextEditor`，表单 `blur`、`update:modelValue` 和错误展示行为不变。

公共导出检查：

- 业务 import 仍使用：

```ts
import { RichTextEditor } from '@rev30/rich-text/vue'
import { compactRichTextEditorPreset } from '@rev30/rich-text/vue/presets'
```

- public entry 不再暴露 toolbar DSL 和自定义 preset helper。
- 项目内没有业务代码从 `@rev30/rich-text/vue` 引入 `RichTextToolbarConfig`、`defineRichTextToolbar` 或 toolbar helper。

常用验证：

```bash
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/client test
pnpm --filter @rev30/server test
pnpm typecheck
pnpm lint:check
pnpm check
```

## Review Checklist

后续 code review 重点检查：

- `RichTextEditor` 是否仍然只能通过 preset 驱动 toolbar。
- 是否没有新增 toolbar slot。
- 是否没有公开 `toolbar` prop。
- 是否没有公开 toolbar DSL。
- 是否没有公开自定义 editor/server preset helper。
- `component` control 是否只作为内部 preset 能力使用。
- Highlight 是否使用固定 palette。
- Highlight 最终 HTML 是否只保留固定 palette 对应的受控 inline style。
- Link 是否限制 URL 协议。
- Link 是否正确处理 `extendMarkRange('link')`。
- Disabled 状态是否覆盖复杂控件。
- Vue preset、core preset 和 server preset 是否保持能力一致。
- 测试是否覆盖 toolbar 渲染、Highlight、Link、非法 URL、server sanitizer 和 public exports。

## 后续扩展路径

如果后续需要开放自定义 preset，可以重新评估并公开：

```ts
defineRichTextPreset
defineRichTextEditorPreset
defineRichTextServerPreset
defineRichTextToolbar
richTextToolbarButton
richTextToolbarDropdown
richTextToolbarComponent
```

届时业务方可以组合自己的 preset，但必须同时考虑：

- core features。
- Vue toolbar controls。
- server HTML policies。
- public API 兼容承诺。

如果后续需要完全覆盖 toolbar，可以新增：

```vue
<RichTextEditor>
  <template #toolbar="{ editor, disabled }">
    <MyToolbar :editor="editor" :disabled="disabled" />
  </template>
</RichTextEditor>
```

或新增：

```ts
toolbar?: RichTextToolbarConfig | false
```

这些能力应等内置 preset、复杂控件模型和 sanitizer 策略稳定后再开放。

## 最终结论

本阶段采用内置 preset 驱动的复杂 toolbar control 模型：

```txt
应用层:
  只能使用内置 preset
  不能传 toolbar
  不能覆盖 toolbar
  不能传自定义 toolbar component

rich-text 包内部:
  core preset 负责组合 Tiptap extensions
  Vue editor preset 负责组合 toolbar
  server preset 负责组合 HTML policy
  toolbar 支持 button / dropdown / component
  Highlight 和 Link 使用 component control
  toolbar DSL 暂不作为 public API
```

这个设计能在不提前开放自定义 toolbar 的前提下支持 Highlight、Link 等复杂控件，并为后续自定义 preset 或完全覆盖 toolbar 保留清晰扩展路径。
