# Rich Text Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@rev30/rich-text` 的 compact preset 增加 authenticated 附件图片上传、统一图片弹窗、固定比例尺寸编辑和服务端 HTML 校验。

**Architecture:** `@rev30/rich-text` 新增 image feature，负责 Tiptap node、toolbar、弹窗、HTML 输出和 sanitize policy；`apps/client` 只提供把 `File` 上传为 authenticated 附件并返回稳定 URL 的 adapter；`apps/server` 只为公告内容配置允许的内部图片 URL。`compact` preset 功能固定为含图片能力，Vue/server 两侧都通过 factory 创建。

**Tech Stack:** Vue 3, Tiptap 3, Naive UI, sanitize-html, Vitest, Hono, pnpm workspace. Tiptap image extension 用法已通过 Context7 `/ueberdosis/tiptap-docs` 确认：安装 `@tiptap/extension-image`，使用 Image extension，并通过 `extend/addAttributes/renderHTML` 扩展自定义属性。

---

## File Structure

- Modify `packages/rich-text/package.json`: add `@tiptap/extension-image`.
- Modify `pnpm-lock.yaml`: dependency lock update.
- Create `packages/rich-text/src/features/image/shared.ts`: image Tiptap extension and image attrs.
- Create `packages/rich-text/src/features/image/server.ts`: image HTML policy factory and URL/style normalization.
- Create `packages/rich-text/src/features/image/vue.ts`: image toolbar control factory and editor command helpers.
- Create `packages/rich-text/src/features/image/vue/ImageToolbarControl.vue`: toolbar button and dialog mode selection.
- Create `packages/rich-text/src/features/image/vue/ImageDialog.vue`: insert/edit dialog, upload flow, fixed-ratio size editing.
- Create `packages/rich-text/src/features/image/vue/image-size.ts`: image natural size loader.
- Create `packages/rich-text/__tests__/features/image/server.test.ts`: image sanitize policy tests.
- Create `packages/rich-text/__tests__/features/image/vue/ImageDialog.test.ts`: dialog upload/edit tests.
- Modify `packages/rich-text/src/presets/compact.ts`: include image feature.
- Modify `packages/rich-text/src/vue/presets/compact.ts`: replace static compact editor preset with `createCompactRichTextEditorPreset({ image })`.
- Modify `packages/rich-text/src/vue/presets/index.ts`: export only the factory and public types.
- Modify `packages/rich-text/src/server/presets/compact.ts`: replace static compact server preset with `createCompactRichTextServerPreset({ image })`.
- Modify `packages/rich-text/src/server/presets/index.ts`: export only the factory and public types.
- Modify `packages/rich-text/__tests__/presets/compact.test.ts`: cover factory-only compact preset and image feature/policy.
- Modify `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`: use the compact factory and expect the image toolbar button.
- Modify `packages/rich-text/__tests__/server/derive.test.ts`: use the compact server factory.
- Modify `apps/client/src/features/content/AnnouncementFormDrawer.vue`: create announcement image upload adapter and factory preset.
- Modify `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`: assert authenticated image upload adapter behavior.
- Modify `apps/server/src/modules/content/announcements/content.ts`: create announcement rich-text server preset with internal image URL validator.
- Modify `apps/server/__tests__/modules/content/announcements/content.test.ts`: cover allowed and rejected image URLs.

## Task 1: Add Image Dependency And Server Policy

**Files:**
- Modify: `packages/rich-text/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/rich-text/src/features/image/shared.ts`
- Create: `packages/rich-text/src/features/image/server.ts`
- Create: `packages/rich-text/__tests__/features/image/server.test.ts`

- [ ] **Step 1: Add the Tiptap image dependency**

Run:

```bash
pnpm --filter @rev30/rich-text add @tiptap/extension-image
```

Expected: `packages/rich-text/package.json` gains `@tiptap/extension-image`, and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write failing image server policy tests**

