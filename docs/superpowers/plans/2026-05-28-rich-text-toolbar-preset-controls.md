# Rich Text Toolbar Preset Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add preset-owned Highlight and Link toolbar controls to `@rev30/rich-text` while keeping toolbar customization out of the public API.

**Architecture:** The rich-text package keeps three coordinated layers: core presets define Tiptap extensions, Vue editor presets define toolbar controls, and server presets define HTML sanitization policy. Highlight and Link are implemented as feature-owned adapters; `RichTextEditor` remains a preset-driven shell and does not own feature behavior.

**Tech Stack:** Vue 3, Tiptap 3, Naive UI, sanitize-html, Vitest, pnpm workspace.

---

## File Structure

- Modify `packages/rich-text/package.json`: add Tiptap Highlight and Link dependencies.
- Modify `packages/rich-text/src/vue/toolbar/types.ts`: add internal component control type and helper.
- Modify `packages/rich-text/src/vue/toolbar/RichTextToolbarControl.vue`: render component controls.
- Modify `packages/rich-text/src/vue/RichTextEditor.vue`: remove `toolbar` prop and use `preset.toolbar`.
- Modify `packages/rich-text/src/vue/index.ts`: stop exporting toolbar DSL.
- Modify `packages/rich-text/src/vue/presets/index.ts`: export only compact preset and public type.
- Modify `packages/rich-text/src/server/index.ts`: stop exporting server preset factory.
- Modify `packages/rich-text/src/server/presets/index.ts`: export only compact server preset and public type.
- Modify `packages/rich-text/src/server/policy.ts`: allow feature policies to contribute `allowedStyles`.
- Modify `packages/rich-text/src/server/sanitize.ts`: merge `allowedStyles`.
- Create `packages/rich-text/src/features/highlight/shared.ts`: Tiptap Highlight extension.
- Create `packages/rich-text/src/features/highlight/vue.ts`: toolbar component control.
- Create `packages/rich-text/src/features/highlight/server.ts`: highlight HTML policy and color normalization.
- Create `packages/rich-text/src/features/highlight/vue/HighlightToolbarControl.vue`: Highlight popover UI.
- Create `packages/rich-text/src/features/link/shared.ts`: Tiptap Link extension.
- Create `packages/rich-text/src/features/link/vue.ts`: toolbar component control.
- Create `packages/rich-text/src/features/link/server.ts`: link HTML policy.
- Create `packages/rich-text/src/features/link/vue/LinkToolbarControl.vue`: Link popover UI.
- Modify `packages/rich-text/src/presets/compact.ts`: add highlight and link features.
- Modify `packages/rich-text/src/vue/presets/compact.ts`: add highlight and link toolbar controls.
- Modify `packages/rich-text/src/server/presets/compact.ts`: add highlight and link HTML policies.
- Modify `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`: keep editor tests at shell and compact integration level.
- Modify `packages/rich-text/__tests__/presets/compact.test.ts`: verify compact supports link and highlight behavior.
- Modify `packages/rich-text/__tests__/server/derive.test.ts`: keep only generic derive pipeline coverage.
- Create `packages/rich-text/__tests__/features/highlight/server.test.ts`: highlight policy tests.
- Create `packages/rich-text/__tests__/features/link/server.test.ts`: link policy tests.
- Create `packages/rich-text/__tests__/features/highlight/vue/HighlightToolbarControl.test.ts`: Highlight control tests.
- Create `packages/rich-text/__tests__/features/link/vue/LinkToolbarControl.test.ts`: Link control tests.
- Modify `apps/client/src/features/content/AnnouncementFormDrawer.vue` only if public export tightening changes imports.
- Modify `pnpm-lock.yaml` after adding dependencies.

## Task 1: Dependencies And API Boundary