Create `packages/rich-text/__tests__/features/image/server.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { RichTextContentInvalidError } from '../../../src/server/errors'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'
import { createImageHtmlPolicy } from '../../../src/features/image/server'

const attachmentSrc = '/api/attachments/11111111-1111-4111-8111-111111111111/content'
const imagePolicy = createImageHtmlPolicy({
  isAllowedSrc: (src) => src === attachmentSrc,
})

function getImageAttributes(html: string) {
  const match = /^<img(?<attributes>(?:\s+[^>]+)?) \/>$/.exec(html)
  expect(match).not.toBeNull()

  return Object.fromEntries(
    [...(match?.groups?.attributes ?? '').matchAll(/([a-z-]+)="([^"]*)"/g)].map(
      ([, name, value]) => [name, value],
    ),
  )
}

describe('image html policy', () => {
  it('keeps authenticated attachment images and rebuilds safe style', () => {
    const sanitized = sanitizeRichTextHtml(
      `<img src="${attachmentSrc}" alt="示意图" width="640" height="360" style="position: fixed; inset: 0">`,
      [imagePolicy],
    )

    expect(getImageAttributes(sanitized)).toEqual({
      src: attachmentSrc,
      alt: '示意图',
      width: '640',
      height: '360',
      style: 'width: 640px; max-width: 100%; height: auto',
    })
  })

  it('rejects non-internal image sources', () => {
    expect(() =>
      sanitizeRichTextHtml('<img src="https://example.com/image.png" alt="外部图片" />', [
        imagePolicy,
      ]),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      sanitizeRichTextHtml('<img src="data:image/png;base64,abc" alt="base64" />', [imagePolicy]),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      sanitizeRichTextHtml('<img src="//example.com/image.png" alt="协议相对" />', [imagePolicy]),
    ).toThrow(RichTextContentInvalidError)
  })

  it('drops invalid dimensions and keeps overflow protection', () => {
    const sanitized = sanitizeRichTextHtml(
      `<img src="${attachmentSrc}" alt="示意图" width="0" height="-1" style="width: 9999px">`,
      [imagePolicy],
    )

    expect(getImageAttributes(sanitized)).toEqual({
      src: attachmentSrc,
      alt: '示意图',
      style: 'max-width: 100%; height: auto',
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/features/image/server.test.ts
```

Expected: FAIL because `createImageHtmlPolicy` and `features/image/server.ts` do not exist.

- [ ] **Step 4: Implement the image extension and server policy**

Create `packages/rich-text/src/features/image/shared.ts`:

```ts
import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { defineRichTextFeature } from '../../core/feature'

export interface RichTextImageAttrs {
  src: string
  alt?: string
  width?: number
  height?: number
}

function normalizeDimension(value: unknown) {
  const numberValue = typeof value === 'number' ? value : Number(value)

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function imageStyle(width: number | null) {
  return width === null
    ? 'max-width: 100%; height: auto'
    : `width: ${width}px; max-width: 100%; height: auto`
}

export const imageFeature = defineRichTextFeature({
  key: 'image',
  extension: () =>
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          width: {
            default: null,
            parseHTML: (element) => normalizeDimension(element.getAttribute('width')),
            renderHTML: (attributes) => {
              const width = normalizeDimension(attributes.width)
              return width === null ? {} : { width }
            },
          },
          height: {
            default: null,
            parseHTML: (element) => normalizeDimension(element.getAttribute('height')),
            renderHTML: (attributes) => {
              const height = normalizeDimension(attributes.height)
              return height === null ? {} : { height }
            },
          },
        }
      },
      renderHTML({ HTMLAttributes }) {
        const width = normalizeDimension(HTMLAttributes.width)
        const height = normalizeDimension(HTMLAttributes.height)

        return [
          'img',
          mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
            ...(width === null ? { width: null } : { width }),
            ...(height === null ? { height: null } : { height }),
            style: imageStyle(width),
          }),
        ]
      },
    }),
})
```

Create `packages/rich-text/src/features/image/server.ts`:

```ts
import type sanitizeHtml from 'sanitize-html'
import { RichTextContentInvalidError } from '../../server/errors'
import type { RichTextHtmlPolicy } from '../../server/policy'

export interface RichTextImageServerOptions {
  isAllowedSrc: (src: string) => boolean
}

function normalizeDimension(value: string | undefined) {
  if (!value) return undefined

  const numberValue = Number(value)

  return Number.isInteger(numberValue) && numberValue > 0 ? String(numberValue) : undefined
}

function buildImageStyle(width: string | undefined) {
  return width === undefined
    ? 'max-width: 100%; height: auto'
    : `width: ${width}px; max-width: 100%; height: auto`
}

export function createImageHtmlPolicy(options: RichTextImageServerOptions): RichTextHtmlPolicy {
  const transformImage: sanitizeHtml.Transformer = (tagName, attribs) => {
    const src = attribs.src?.trim() ?? ''

    if (!options.isAllowedSrc(src)) {
      throw new RichTextContentInvalidError()
    }

    const width = normalizeDimension(attribs.width)
    const height = normalizeDimension(attribs.height)

    return {
      tagName,
      attribs: {
        src,
        ...(attribs.alt ? { alt: attribs.alt } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        style: buildImageStyle(width),
      },
    }
  }

  return {
    allowedTags: ['img'],
    allowedAttributes: {
      img: ['src', 'alt', 'width', 'height', 'style'],
    },
    allowedStyles: {
      img: {
        width: [/^\d+px$/],
        'max-width': [/^100%$/],
        height: [/^auto$/],
      },
    },
    transformTags: {
      img: transformImage,
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/features/image/server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rich-text/package.json pnpm-lock.yaml packages/rich-text/src/features/image/shared.ts packages/rich-text/src/features/image/server.ts packages/rich-text/__tests__/features/image/server.test.ts
git commit -m "feat: add rich text image policy"
```