**Files:**
- Modify: `packages/rich-text/package.json`
- Modify: `packages/rich-text/src/vue/RichTextEditor.vue`
- Modify: `packages/rich-text/src/vue/index.ts`
- Modify: `packages/rich-text/src/vue/presets/index.ts`
- Modify: `packages/rich-text/src/server/index.ts`
- Modify: `packages/rich-text/src/server/presets/index.ts`
- Modify: `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`
- Modify: `packages/rich-text/__tests__/presets/compact.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add package dependencies**

Run:

```bash
pnpm --filter @rev30/rich-text add @tiptap/extension-highlight @tiptap/extension-link
```

Expected: `packages/rich-text/package.json` gains `@tiptap/extension-highlight` and `@tiptap/extension-link`, and `pnpm-lock.yaml` is updated.

- [ ] **Step 2: Write the editor API boundary test**

In `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`, change the custom preset setup so it imports the preset factory from the internal file:

```ts
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
```

Then add this test to the `describe('RichTextEditor', () => { ... })` block:

```ts
it('does not render a toolbar when the preset has no toolbar', async () => {
  const wrapper = mountRichTextEditor({
    modelValue: contentJson,
    preset: noHeadingEditorPreset,
  })

  await getEditable(wrapper)

  expect(wrapper.find('[data-test="rich-text-toolbar-group"]').exists()).toBe(false)
})
```

In `packages/rich-text/__tests__/presets/compact.test.ts`, change public subpath imports that need internal helpers to file-level imports:

```ts
import { compactRichTextToolbar, compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { compactRichTextHtmlPolicies, compactRichTextServerPreset } from '../../src/server/presets/compact'
```

- [ ] **Step 3: Remove the `toolbar` prop from `RichTextEditor`**

In `packages/rich-text/src/vue/RichTextEditor.vue`, replace the props and toolbar computed setup with:

```ts
const props = withDefaults(
  defineProps<{
    modelValue: RichTextDocument
    preset: RichTextEditorPreset
    disabled?: boolean
    minHeight?: number
  }>(),
  {
    disabled: false,
    minHeight: 240,
  },
)

const activeToolbar = computed(() => props.preset.toolbar)
const richTextPreset = computed(() => props.preset.preset)
```

Remove this import from the same file:

```ts
import type { RichTextToolbarConfig } from './toolbar/types'
```

- [ ] **Step 4: Tighten Vue public exports**

Replace `packages/rich-text/src/vue/index.ts` with:

```ts
export { default as RichTextEditor } from './RichTextEditor.vue'
export type { RichTextEditorPreset } from './presets/types'
export { useRichTextEditor } from './useRichTextEditor'
```

Replace `packages/rich-text/src/vue/presets/index.ts` with:

```ts
export { compactRichTextEditorPreset } from './compact'
export type { RichTextEditorPreset } from './types'
```

- [ ] **Step 5: Tighten server public exports**

Replace `packages/rich-text/src/server/index.ts` with:

```ts
export * from './derive'
export * from './errors'
export type { RichTextHtmlPolicy } from './policy'
export type { RichTextServerPreset } from './presets/types'
```

Replace `packages/rich-text/src/server/presets/index.ts` with:

```ts
export { compactRichTextServerPreset } from './compact'
export type { RichTextServerPreset } from './types'
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/vue/RichTextEditor.test.ts __tests__/presets/compact.test.ts
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rich-text/package.json pnpm-lock.yaml packages/rich-text/src/vue/RichTextEditor.vue packages/rich-text/src/vue/index.ts packages/rich-text/src/vue/presets/index.ts packages/rich-text/src/server/index.ts packages/rich-text/src/server/presets/index.ts packages/rich-text/__tests__/vue/RichTextEditor.test.ts packages/rich-text/__tests__/presets/compact.test.ts
git commit -m "refactor: tighten rich text toolbar api"
```

## Task 2: Toolbar Component Control Runtime

**Files:**
- Modify: `packages/rich-text/src/vue/toolbar/types.ts`
- Modify: `packages/rich-text/src/vue/toolbar/RichTextToolbarControl.vue`

- [ ] **Step 1: Add component control types**

In `packages/rich-text/src/vue/toolbar/types.ts`, add this import:

```ts
import type { Component } from 'vue'
```

Add this interface below `RichTextToolbarDropdownControl`:

```ts
export interface RichTextToolbarComponentControl {
  type: 'component'
  key: string
  component: Component
  props?: Record<string, unknown>
}
```

Change `RichTextToolbarControlConfig` to:

```ts
export type RichTextToolbarControlConfig =
  | RichTextToolbarButtonControl
  | RichTextToolbarDropdownControl
  | RichTextToolbarComponentControl
```

Add this helper below `richTextToolbarDropdown`:

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

- [ ] **Step 2: Render component controls**

Replace the template in `packages/rich-text/src/vue/toolbar/RichTextToolbarControl.vue` with:

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

- [ ] **Step 3: Run toolbar typecheck**

Run:

```bash
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/rich-text/src/vue/toolbar/types.ts packages/rich-text/src/vue/toolbar/RichTextToolbarControl.vue
git commit -m "feat: support rich text toolbar component controls"
```

## Task 3: Highlight Server Feature

**Files:**
- Create: `packages/rich-text/src/features/highlight/shared.ts`
- Create: `packages/rich-text/src/features/highlight/server.ts`
- Create: `packages/rich-text/__tests__/features/highlight/server.test.ts`
- Modify: `packages/rich-text/src/server/policy.ts`
- Modify: `packages/rich-text/src/server/sanitize.ts`

- [ ] **Step 1: Write highlight server policy tests**

Create `packages/rich-text/__tests__/features/highlight/server.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'
import { highlightHtmlPolicy } from '../../../src/features/highlight/server'

describe('highlight html policy', () => {
  it('keeps fixed palette highlight styles', () => {
    expect(
      sanitizeRichTextHtml(
        '<p><mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">维护通知</mark></p>',
        [highlightHtmlPolicy],
      ),
    ).toBe(
      '<mark data-color="#fef08a" style="background-color:#fef08a;color:inherit">维护通知</mark>',
    )
  })

  it('downgrades unknown highlight colors to plain mark', () => {
    expect(
      sanitizeRichTextHtml(
        '<mark data-color="#000000" style="background-color: #000000; color: inherit">维护通知</mark>',
        [highlightHtmlPolicy],
      ),
    ).toBe('<mark>维护通知</mark>')
  })

  it('removes non-highlight inline styles from mark', () => {
    expect(
      sanitizeRichTextHtml(
        '<mark data-color="#fef08a" style="background-color: #fef08a; position: fixed; inset: 0">维护通知</mark>',
        [highlightHtmlPolicy],
      ),
    ).toBe('<mark data-color="#fef08a" style="background-color:#fef08a">维护通知</mark>')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/highlight/server.test.ts
```

Expected: FAIL because `highlightHtmlPolicy` does not exist.

- [ ] **Step 3: Add allowedStyles to policy type**

Replace `packages/rich-text/src/server/policy.ts` with:

```ts
import type sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: sanitizeHtml.IDefaults['allowedTags']
  allowedAttributes?: sanitizeHtml.IDefaults['allowedAttributes']
  allowedSchemes?: sanitizeHtml.IDefaults['allowedSchemes']
  allowedStyles?: sanitizeHtml.IOptions['allowedStyles']
  transformTags?: sanitizeHtml.IOptions['transformTags']
}
```

- [ ] **Step 4: Merge allowedStyles in sanitizer**

In `packages/rich-text/src/server/sanitize.ts`, add this helper above `mergeRichTextHtmlPolicies`:

```ts
function mergeAllowedStyles(
  target: NonNullable<sanitizeHtml.IOptions['allowedStyles']>,
  source: sanitizeHtml.IOptions['allowedStyles'],
) {
  for (const [tag, properties] of Object.entries(source ?? {})) {
    target[tag] ??= {}

    for (const [property, patterns] of Object.entries(properties)) {
      target[tag][property] = [...(target[tag][property] ?? []), ...patterns]
    }
  }
}
```

Inside `mergeRichTextHtmlPolicies`, add this variable near `transformTags`:

```ts
const allowedStyles: NonNullable<sanitizeHtml.IOptions['allowedStyles']> = {}
```

Inside the policy loop, after `allowedAttributes` merging, add:

```ts
mergeAllowedStyles(allowedStyles, policy.allowedStyles)
```

Return `allowedStyles` in the sanitize options:

```ts
return {
  allowedTags: [...allowedTags],
  allowedAttributes,
  allowedSchemes: [...allowedSchemes],
  allowedStyles,
  allowProtocolRelative: false,
  transformTags,
}
```

- [ ] **Step 5: Add Highlight shared extension**

Create `packages/rich-text/src/features/highlight/shared.ts`:

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

- [ ] **Step 6: Add Highlight server policy**

Create `packages/rich-text/src/features/highlight/server.ts`:

```ts
import type { IOptions } from 'sanitize-html'
import type { RichTextHtmlPolicy } from '../../server/policy'

const highlightColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8'] as const

const highlightColorSet = new Set<string>(highlightColors)

function normalizeHighlightColor(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return highlightColorSet.has(normalized) ? normalized : null
}

function getStyleColor(style: unknown) {
  if (typeof style !== 'string') {
    return null
  }

  const match = /(?:^|;)\s*background-color\s*:\s*([^;]+)/i.exec(style)

  return normalizeHighlightColor(match?.[1])
}

const transformMark: IOptions['transformTags'] extends infer TransformTags
  ? NonNullable<TransformTags>['mark']
  : never = (tagName, attribs) => {
  const color = normalizeHighlightColor(attribs['data-color']) ?? getStyleColor(attribs.style)

  if (!color) {
    return {
      tagName,
      attribs: {},
    }
  }

  return {
    tagName,
    attribs: {
      'data-color': color,
      style: `background-color: ${color}; color: inherit`,
    },
  }
}

export const highlightHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['mark'],
  allowedAttributes: {
    mark: ['data-color', 'style'],
  },
  allowedStyles: {
    mark: {
      'background-color': highlightColors.map((color) => new RegExp(`^${color}$`, 'i')),
      color: [/^inherit$/],
    },
  },
  transformTags: {
    mark: transformMark,
  },
}
```

- [ ] **Step 7: Run highlight server tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/highlight/server.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rich-text/src/server/policy.ts packages/rich-text/src/server/sanitize.ts packages/rich-text/src/features/highlight/shared.ts packages/rich-text/src/features/highlight/server.ts packages/rich-text/__tests__/features/highlight/server.test.ts
git commit -m "feat: add rich text highlight server policy"
```

## Task 4: Highlight Vue Control

**Files:**
- Create: `packages/rich-text/src/features/highlight/vue.ts`
- Create: `packages/rich-text/src/features/highlight/vue/HighlightToolbarControl.vue`
- Create: `packages/rich-text/__tests__/features/highlight/vue/HighlightToolbarControl.test.ts`

- [ ] **Step 1: Write Highlight control tests**

Create `packages/rich-text/__tests__/features/highlight/vue/HighlightToolbarControl.test.ts`:

```ts
import { Editor } from '@tiptap/core'
import { flushPromises, mount } from '@vue/test-utils'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { afterEach, describe, expect, it } from 'vitest'
import { Highlight } from '@tiptap/extension-highlight'
import HighlightToolbarControl from '../../../../src/features/highlight/vue/HighlightToolbarControl.vue'
import { highlightColors } from '../../../../src/features/highlight/vue'

const editors: Editor[] = []

function createEditor(content = '<p>维护通知</p>') {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, Highlight.configure({ multicolor: true })],
    content,
  })
  editors.push(editor)

  return editor
}

describe('HighlightToolbarControl', () => {
  afterEach(() => {
    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
  })

  it('sets and clears a fixed highlight color', async () => {
    const editor = createEditor()
    editor.commands.selectAll()
    const wrapper = mount(HighlightToolbarControl, {
      props: { editor, disabled: false, colors: highlightColors },
    })

    await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')
    await wrapper.get('[data-test="rich-text-highlight-yellow"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })

    await wrapper.get('[data-test="rich-text-highlight-clear"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
  })

  it('marks the current palette color as selected', async () => {
    const editor = createEditor(
      '<p><mark data-color="#bfdbfe" style="background-color: #bfdbfe; color: inherit">维护通知</mark></p>',
    )
    editor.commands.selectAll()
    const wrapper = mount(HighlightToolbarControl, {
      props: { editor, disabled: false, colors: highlightColors },
    })

    await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')

    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('data-active')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      undefined,
    )
  })

  it('does not run commands while disabled', async () => {
    const editor = createEditor()
    editor.commands.selectAll()
    const wrapper = mount(HighlightToolbarControl, {
      props: { editor, disabled: true, colors: highlightColors },
    })

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('disabled')).toBeDefined()
    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/highlight/vue/HighlightToolbarControl.test.ts
```

Expected: FAIL because `HighlightToolbarControl.vue` does not exist.

- [ ] **Step 3: Add Highlight toolbar control adapter**

Create `packages/rich-text/src/features/highlight/vue.ts`:

```ts
import { richTextToolbarComponent } from '../../vue/toolbar/types'
import HighlightToolbarControl from './vue/HighlightToolbarControl.vue'

export const highlightColors = [
  { key: 'yellow', label: '黄色', value: '#fef08a' },
  { key: 'green', label: '绿色', value: '#bbf7d0' },
  { key: 'blue', label: '蓝色', value: '#bfdbfe' },
  { key: 'pink', label: '粉色', value: '#fbcfe8' },
] as const

export const highlightToolbarControl = richTextToolbarComponent({
  key: 'highlight',
  component: HighlightToolbarControl,
  props: {
    colors: highlightColors,
  },
})
```

- [ ] **Step 4: Add Highlight toolbar component**

Create `packages/rich-text/src/features/highlight/vue/HighlightToolbarControl.vue`:

```vue
<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NPopover } from 'naive-ui'
import { computed } from 'vue'

interface HighlightColorOption {
  key: string
  label: string
  value: string
}

const props = withDefaults(
  defineProps<{
    editor: Editor | null
    disabled?: boolean
    colors: HighlightColorOption[]
  }>(),
  {
    disabled: false,
  },
)

const isDisabled = computed(() => props.disabled || !props.editor)
const currentColor = computed(() => {
  const color = props.editor?.getAttributes('highlight').color

  return typeof color === 'string' ? color.toLowerCase() : null
})
const isActive = computed(() => props.editor?.isActive('highlight') ?? false)

function applyColor(color: string) {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.chain().focus().toggleHighlight({ color }).run()
}

function clearHighlight() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.chain().focus().unsetHighlight().run()
}
</script>

<template>
  <NPopover trigger="click" placement="bottom-start" :disabled="isDisabled">
    <template #trigger>
      <NButton
        data-test="rich-text-highlight"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="高亮"
        aria-label="高亮"
        :aria-pressed="isActive"
      >
        <span class="i-[lucide--highlighter]" aria-hidden="true" />
      </NButton>
    </template>

    <div class="flex items-center gap-1">
      <NButton
        v-for="color in colors"
        :key="color.key"
        :data-test="`rich-text-highlight-${color.key}`"
        :data-active="currentColor === color.value ? 'true' : undefined"
        size="small"
        :title="color.label"
        :aria-label="color.label"
        :aria-pressed="currentColor === color.value"
        @click="applyColor(color.value)"
      >
        <span
          class="inline-block size-4 rounded-sm border border-(--app-input-border-color)"
          :style="{ backgroundColor: color.value }"
          aria-hidden="true"
        />
      </NButton>

      <NButton
        data-test="rich-text-highlight-clear"
        size="small"
        title="清除高亮"
        aria-label="清除高亮"
        @click="clearHighlight"
      >
        <span class="i-[lucide--eraser]" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
```

- [ ] **Step 5: Run Highlight Vue tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/highlight/vue/HighlightToolbarControl.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rich-text/src/features/highlight/vue.ts packages/rich-text/src/features/highlight/vue/HighlightToolbarControl.vue packages/rich-text/__tests__/features/highlight/vue/HighlightToolbarControl.test.ts
git commit -m "feat: add rich text highlight toolbar control"
```

## Task 5: Link Server Feature

**Files:**
- Create: `packages/rich-text/src/features/link/shared.ts`
- Create: `packages/rich-text/src/features/link/server.ts`
- Create: `packages/rich-text/__tests__/features/link/server.test.ts`

- [ ] **Step 1: Write link server policy tests**

Create `packages/rich-text/__tests__/features/link/server.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { linkHtmlPolicy } from '../../../src/features/link/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('link html policy', () => {
  it('keeps safe links and adds safe browsing attributes', () => {
    expect(
      sanitizeRichTextHtml('<a href="https://example.com">示例</a>', [linkHtmlPolicy]),
    ).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">示例</a>',
    )
  })

  it('removes dangerous href values', () => {
    expect(sanitizeRichTextHtml('<a href="javascript:alert(1)">示例</a>', [linkHtmlPolicy])).toBe(
      '<a target="_blank" rel="noopener noreferrer nofollow">示例</a>',
    )
  })

  it('allows mail and telephone links', () => {
    expect(
      sanitizeRichTextHtml('<a href="mailto:admin@example.com">邮箱</a><a href="tel:123">电话</a>', [
        linkHtmlPolicy,
      ]),
    ).toBe(
      '<a href="mailto:admin@example.com" target="_blank" rel="noopener noreferrer nofollow">邮箱</a><a href="tel:123" target="_blank" rel="noopener noreferrer nofollow">电话</a>',
    )
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/link/server.test.ts
```

Expected: FAIL because `linkHtmlPolicy` does not exist.

- [ ] **Step 3: Add Link shared extension**

Create `packages/rich-text/src/features/link/shared.ts`:

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

- [ ] **Step 4: Add Link server policy**

Create `packages/rich-text/src/features/link/server.ts`:

```ts
import type { RichTextHtmlPolicy } from '../../server/policy'

export const linkHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer nofollow',
      },
    }),
  },
}
```

- [ ] **Step 5: Run link server tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/link/server.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rich-text/src/features/link/shared.ts packages/rich-text/src/features/link/server.ts packages/rich-text/__tests__/features/link/server.test.ts
git commit -m "feat: add rich text link server policy"
```

## Task 6: Link Vue Control

**Files:**
- Create: `packages/rich-text/src/features/link/vue.ts`
- Create: `packages/rich-text/src/features/link/vue/LinkToolbarControl.vue`
- Create: `packages/rich-text/__tests__/features/link/vue/LinkToolbarControl.test.ts`

- [ ] **Step 1: Write Link control tests**

Create `packages/rich-text/__tests__/features/link/vue/LinkToolbarControl.test.ts`:

```ts
import { Editor } from '@tiptap/core'
import { flushPromises, mount } from '@vue/test-utils'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import LinkToolbarControl from '../../../../src/features/link/vue/LinkToolbarControl.vue'

const editors: Editor[] = []

function createEditor() {
  const editor = new Editor({
    extensions: [Document, Paragraph, Text, linkFeature.extension()],
    content: '<p>维护通知</p>',
  })
  editors.push(editor)

  return editor
}

describe('LinkToolbarControl', () => {
  afterEach(() => {
    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
    vi.restoreAllMocks()
  })

  it('applies, pre-fills, and removes a normalized link', async () => {
    const editor = createEditor()
    editor.commands.selectAll()
    const wrapper = mount(LinkToolbarControl, {
      props: { editor, disabled: false },
    })

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await wrapper.get('[data-test="rich-text-link-url"]').setValue('example.com')
    await wrapper.get('[data-test="rich-text-link-url"]').trigger('keydown.enter')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).toContain('"href":"https://example.com"')

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    expect(
      (wrapper.get('[data-test="rich-text-link-url"]').element as HTMLInputElement).value,
    ).toBe('https://example.com')

    await wrapper.get('[data-test="rich-text-link-remove"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
  })

  it('does not write unsafe links', async () => {
    const editor = createEditor()
    editor.commands.selectAll()
    const wrapper = mount(LinkToolbarControl, {
      props: { editor, disabled: false },
    })

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await wrapper.get('[data-test="rich-text-link-url"]').setValue('javascript:alert(1)')
    await wrapper.get('[data-test="rich-text-link-url"]').trigger('keydown.enter')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
  })

  it('opens the normalized href in a new window', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createEditor()
    editor.commands.selectAll()
    const wrapper = mount(LinkToolbarControl, {
      props: { editor, disabled: false },
    })

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await wrapper.get('[data-test="rich-text-link-url"]').setValue('example.com')
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  it('labels icon actions for assistive technology', async () => {
    const editor = createEditor()
    const wrapper = mount(LinkToolbarControl, {
      props: { editor, disabled: false },
    })

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')

    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('aria-label')).toBe(
      '应用链接',
    )
    expect(wrapper.get('[data-test="rich-text-link-open"]').attributes('aria-label')).toBe(
      '新窗口打开链接',
    )
  })

  it('does not run commands while disabled', () => {
    const editor = createEditor()
    const wrapper = mount(LinkToolbarControl, {
      props: { editor, disabled: true },
    })

    expect(wrapper.get('[data-test="rich-text-link"]').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/link/vue/LinkToolbarControl.test.ts
```