## Task 2: Convert Compact Presets To Required Factories

**Files:**
- Modify: `packages/rich-text/src/presets/compact.ts`
- Modify: `packages/rich-text/src/vue/presets/compact.ts`
- Modify: `packages/rich-text/src/vue/presets/index.ts`
- Modify: `packages/rich-text/src/server/presets/compact.ts`
- Modify: `packages/rich-text/src/server/presets/index.ts`
- Modify: `packages/rich-text/__tests__/presets/compact.test.ts`
- Modify: `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`
- Modify: `packages/rich-text/__tests__/server/derive.test.ts`

- [ ] **Step 1: Write failing compact factory tests**

In `packages/rich-text/__tests__/presets/compact.test.ts`, replace static preset imports with factory imports:

```ts
import { createCompactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { compactRichTextPreset } from '../../src/presets'
import { createCompactRichTextServerPreset } from '../../src/server/presets/compact'
```

Add shared test options near the top:

```ts
const imageUpload = async (file: File) => ({
  src: `/api/attachments/${file.name}/content`,
  alt: file.name,
})
const imageServerOptions = {
  isAllowedSrc: (src: string) =>
    /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
}
```

Update the feature list expectation to include image:

```ts
expect(compactRichTextPreset.features.map((feature) => feature.key)).toEqual([
  'base',
  'history',
  'bold',
  'italic',
  'underline',
  'highlight',
  'link',
  'heading',
  'blockquote',
  'list',
  'horizontal-rule',
  'image',
])
```

Update the editor preset test to create a preset:

```ts
const editorPreset = createCompactRichTextEditorPreset({
  image: {
    accept: 'image/*',
    upload: imageUpload,
  },
})

expect(editorPreset.key).toBe(compactRichTextPreset.key)
expect(editorPreset.features).toBe(compactRichTextPreset.features)

const insert = editorPreset.toolbar?.groups.find((group) => group.key === 'insert')
expect(
  insert?.controls.map((control) =>
    control.type === 'button' ? control.command.key : control.key,
  ) ?? [],
).toEqual(['horizontal-rule', 'image'])
```

Update the server preset test:

```ts
const serverPreset = createCompactRichTextServerPreset({
  image: imageServerOptions,
})

expect(serverPreset.key).toBe(compactRichTextPreset.key)
expect(serverPreset.features).toBe(compactRichTextPreset.features)
expect(serverPreset.htmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toContain('img')
```

In `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`, import and create the preset with image config:

```ts
import { createCompactRichTextEditorPreset } from '../../src/vue/presets'

const compactEditorPreset = createCompactRichTextEditorPreset({
  image: {
    accept: 'image/*',
    upload: async (file) => ({
      src: `/api/attachments/${file.name}/content`,
      alt: file.name,
    }),
  },
})
```

Replace every `preset: compactRichTextEditorPreset` usage in that test file with:

```ts
preset: compactEditorPreset
```

Add `rich-text-image` to `toolbarDataTests`.

In `packages/rich-text/__tests__/server/derive.test.ts`, replace the compact server preset import with:

```ts
const { createCompactRichTextServerPreset } = await import('../../src/server/presets')
const compactServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc: (src) =>
      /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
  },
})
```

Replace every `compactRichTextServerPreset` argument in that test file with `compactServerPreset`.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/presets/compact.test.ts
pnpm --filter @rev30/rich-text test __tests__/vue/RichTextEditor.test.ts
pnpm --filter @rev30/rich-text test __tests__/server/derive.test.ts
```

Expected: FAIL because the compact factory exports and image toolbar control do not exist.

- [ ] **Step 3: Implement compact factories**

Modify `packages/rich-text/src/presets/compact.ts`:

```ts
import { imageFeature } from '../features/image/shared'

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
    imageFeature,
  ],
})
```

Create the image toolbar runtime in `packages/rich-text/src/features/image/vue.ts`:

```ts
import type { Editor } from '@tiptap/core'
import type { RichTextImageAttrs } from './shared'
import { richTextToolbarComponent } from '../../vue/toolbar'
import ImageToolbarControl from './vue/ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

export function insertRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().insertContent({ type: 'image', attrs }).run()
}

export function updateRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().updateAttributes('image', attrs).run()
}