Expected: FAIL because `LinkToolbarControl.vue` does not exist.

- [ ] **Step 3: Add Link toolbar control adapter**

Create `packages/rich-text/src/features/link/vue.ts`:

```ts
import { richTextToolbarComponent } from '../../vue/toolbar/types'
import LinkToolbarControl from './vue/LinkToolbarControl.vue'

export const linkToolbarControl = richTextToolbarComponent({
  key: 'link',
  component: LinkToolbarControl,
})
```

- [ ] **Step 4: Add Link toolbar component**

Create `packages/rich-text/src/features/link/vue/LinkToolbarControl.vue`:

```vue
<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NInput, NPopover } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    editor: Editor | null
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const url = ref('')

const isDisabled = computed(() => props.disabled || !props.editor)
const currentHref = computed(() => {
  const href = props.editor?.getAttributes('link').href

  return typeof href === 'string' ? href : ''
})
const isActive = computed(() => props.editor?.isActive('link') ?? false)

watch(currentHref, (href) => {
  url.value = href
})

const normalizedInputHref = computed(() => normalizeHref(url.value))
const normalizedOpenHref = computed(() => normalizeHref(url.value || currentHref.value))
const isInputHrefAllowed = computed(
  () => normalizedInputHref.value !== '' && isAllowedHref(normalizedInputHref.value),
)
const canApply = computed(
  () => !isDisabled.value && (normalizedInputHref.value === '' || isInputHrefAllowed.value),
)
const canOpen = computed(
  () => !isDisabled.value && normalizedOpenHref.value !== '' && isAllowedHref(normalizedOpenHref.value),
)

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

function applyLink() {
  if (!canApply.value || !props.editor) {
    return
  }

  if (!normalizedInputHref.value) {
    removeLink()
    return
  }

  props.editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedInputHref.value }).run()
  url.value = normalizedInputHref.value
}

function removeLink() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  url.value = ''
}

function openLink() {
  if (!canOpen.value) {
    return
  }

  window.open(normalizedOpenHref.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <NPopover trigger="click" placement="bottom-start" :disabled="isDisabled">
    <template #trigger>
      <NButton
        data-test="rich-text-link"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="链接"
        aria-label="链接"
        :aria-pressed="isActive"
      >
        <span class="i-[lucide--link]" aria-hidden="true" />
      </NButton>
    </template>

    <div class="flex items-center gap-1">
      <NInput
        v-model:value="url"
        data-test="rich-text-link-url"
        size="small"
        placeholder="https://example.com"
        :status="url && !isInputHrefAllowed ? 'error' : undefined"
        @keydown.enter.prevent="applyLink"
      >
        <template #suffix>
          <NButton
            data-test="rich-text-link-apply"
            text
            :disabled="!canApply"
            title="应用链接"
            aria-label="应用链接"
            @click="applyLink"
          >
            <span class="i-[lucide--check]" aria-hidden="true" />
          </NButton>
        </template>
      </NInput>

      <NButton
        data-test="rich-text-link-open"
        size="small"
        :disabled="!canOpen"
        title="新窗口打开链接"
        aria-label="新窗口打开链接"
        @click="openLink"
      >
        <span class="i-[lucide--external-link]" aria-hidden="true" />
      </NButton>

      <NButton
        v-if="isActive"
        data-test="rich-text-link-remove"
        size="small"
        title="移除链接"
        aria-label="移除链接"
        @click="removeLink"
      >
        <span class="i-[lucide--unlink]" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
```