export function imageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    key: 'image',
    component: ImageToolbarControl,
    props: options,
  })
}
```

Create a temporary `packages/rich-text/src/features/image/vue/ImageToolbarControl.vue` so factory tests can mount before the full dialog task:

```vue
<script setup lang="ts">
import { NButton } from 'naive-ui'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextImageAttrs } from '../shared'

interface ImageToolbarControlProps extends RichTextToolbarControlInjectedProps {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

defineProps<ImageToolbarControlProps>()
</script>

<template>
  <NButton data-test="rich-text-image" quaternary size="small" :disabled="disabled || editor === null">
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
</template>
```

Modify `packages/rich-text/src/vue/presets/compact.ts`:

```ts
import { imageToolbarControl, type RichTextImageUploadOptions } from '../../features/image/vue'

export interface CompactRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

function createCompactRichTextToolbar(options: CompactRichTextEditorPresetOptions) {
  return defineRichTextToolbar([
    { key: 'history', controls: historyCommands.map(button) },
    {
      key: 'marks',
      controls: [button(boldCommand), button(italicCommand), button(underlineCommand), highlightToolbarControl, linkToolbarControl],
    },
    {
      key: 'blocks',
      controls: [
        dropdown({ key: 'heading', label: '标题', icon: 'i-[lucide--heading]', commands: headingCommands }),
        dropdown({ key: 'list', label: '列表', icon: 'i-[lucide--list]', commands: listCommands }),
        button(blockquoteCommand),
      ],
    },
    { key: 'insert', controls: [button(horizontalRuleCommand), imageToolbarControl(options.image)] },
  ])
}

export function createCompactRichTextEditorPreset(
  options: CompactRichTextEditorPresetOptions,
): RichTextEditorPreset {
  return defineRichTextEditorPreset({
    ...compactRichTextPreset,
    toolbar: createCompactRichTextToolbar(options),
  })
}
```

Replace `packages/rich-text/src/vue/presets/index.ts`:

```ts
export { createCompactRichTextEditorPreset }
export type { CompactRichTextEditorPresetOptions } from './compact'
export type { RichTextEditorPreset } from './types'
```

Modify `packages/rich-text/src/server/presets/compact.ts`:

```ts
import {
  createImageHtmlPolicy,
  type RichTextImageServerOptions,
} from '../../features/image/server'

export interface CompactRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

function createCompactRichTextHtmlPolicies(options: CompactRichTextServerPresetOptions) {
  return [
    baseHtmlPolicy,
    boldHtmlPolicy,
    italicHtmlPolicy,
    underlineHtmlPolicy,
    highlightHtmlPolicy,
    linkHtmlPolicy,
    headingHtmlPolicy,
    listHtmlPolicy,
    blockquoteHtmlPolicy,
    horizontalRuleHtmlPolicy,
    createImageHtmlPolicy(options.image),
  ]
}

export function createCompactRichTextServerPreset(
  options: CompactRichTextServerPresetOptions,
): RichTextServerPreset {
  return defineRichTextServerPreset({
    ...compactRichTextPreset,
    htmlPolicies: createCompactRichTextHtmlPolicies(options),
  })
}
```

Replace `packages/rich-text/src/server/presets/index.ts`:

```ts
export { createCompactRichTextServerPreset }
export type { CompactRichTextServerPresetOptions } from './compact'
export type { RichTextServerPreset } from './types'
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/presets/compact.test.ts
pnpm --filter @rev30/rich-text test __tests__/vue/RichTextEditor.test.ts
pnpm --filter @rev30/rich-text test __tests__/server/derive.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rich-text/src/presets/compact.ts packages/rich-text/src/vue/presets/compact.ts packages/rich-text/src/vue/presets/index.ts packages/rich-text/src/server/presets/compact.ts packages/rich-text/src/server/presets/index.ts packages/rich-text/src/features/image/vue.ts packages/rich-text/src/features/image/vue/ImageToolbarControl.vue packages/rich-text/__tests__/presets/compact.test.ts packages/rich-text/__tests__/vue/RichTextEditor.test.ts packages/rich-text/__tests__/server/derive.test.ts
git commit -m "feat: add rich text image preset factories"
```

## Task 3: Implement The Image Dialog Interaction

**Files:**
- Modify: `packages/rich-text/src/features/image/vue/ImageToolbarControl.vue`
- Create: `packages/rich-text/src/features/image/vue/ImageDialog.vue`
- Create: `packages/rich-text/src/features/image/vue/image-size.ts`
- Create: `packages/rich-text/__tests__/features/image/vue/ImageDialog.test.ts`

- [ ] **Step 1: Write failing dialog tests**

Create `packages/rich-text/__tests__/features/image/vue/ImageDialog.test.ts`:

```ts
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageToolbarControl from '../../../../src/features/image/vue/ImageToolbarControl.vue'

const editors: Editor[] = []
const wrappers: Array<ReturnType<typeof mount>> = []

function mockImageSize(width = 800, height = 450) {
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = width
      naturalHeight = height
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
}

function createEditor(content = '<p>维护通知</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const extension = imageFeature.extension()

  const editor = new Editor({
    element,
    extensions: [Document, Paragraph, Text, ...(Array.isArray(extension) ? extension : [extension])],
    content,
  })
  editors.push(editor)

  return editor
}

function mountControl(editor: Editor, upload = vi.fn()) {
  const wrapper = mount(ImageToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled: false,
      accept: 'image/*',
      upload,
    },
  })
  wrappers.push(wrapper)

  return wrapper
}