- [ ] **Step 5: Run Link Vue tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/features/link/vue/LinkToolbarControl.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rich-text/src/features/link/vue.ts packages/rich-text/src/features/link/vue/LinkToolbarControl.vue packages/rich-text/__tests__/features/link/vue/LinkToolbarControl.test.ts
git commit -m "feat: add rich text link toolbar control"
```

## Task 7: Compact Preset Integration

**Files:**
- Modify: `packages/rich-text/src/presets/compact.ts`
- Modify: `packages/rich-text/src/vue/presets/compact.ts`
- Modify: `packages/rich-text/src/server/presets/compact.ts`
- Modify: `packages/rich-text/__tests__/presets/compact.test.ts`
- Modify: `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`
- Modify: `packages/rich-text/__tests__/server/derive.test.ts`

- [ ] **Step 1: Update compact preset tests**

In `packages/rich-text/__tests__/presets/compact.test.ts`, update the expected feature keys to:

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
])
```

Update the marks toolbar group expectation to:

```ts
{ key: 'marks', controls: ['bold', 'italic', 'underline', 'highlight', 'link'] },
```

Update the server policy allowed tags expectation to include `mark` and `a`:

```ts
expect(compactRichTextHtmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toEqual([
  'p',
  'br',
  'strong',
  'em',
  'u',
  'mark',
  'a',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
])
```