async function chooseFile(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get('[data-test="rich-text-image-file"]')
  Object.defineProperty(input.element, 'files', {
    configurable: true,
    value: [file],
  })
  await input.trigger('change')
  await flushPromises()
}

describe('ImageToolbarControl', () => {
  afterEach(() => {
    while (wrappers.length > 0) wrappers.pop()?.unmount()
    while (editors.length > 0) editors.pop()?.destroy()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uploads inside the insert dialog and inserts the image after confirmation', async () => {
    mockImageSize()
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
      alt: file.name,
    }))
    const editor = createEditor()
    const wrapper = mountControl(editor, upload)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(upload).toHaveBeenCalledOnce()
    expect(editor.getJSON()).toMatchObject({
      content: [
        { type: 'paragraph' },
        {
          type: 'image',
          attrs: {
            src: '/api/attachments/cover.png/content',
            alt: 'cover.png',
            width: 800,
            height: 450,
          },
        },
      ],
    })
  })

  it('keeps insert dialog cancellation from changing the editor', async () => {
    mockImageSize()
    const editor = createEditor()
    const wrapper = mountControl(
      editor,
      vi.fn(async () => ({ src: '/api/attachments/cover/content', alt: 'cover.png' })),
    )

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await chooseFile(wrapper, new File(['image'], 'cover.png', { type: 'image/png' }))
    await wrapper.get('[data-test="rich-text-image-cancel"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"image"')
  })

  it('updates existing image attrs in edit mode with a fixed ratio', async () => {
    mockImageSize(1000, 500)
    const editor = createEditor('<img src="/api/attachments/cover/content" alt="旧说明" width="500" height="250" />')
    editor.commands.setNodeSelection(1)
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-image"]').trigger('click')
    await wrapper.get('[data-test="rich-text-image-alt"] input').setValue('新说明')
    await wrapper.get('[data-test="rich-text-image-width"] input').setValue('600')
    await wrapper.get('[data-test="rich-text-image-confirm"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'image',
          attrs: {
            alt: '新说明',
            width: 600,
            height: 300,
          },
        },
      ],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/features/image/vue/ImageDialog.test.ts
```

Expected: FAIL because `ImageDialog.vue` and the full toolbar behavior do not exist.

- [ ] **Step 3: Implement image size loading**

Create `packages/rich-text/src/features/image/vue/image-size.ts`:

```ts
export interface ImageNaturalSize {
  width: number
  height: number
}

export function loadImageNaturalSize(src: string): Promise<ImageNaturalSize> {
  return new Promise((resolve, reject) => {
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = src
  })
}
```

- [ ] **Step 4: Implement `ImageDialog.vue`**

Create `packages/rich-text/src/features/image/vue/ImageDialog.vue` with these props and emits:

```ts
import { computed, ref, watch } from 'vue'
import { NButton, NFormItem, NInput, NInputNumber, NModal, NSpin } from 'naive-ui'
import type { RichTextImageAttrs } from '../shared'
import { loadImageNaturalSize } from './image-size'

type DialogMode = 'insert' | 'edit'
type ImageUpload = (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>

const props = defineProps<{
  show: boolean
  mode: DialogMode
  accept?: string
  upload: ImageUpload
  initialAttrs?: RichTextImageAttrs | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [attrs: RichTextImageAttrs]
  error: [error: unknown]
}>()
```

The component state should include:

```ts
const selectedFileName = ref('')
const previewSrc = ref('')
const alt = ref('')
const width = ref<number | null>(null)
const height = ref<number | null>(null)
const naturalWidth = ref<number | null>(null)
const naturalHeight = ref<number | null>(null)
const isUploading = ref(false)
const isLoadingSize = ref(false)
```

Use fixed-ratio helpers:

```ts
const aspectRatio = computed(() =>
  naturalWidth.value !== null && naturalHeight.value !== null
    ? naturalWidth.value / naturalHeight.value
    : null,
)

function setWidth(value: number | null) {
  width.value = value
  if (value !== null && aspectRatio.value !== null) {
    height.value = Math.round(value / aspectRatio.value)
  }
}

function setHeight(value: number | null) {
  height.value = value
  if (value !== null && aspectRatio.value !== null) {
    width.value = Math.round(value * aspectRatio.value)
  }
}
```

Handle upload in the dialog:

```ts
async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  selectedFileName.value = file.name
  isUploading.value = true
  try {
    const uploaded = await props.upload(file)
    previewSrc.value = uploaded.src
    alt.value = uploaded.alt ?? file.name
    await loadSize(uploaded.src)
  } catch (error) {
    emit('error', error)
  } finally {
    isUploading.value = false
    input.value = ''
  }
}
```

Confirm only when `previewSrc`, `width`, and `height` are valid:

```ts
function confirm() {
  if (!previewSrc.value || width.value === null || height.value === null) return

  emit('confirm', {
    src: previewSrc.value,
    alt: alt.value.trim() || undefined,
    width: width.value,
    height: height.value,
  })
  emit('update:show', false)
}
```

The template must expose stable test hooks:

```vue
<NModal :show="show" preset="card" title="图片" @update:show="emit('update:show', $event)">
  <NSpin :show="isUploading || isLoadingSize">
    <input
      data-test="rich-text-image-file"
      type="file"
      :accept="accept"
      @change="handleFileChange"
    >
    <img v-if="previewSrc" data-test="rich-text-image-preview" :src="previewSrc" :alt="alt">
    <NFormItem label="图片说明">
      <NInput data-test="rich-text-image-alt" :value="alt" @update:value="alt = $event" />
    </NFormItem>
    <NFormItem label="宽度">
      <NInputNumber data-test="rich-text-image-width" :value="width" :min="1" @update:value="setWidth" />
    </NFormItem>
    <NFormItem label="高度">
      <NInputNumber data-test="rich-text-image-height" :value="height" :min="1" @update:value="setHeight" />
    </NFormItem>
    <NButton data-test="rich-text-image-reset-size" @click="resetSize">重置尺寸</NButton>
    <NButton data-test="rich-text-image-cancel" @click="emit('update:show', false)">取消</NButton>
    <NButton data-test="rich-text-image-confirm" type="primary" :disabled="!canConfirm" @click="confirm">确定</NButton>
  </NSpin>
</NModal>
```

- [ ] **Step 5: Implement `ImageToolbarControl.vue`**

Replace `packages/rich-text/src/features/image/vue/ImageToolbarControl.vue` with:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton } from 'naive-ui'
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { RichTextImageAttrs } from '../shared'
import { insertRichTextImage, updateRichTextImage } from '../vue'
import ImageDialog from './ImageDialog.vue'

interface ImageToolbarControlProps extends RichTextToolbarControlInjectedProps {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

const props = defineProps<ImageToolbarControlProps>()

const showDialog = ref(false)
const isEditMode = computed(() => props.editor?.isActive('image') ?? false)
const currentAttrs = computed(() =>
  isEditMode.value ? (props.editor?.getAttributes('image') as RichTextImageAttrs) : null,
)

function openDialog() {
  if (props.disabled || props.editor === null) return
  showDialog.value = true
}

function handleConfirm(attrs: RichTextImageAttrs) {
  if (!props.editor) return

  if (isEditMode.value) {
    updateRichTextImage(props.editor, attrs)
  } else {
    insertRichTextImage(props.editor, attrs)
  }
}

function handleError(error: unknown) {
  props.onError?.(error)
}
</script>

<template>
  <NButton
    data-test="rich-text-image"
    quaternary
    size="small"
    :disabled="disabled || editor === null"
    :data-active="isEditMode ? 'true' : undefined"
    @click="openDialog"
  >
    <span class="i-[lucide--image]" aria-hidden="true" />
  </NButton>
  <ImageDialog
    v-model:show="showDialog"
    :mode="isEditMode ? 'edit' : 'insert'"
    :accept="accept"
    :upload="upload"
    :initial-attrs="currentAttrs"
    @confirm="handleConfirm"
    @error="handleError"
  />
</template>
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/features/image/vue/ImageDialog.test.ts
pnpm --filter @rev30/rich-text test __tests__/vue/RichTextEditor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rich-text/src/features/image/vue/ImageToolbarControl.vue packages/rich-text/src/features/image/vue/ImageDialog.vue packages/rich-text/src/features/image/vue/image-size.ts packages/rich-text/__tests__/features/image/vue/ImageDialog.test.ts
git commit -m "feat: add rich text image dialog"
```

## Task 4: Integrate Announcement Image Upload In The Client

**Files:**
- Modify: `apps/client/src/features/content/AnnouncementFormDrawer.vue`
- Modify: `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`

- [ ] **Step 1: Write failing client integration test**

In `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`, replace the rich-text preset mock:

```ts
const createCompactRichTextEditorPresetMock = vi.fn((options) => ({
  key: 'compact',
  features: [],
  toolbar: null,
  options,
}))

vi.mock('@rev30/rich-text/vue/presets', () => ({
  createCompactRichTextEditorPreset: createCompactRichTextEditorPresetMock,
}))
```

Add attachment mocks near the content/system mocks:

```ts
vi.mock('../../../src/features/attachments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/attachments')>()),
  uploadAttachment: vi.fn(),
  getAttachmentContentUrl: vi.fn((id: string) => `/api/attachments/${id}/content`),
  getAttachmentErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
}))
```

Import the mocked helpers:

```ts
import {
  getAttachmentContentUrl,
  uploadAttachment,
} from '../../../src/features/attachments'
import { ATTACHMENT_READ_POLICY_AUTHENTICATED } from '@rev30/contracts'
```

Add this test:

```ts
it('configures rich text image uploads as authenticated announcement attachments', async () => {
  vi.mocked(uploadAttachment).mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555' })

  mountDrawer()
  await flushPromises()

  const imageOptions = createCompactRichTextEditorPresetMock.mock.calls[0]?.[0].image
  const result = await imageOptions.upload(new File(['image'], 'cover.png', { type: 'image/png' }))

  expect(uploadAttachment).toHaveBeenCalledWith(expect.any(File), {
    usage: 'announcement-content-image',
    readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
  })
  expect(getAttachmentContentUrl).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555')
  expect(result).toEqual({
    src: '/api/attachments/55555555-5555-4555-8555-555555555555/content',
    alt: 'cover.png',
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @rev30/client test __tests__/features/content/AnnouncementFormDrawer.test.ts
```

Expected: FAIL because `AnnouncementFormDrawer.vue` still imports `compactRichTextEditorPreset`.

- [ ] **Step 3: Implement the client adapter**

In `apps/client/src/features/content/AnnouncementFormDrawer.vue`, update imports:

```ts
import { ATTACHMENT_READ_POLICY_AUTHENTICATED } from '@rev30/contracts'
import { createCompactRichTextEditorPreset } from '@rev30/rich-text/vue/presets'
import {
  getAttachmentContentUrl,
  getAttachmentErrorMessage,
  uploadAttachment,
} from '../attachments'
```

Add the upload helper above `const props = defineProps`:

```ts
async function uploadAnnouncementRichTextImage(file: File) {
  const attachment = await uploadAttachment(file, {
    usage: 'announcement-content-image',
    readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
  })

  return {
    src: getAttachmentContentUrl(attachment.id),
    alt: file.name,
  }
}
```

After `const formError = ref<string | null>(null)`, create the stable preset:

```ts
const richTextEditorPreset = createCompactRichTextEditorPreset({
  image: {
    accept: 'image/*',
    upload: uploadAnnouncementRichTextImage,
    onError(error) {
      formError.value = getAttachmentErrorMessage(error, '上传图片失败')
    },
  },
})
```

Update the template:

```vue
<RichTextEditor
  :disabled="isLoading || isSaving"
  :model-value="state.value"
  :preset="richTextEditorPreset"
  @blur="field.handleBlur"
  @update:model-value="..."
/>
```

- [ ] **Step 4: Run focused client test**

Run:

```bash
pnpm --filter @rev30/client test __tests__/features/content/AnnouncementFormDrawer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/features/content/AnnouncementFormDrawer.vue apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts
git commit -m "feat: upload announcement rich text images"
```

## Task 5: Integrate Announcement Image Validation On The Server

**Files:**
- Modify: `apps/server/src/modules/content/announcements/content.ts`
- Modify: `apps/server/__tests__/modules/content/announcements/content.test.ts`

- [ ] **Step 1: Write failing server tests**

In `apps/server/__tests__/modules/content/announcements/content.test.ts`, add:

```ts
it('allows authenticated attachment images in announcement content', () => {
  expect(
    deriveAnnouncementContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
        {
          type: 'image',
          attrs: {
            src: '/api/attachments/11111111-1111-4111-8111-111111111111/content',
            alt: '示意图',
            width: 640,
            height: 360,
          },
        },
      ],
    }).html,
  ).toContain(
    '<img src="/api/attachments/11111111-1111-4111-8111-111111111111/content" alt="示意图" width="640" height="360" style="width: 640px; max-width: 100%; height: auto" />',
  )
})

it('rejects external announcement images', () => {
  expect(() =>
    deriveAnnouncementContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] },
        {
          type: 'image',
          attrs: {
            src: 'https://example.com/image.png',
            alt: '外部图片',
            width: 640,
            height: 360,
          },
        },
      ],
    }),
  ).toThrow(AnnouncementContentInvalidError)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @rev30/server test __tests__/modules/content/announcements/content.test.ts
```

Expected: FAIL because announcement content still uses the old static compact server preset.

- [ ] **Step 3: Implement server preset integration**

Replace `apps/server/src/modules/content/announcements/content.ts` with:

```ts
import { createCompactRichTextServerPreset } from '@rev30/rich-text/server/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { AnnouncementContentInvalidError } from './errors'

const attachmentContentUrlPattern =
  /^\/api\/attachments\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/content$/i

const announcementRichTextServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc(src) {
      return attachmentContentUrlPattern.test(src)
    },
  },
})

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    return deriveRichTextContent(contentJson, announcementRichTextServerPreset)
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw new AnnouncementContentInvalidError()
    }

    throw error
  }
}
```

- [ ] **Step 4: Run server tests**

Run:

```bash
pnpm --filter @rev30/server test __tests__/modules/content/announcements/content.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/modules/content/announcements/content.ts apps/server/__tests__/modules/content/announcements/content.test.ts
git commit -m "feat: validate announcement rich text images"
```

## Task 6: Typecheck And Cross-Package Cleanup

**Files:**
- Modify: `packages/rich-text/src/features/image/shared.ts`
- Modify: `packages/rich-text/src/features/image/vue.ts`
- Modify: `packages/rich-text/src/vue/presets/compact.ts`
- Modify: `packages/rich-text/src/server/presets/compact.ts`
- Modify: `packages/rich-text/__tests__/server/derive.test.ts`
- Modify: `apps/client/src/features/content/AnnouncementFormDrawer.vue`
- Modify: `apps/server/src/modules/content/announcements/content.ts`

- [ ] **Step 1: Search for removed static preset references**

Run:

```bash
rg -n "compactRichTextEditorPreset|compactRichTextServerPreset" packages apps
```

Expected: no production code references. Test references are allowed only when asserting the removed names are absent; prefer no references.

- [ ] **Step 2: Run package typechecks**

Run:

```bash
pnpm --filter @rev30/rich-text typecheck
pnpm --filter @rev30/client typecheck
pnpm --filter @rev30/server typecheck
```

Expected: PASS. If `packages/rich-text/src/features/image/shared.ts` fails on the `@tiptap/extension-image` import, switch that file from default import to the named export shown below and rerun `pnpm --filter @rev30/rich-text typecheck`:

```ts
import { Image } from '@tiptap/extension-image'
```

- [ ] **Step 3: Run focused package tests**

Run:

```bash
pnpm --filter @rev30/rich-text test __tests__/presets/compact.test.ts
pnpm --filter @rev30/rich-text test __tests__/features/image/server.test.ts
pnpm --filter @rev30/rich-text test __tests__/features/image/vue/ImageDialog.test.ts
pnpm --filter @rev30/client test __tests__/features/content/AnnouncementFormDrawer.test.ts
pnpm --filter @rev30/server test __tests__/modules/content/announcements/content.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit cleanup when fixes were needed**

Stage the files this task is allowed to modify:

```bash
git add packages/rich-text/src/features/image/shared.ts packages/rich-text/src/features/image/vue.ts packages/rich-text/src/vue/presets/compact.ts packages/rich-text/src/server/presets/compact.ts packages/rich-text/__tests__/server/derive.test.ts apps/client/src/features/content/AnnouncementFormDrawer.vue apps/server/src/modules/content/announcements/content.ts
```

Create a commit only when the staged diff is non-empty:

```bash
git diff --cached --quiet || git commit -m "fix: align rich text image integration types"
```

## Task 7: Final Verification

**Files:**
- No planned file edits.

- [ ] **Step 1: Run full verification**

Run:

```bash
pnpm check
```

Expected: PASS. If the command exits 0 while printing Rolldown/VueUse `INVALID_ANNOTATION` warnings, treat those as known third-party warnings and do not change code for them.

- [ ] **Step 2: Review final git status**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: working tree is clean except for intentional uncommitted changes the executor has explicitly decided to leave for review; recent commits match the task sequence.

- [ ] **Step 3: Final handoff**

Summarize:

```txt
- Rich-text image feature and fixed compact factories implemented.
- Announcement editor uploads images as authenticated attachments.
- Announcement server accepts only internal attachment content URLs in image nodes.
- Verification: pnpm check.
```