- [ ] **Step 2: Update RichTextEditor compact integration test**

In `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`, add these entries to `toolbarDataTests`:

```ts
'rich-text-highlight',
'rich-text-link',
```

Keep feature-specific behavior out of this test file.

- [ ] **Step 3: Update derive test for link support**

In `packages/rich-text/__tests__/server/derive.test.ts`, remove the expectation that a document containing a `link` mark throws. Replace it with a safe link assertion in `derives sanitized html from supported tiptap json`:

```ts
{
  type: 'paragraph',
  content: [
    {
      type: 'text',
      text: '详情',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    },
  ],
},
```

Add this assertion:

```ts
expect(content.html).toContain(
  '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">详情</a>',
)
```

- [ ] **Step 4: Run the failing integration tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/presets/compact.test.ts __tests__/vue/RichTextEditor.test.ts __tests__/server/derive.test.ts
```

Expected: FAIL because compact does not include highlight/link yet.

- [ ] **Step 5: Add features to core compact preset**

In `packages/rich-text/src/presets/compact.ts`, add imports:

```ts
import { highlightFeature } from '../features/highlight/shared'
import { linkFeature } from '../features/link/shared'
```

Then insert `highlightFeature` and `linkFeature` after `underlineFeature`:

```ts
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
```

- [ ] **Step 6: Add controls to Vue compact preset**

In `packages/rich-text/src/vue/presets/compact.ts`, add imports:

```ts
import { highlightToolbarControl } from '../../features/highlight/vue'
import { linkToolbarControl } from '../../features/link/vue'
```

Then change the marks group to:

```ts
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
```

- [ ] **Step 7: Add policies to server compact preset**

In `packages/rich-text/src/server/presets/compact.ts`, add imports:

```ts
import { highlightHtmlPolicy } from '../../features/highlight/server'
import { linkHtmlPolicy } from '../../features/link/server'
```

Then insert the policies after `underlineHtmlPolicy`:

```ts
export const compactRichTextHtmlPolicies = [
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
]
```

- [ ] **Step 8: Run compact integration tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- __tests__/presets/compact.test.ts __tests__/vue/RichTextEditor.test.ts __tests__/server/derive.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/rich-text/src/presets/compact.ts packages/rich-text/src/vue/presets/compact.ts packages/rich-text/src/server/presets/compact.ts packages/rich-text/__tests__/presets/compact.test.ts packages/rich-text/__tests__/vue/RichTextEditor.test.ts packages/rich-text/__tests__/server/derive.test.ts
git commit -m "feat: add highlight and link to compact rich text preset"
```

## Task 8: Application Integration And Final Verification

**Files:**
- Modify: `apps/client/src/features/content/AnnouncementFormDrawer.vue` if imports break after public export tightening.
- Modify: `packages/rich-text/__tests__/vue/RichTextEditor.test.ts` if assertions need selector updates after Naive UI rendering.

- [ ] **Step 1: Check application imports**

Run:

```bash
rg "defineRichTextToolbar|richTextToolbarButton|richTextToolbarDropdown|richTextToolbarComponent|RichTextToolbarConfig|RichTextCommand|defineRichTextEditorPreset|defineRichTextServerPreset" apps packages -g '*.ts' -g '*.vue'
```

Expected: matches only inside `packages/rich-text/src` internals or package tests that intentionally import internal files.

- [ ] **Step 2: Run rich-text package tests**

Run:

```bash
pnpm --filter @rev30/rich-text test
```

Expected: PASS.

- [ ] **Step 3: Run focused app tests**

Run:

```bash
pnpm --filter @rev30/client test
pnpm --filter @rev30/server test
```

Expected: PASS.

- [ ] **Step 4: Run typecheck and lint**

Run:

```bash
pnpm typecheck
pnpm lint:check
```

Expected: PASS.

- [ ] **Step 5: Run full project check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 6: Commit final fixes**

If Step 1 through Step 5 required import or assertion adjustments, commit them:

```bash
git add apps/client/src/features/content/AnnouncementFormDrawer.vue packages/rich-text/__tests__/vue/RichTextEditor.test.ts
git commit -m "test: verify rich text toolbar preset controls"
```

If no files changed after Step 1 through Step 5, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers API boundary tightening, component controls, Highlight, Link, compact preset integration, sanitizer behavior, and focused tests.
- Red-flag scan: The plan contains concrete files, commands, and expected outcomes with no incomplete sections.
- Type consistency: The plan consistently uses `RichTextEditorPreset`, `RichTextServerPreset`, `RichTextHtmlPolicy`, `highlightToolbarControl`, `linkToolbarControl`, `highlightHtmlPolicy`, and `linkHtmlPolicy`.
