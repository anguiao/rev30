# Rich Text Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the current announcement rich text behavior into `@rev30/rich-text` with feature-first structure, shared presets, Naive UI Vue components, server-side derivation, and business integration.

**Architecture:** Add a new pnpm workspace package that owns rich text core types, feature definitions, presets, schema helpers, Vue editor components, and server parsing/sanitizing. Apps consume the package through subpath exports; announcements remain a thin business integration layer that chooses `compactRichTextPreset`.

**Tech Stack:** pnpm workspace, TypeScript, Vue 3, Naive UI, Tiptap, ProseMirror, zod, sanitize-html, Vitest, happy-dom, Tailwind CSS v4 with Iconify atomic classes.

---

## File Structure

Create:

- `packages/rich-text/package.json` - rich-text package metadata, scripts, dependencies, and subpath exports.
- `packages/rich-text/tsconfig.json` - package project references.
- `packages/rich-text/tsconfig.app.json` - package source typecheck config.
- `packages/rich-text/tsconfig.test.json` - package test typecheck config.
- `packages/rich-text/vitest.config.ts` - Vue/happy-dom Vitest config.
- `packages/rich-text/__tests__/schema.test.ts` - document schema and non-blank text tests.
- `packages/rich-text/__tests__/presets/compact.test.ts` - compact preset and extension uniqueness tests.
- `packages/rich-text/__tests__/server/derive.test.ts` - server derivation and sanitize tests.
- `packages/rich-text/__tests__/vue/RichTextEditor.test.ts` - Vue editor and toolbar layout tests.
- `packages/rich-text/src/index.ts` - root type exports.
- `packages/rich-text/src/core/feature.ts` - feature type and helper.
- `packages/rich-text/src/core/preset.ts` - preset type, helper, and extension collection.
- `packages/rich-text/src/core/toolbar.ts` - toolbar layout and item types.
- `packages/rich-text/src/features/**/shared.ts` - feature identity and extension factories.
- `packages/rich-text/src/features/**/vue.ts` - feature toolbar item implementations.
- `packages/rich-text/src/features/**/server.ts` - feature sanitize policies.
- `packages/rich-text/src/presets/compact.ts` - compact preset and default toolbar layout.
- `packages/rich-text/src/presets/index.ts` - preset barrel.
- `packages/rich-text/src/schema/document.ts` - rich text document schema and non-blank helper.
- `packages/rich-text/src/schema/index.ts` - schema barrel.
- `packages/rich-text/src/server/derive.ts` - Tiptap JSON to text/html derivation.
- `packages/rich-text/src/server/errors.ts` - rich-text package errors.
- `packages/rich-text/src/server/registry.ts` - server policy registry.
- `packages/rich-text/src/server/sanitize.ts` - sanitize policy merge.
- `packages/rich-text/src/server/index.ts` - server barrel.
- `packages/rich-text/src/vue/RichTextEditor.vue` - Naive UI editor shell.
- `packages/rich-text/src/vue/RichTextToolbar.vue` - toolbar renderer.
- `packages/rich-text/src/vue/RichTextToolbarButton.vue` - toolbar button component.
- `packages/rich-text/src/vue/layouts.ts` - toolbar layout exports.
- `packages/rich-text/src/vue/registry.ts` - Vue toolbar item registry.
- `packages/rich-text/src/vue/useRichTextEditor.ts` - editor lifecycle composable.
- `packages/rich-text/src/vue/index.ts` - Vue barrel.

Modify:

- `tsconfig.base.json` - add `@rev30/rich-text` path mappings.
- `apps/client/package.json` - add `@rev30/rich-text` and remove direct Tiptap editor dependencies no longer used by client app code.
- `apps/client/src/style.css` - scan `@rev30/rich-text` for Tailwind/Iconify classes.
- `apps/client/src/features/content/AnnouncementFormDrawer.vue` - consume packaged editor.
- `apps/client/__tests__/features/content/RichTextEditor.test.ts` - remove after equivalent tests move to package.
- `apps/server/package.json` - add `@rev30/rich-text` and remove direct Tiptap/sanitize dependencies no longer used by server app code.
- `apps/server/src/modules/content/announcements/content.ts` - become business adapter around rich-text server derive.
- `apps/server/__tests__/modules/content/announcements/content.test.ts` - keep business error mapping tests, move generic derive tests to package.
- `packages/contracts/package.json` - add `@rev30/rich-text`.
- `packages/contracts/src/content/announcements.ts` - reuse rich-text schema/helper/type.
- `packages/contracts/__tests__/schemas/content/announcements.test.ts` - keep business validation expectations.
- `pnpm-lock.yaml` - dependency lockfile.

---

### Task 1: Scaffold `@rev30/rich-text`

**Files:**

- Create: `packages/rich-text/package.json`
- Create: `packages/rich-text/tsconfig.json`
- Create: `packages/rich-text/tsconfig.app.json`
- Create: `packages/rich-text/tsconfig.test.json`
- Create: `packages/rich-text/vitest.config.ts`
- Modify: `tsconfig.base.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Create package metadata and TypeScript configs**

Create `packages/rich-text/package.json`:

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
  },
  "scripts": {
    "build": "vue-tsc -p tsconfig.app.json --noEmit",
    "typecheck": "vue-tsc -p tsconfig.app.json --noEmit && vue-tsc -p tsconfig.test.json --noEmit",
    "test": "vitest run --pool=threads"
  },
  "dependencies": {
    "@tiptap/core": "^3.23.6",
    "@tiptap/extension-blockquote": "^3.23.6",
    "@tiptap/extension-bold": "^3.23.6",
    "@tiptap/extension-bullet-list": "^3.23.6",
    "@tiptap/extension-code": "^3.23.6",
    "@tiptap/extension-code-block": "^3.23.6",
    "@tiptap/extension-document": "^3.23.6",
    "@tiptap/extension-dropcursor": "^3.23.6",
    "@tiptap/extension-gapcursor": "^3.23.6",
    "@tiptap/extension-hard-break": "^3.23.6",
    "@tiptap/extension-heading": "^3.23.6",
    "@tiptap/extension-horizontal-rule": "^3.23.6",
    "@tiptap/extension-italic": "^3.23.6",
    "@tiptap/extension-link": "^3.23.6",
    "@tiptap/extension-list-item": "^3.23.6",
    "@tiptap/extension-ordered-list": "^3.23.6",
    "@tiptap/extension-paragraph": "^3.23.6",
    "@tiptap/extension-strike": "^3.23.6",
    "@tiptap/extension-text": "^3.23.6",
    "@tiptap/extension-underline": "^3.23.6",
    "@tiptap/extensions": "^3.23.6",
    "@tiptap/html": "^3.23.6",
    "@tiptap/pm": "^3.23.6",
    "@tiptap/vue-3": "^3.23.6",
    "naive-ui": "^2.44.1",
    "sanitize-html": "^2.17.4",
    "vue": "^3.5.34",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/sanitize-html": "^2.16.1",
    "@vitejs/plugin-vue": "^6.0.7",
    "@vue/test-utils": "^2.4.10",
    "happy-dom": "^20.9.0",
    "vite": "^8.0.14",
    "vitest": "^4.1.7",
    "vue-tsc": "^3.3.1"
  }
}
```

Create `packages/rich-text/tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.test.json" }]
}
```

Create `packages/rich-text/tsconfig.app.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `packages/rich-text/tsconfig.test.json`:

```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["__tests__/**/*.ts"],
  "exclude": []
}
```

Create `packages/rich-text/vitest.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    unstubGlobals: true,
  },
})
```

- [ ] **Step 2: Add root TypeScript path mappings**

Modify `tsconfig.base.json` paths:

```json
"@rev30/rich-text": ["./packages/rich-text/src/index.ts"],
"@rev30/rich-text/presets": ["./packages/rich-text/src/presets/index.ts"],
"@rev30/rich-text/schema": ["./packages/rich-text/src/schema/index.ts"],
"@rev30/rich-text/server": ["./packages/rich-text/src/server/index.ts"],
"@rev30/rich-text/vue": ["./packages/rich-text/src/vue/index.ts"]
```

- [ ] **Step 3: Install workspace dependencies**

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` updates and `packages/rich-text/node_modules` links are created.

- [ ] **Step 4: Verify the empty package participates in workspace scripts**

Run:

```bash
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.base.json packages/rich-text
git commit -m "chore: scaffold rich text package"
```

---

### Task 2: Core Types, Schema, Features, And Compact Preset

**Files:**

- Create: `packages/rich-text/__tests__/schema.test.ts`
- Create: `packages/rich-text/__tests__/presets/compact.test.ts`
- Create: `packages/rich-text/src/core/feature.ts`
- Create: `packages/rich-text/src/core/preset.ts`
- Create: `packages/rich-text/src/core/toolbar.ts`
- Create: `packages/rich-text/src/features/base/shared.ts`
- Create: `packages/rich-text/src/features/bold/shared.ts`
- Create: `packages/rich-text/src/features/italic/shared.ts`
- Create: `packages/rich-text/src/features/underline/shared.ts`
- Create: `packages/rich-text/src/features/strike/shared.ts`
- Create: `packages/rich-text/src/features/heading/shared.ts`
- Create: `packages/rich-text/src/features/blockquote/shared.ts`
- Create: `packages/rich-text/src/features/list/shared.ts`
- Create: `packages/rich-text/src/features/horizontal-rule/shared.ts`
- Create: `packages/rich-text/src/features/link/shared.ts`
- Create: `packages/rich-text/src/features/code/shared.ts`
- Create: `packages/rich-text/src/features/code-block/shared.ts`
- Create: `packages/rich-text/src/features/history/shared.ts`
- Create: `packages/rich-text/src/presets/compact.ts`
- Create: `packages/rich-text/src/presets/index.ts`
- Create: `packages/rich-text/src/schema/document.ts`
- Create: `packages/rich-text/src/schema/index.ts`
- Create: `packages/rich-text/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

Create `packages/rich-text/__tests__/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hasNonBlankRichText, richTextDocumentSchema } from '../src/schema'

describe('rich text schema helpers', () => {
  it('accepts doc-shaped Tiptap JSON', () => {
    expect(
      richTextDocumentSchema.parse({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toMatchObject({ type: 'doc' })
  })

  it('rejects non-doc roots', () => {
    expect(richTextDocumentSchema.safeParse({ type: 'paragraph' }).success).toBe(false)
  })

  it('detects non-blank nested text', () => {
    expect(
      hasNonBlankRichText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '  hello  ' }] }],
      }),
    ).toBe(true)
    expect(
      hasNonBlankRichText({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }],
      }),
    ).toBe(false)
    expect(hasNonBlankRichText(null)).toBe(false)
  })
})
```

- [ ] **Step 2: Write failing compact preset tests**

Create `packages/rich-text/__tests__/presets/compact.test.ts`:

```ts
import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { compactRichTextPreset, compactRichTextToolbarLayout } from '../../src/presets'
import { collectRichTextExtensions } from '../../src/core/preset'

describe('compact rich text preset', () => {
  it('enables current editor features and compatibility features', () => {
    expect(compactRichTextPreset.features.map((feature) => feature.key)).toEqual([
      'base',
      'bold',
      'italic',
      'underline',
      'strike',
      'heading',
      'blockquote',
      'list',
      'horizontal-rule',
      'link',
      'code',
      'code-block',
      'history',
    ])
  })

  it('keeps the current visible toolbar layout', () => {
    expect(compactRichTextToolbarLayout.groups).toEqual([
      { key: 'marks', items: ['bold', 'italic', 'underline'] },
      { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
      { key: 'lists', items: ['bullet-list', 'ordered-list'] },
      { key: 'insert', items: ['horizontal-rule'] },
      { key: 'history', items: ['undo', 'redo'] },
    ])
  })

  it('does not register duplicate Tiptap extensions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    getSchema(collectRichTextExtensions(compactRichTextPreset))

    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Duplicate extension names found'),
      ),
    ).toBe(false)

    warnSpy.mockRestore()
  })
})
```

- [ ] **Step 3: Run tests and confirm they fail**

Run:

```bash
pnpm --filter @rev30/rich-text test -- schema.test.ts compact.test.ts
```

Expected: FAIL because `src/schema`, `src/presets`, and `src/core` do not exist yet.

- [ ] **Step 4: Implement core helpers**

Create `packages/rich-text/src/core/feature.ts`:

```ts
import type { AnyExtension } from '@tiptap/core'

export type RichTextIconClass = `i-[${string}--${string}]`
export type RichTextExtension = AnyExtension | AnyExtension[]

export interface RichTextFeature {
  key: string
  label: string
  icon?: RichTextIconClass
  extension: () => RichTextExtension
}

export function defineRichTextFeature(feature: RichTextFeature): RichTextFeature {
  return feature
}
```

Create `packages/rich-text/src/core/preset.ts`:

```ts
import type { AnyExtension } from '@tiptap/core'
import type { RichTextFeature } from './feature'

export interface RichTextPreset {
  key: string
  features: RichTextFeature[]
}

export function defineRichTextPreset(preset: RichTextPreset): RichTextPreset {
  return preset
}

export function collectRichTextExtensions(preset: RichTextPreset): AnyExtension[] {
  return preset.features.flatMap((feature) => feature.extension())
}
```

Create `packages/rich-text/src/core/toolbar.ts`:

```ts
export interface RichTextToolbarLayoutGroup {
  key: string
  items: string[]
}

export interface RichTextToolbarLayout {
  groups: RichTextToolbarLayoutGroup[]
}

export function defineRichTextToolbarLayout(
  groups: RichTextToolbarLayoutGroup[],
): RichTextToolbarLayout {
  return { groups }
}
```

- [ ] **Step 5: Implement schema helper**

Create `packages/rich-text/src/schema/document.ts`:

```ts
import { z } from 'zod'

export const richTextDocumentSchema = z.looseObject({
  type: z.literal('doc'),
})

export function hasNonBlankRichText(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  if ('text' in value && typeof value.text === 'string' && value.text.trim().length > 0) {
    return true
  }

  if (!('content' in value) || !Array.isArray(value.content)) {
    return false
  }

  return value.content.some(hasNonBlankRichText)
}

export type RichTextDocument = z.infer<typeof richTextDocumentSchema>
```

Create `packages/rich-text/src/schema/index.ts`:

```ts
export * from './document'
```

- [ ] **Step 6: Implement shared feature files**

Create feature shared files with these exact exports:

```ts
// packages/rich-text/src/features/base/shared.ts
import Document from '@tiptap/extension-document'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { defineRichTextFeature } from '../../core/feature'

export const baseFeature = defineRichTextFeature({
  key: 'base',
  label: '基础结构',
  extension: () => [Document, Paragraph, Text, HardBreak, Dropcursor, Gapcursor],
})
```

```ts
// packages/rich-text/src/features/bold/shared.ts
import Bold from '@tiptap/extension-bold'
import { defineRichTextFeature } from '../../core/feature'

export const boldFeature = defineRichTextFeature({
  key: 'bold',
  label: '加粗',
  icon: 'i-[lucide--bold]',
  extension: () => Bold,
})
```

```ts
// packages/rich-text/src/features/italic/shared.ts
import Italic from '@tiptap/extension-italic'
import { defineRichTextFeature } from '../../core/feature'

export const italicFeature = defineRichTextFeature({
  key: 'italic',
  label: '斜体',
  icon: 'i-[lucide--italic]',
  extension: () => Italic,
})
```

```ts
// packages/rich-text/src/features/underline/shared.ts
import Underline from '@tiptap/extension-underline'
import { defineRichTextFeature } from '../../core/feature'

export const underlineFeature = defineRichTextFeature({
  key: 'underline',
  label: '下划线',
  icon: 'i-[lucide--underline]',
  extension: () => Underline,
})
```

```ts
// packages/rich-text/src/features/strike/shared.ts
import Strike from '@tiptap/extension-strike'
import { defineRichTextFeature } from '../../core/feature'

export const strikeFeature = defineRichTextFeature({
  key: 'strike',
  label: '删除线',
  icon: 'i-[lucide--strikethrough]',
  extension: () => Strike,
})
```

```ts
// packages/rich-text/src/features/heading/shared.ts
import Heading from '@tiptap/extension-heading'
import { defineRichTextFeature } from '../../core/feature'

export const headingFeature = defineRichTextFeature({
  key: 'heading',
  label: '标题',
  icon: 'i-[lucide--heading]',
  extension: () => Heading.configure({ levels: [1, 2, 3] }),
})
```

```ts
// packages/rich-text/src/features/blockquote/shared.ts
import Blockquote from '@tiptap/extension-blockquote'
import { defineRichTextFeature } from '../../core/feature'

export const blockquoteFeature = defineRichTextFeature({
  key: 'blockquote',
  label: '引用',
  icon: 'i-[lucide--quote]',
  extension: () => Blockquote,
})
```

```ts
// packages/rich-text/src/features/list/shared.ts
import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import { defineRichTextFeature } from '../../core/feature'

export const listFeature = defineRichTextFeature({
  key: 'list',
  label: '列表',
  icon: 'i-[lucide--list]',
  extension: () => [BulletList, OrderedList, ListItem],
})
```

```ts
// packages/rich-text/src/features/horizontal-rule/shared.ts
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { defineRichTextFeature } from '../../core/feature'

export const horizontalRuleFeature = defineRichTextFeature({
  key: 'horizontal-rule',
  label: '分割线',
  icon: 'i-[lucide--minus]',
  extension: () => HorizontalRule,
})
```

```ts
// packages/rich-text/src/features/link/shared.ts
import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'

export const linkFeature = defineRichTextFeature({
  key: 'link',
  label: '链接',
  icon: 'i-[lucide--link]',
  extension: () =>
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
})
```

```ts
// packages/rich-text/src/features/code/shared.ts
import Code from '@tiptap/extension-code'
import { defineRichTextFeature } from '../../core/feature'

export const codeFeature = defineRichTextFeature({
  key: 'code',
  label: '行内代码',
  icon: 'i-[lucide--code]',
  extension: () => Code,
})
```

```ts
// packages/rich-text/src/features/code-block/shared.ts
import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextFeature } from '../../core/feature'

export const codeBlockFeature = defineRichTextFeature({
  key: 'code-block',
  label: '代码块',
  icon: 'i-[lucide--square-code]',
  extension: () => CodeBlock,
})
```

```ts
// packages/rich-text/src/features/history/shared.ts
import { UndoRedo } from '@tiptap/extensions'
import { defineRichTextFeature } from '../../core/feature'

export const historyFeature = defineRichTextFeature({
  key: 'history',
  label: '历史',
  icon: 'i-[lucide--undo-2]',
  extension: () => UndoRedo,
})
```

- [ ] **Step 7: Implement compact preset and root exports**

Create `packages/rich-text/src/presets/compact.ts`:

```ts
import { defineRichTextPreset } from '../core/preset'
import { defineRichTextToolbarLayout } from '../core/toolbar'
import { baseFeature } from '../features/base/shared'
import { blockquoteFeature } from '../features/blockquote/shared'
import { boldFeature } from '../features/bold/shared'
import { codeBlockFeature } from '../features/code-block/shared'
import { codeFeature } from '../features/code/shared'
import { headingFeature } from '../features/heading/shared'
import { historyFeature } from '../features/history/shared'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { italicFeature } from '../features/italic/shared'
import { linkFeature } from '../features/link/shared'
import { listFeature } from '../features/list/shared'
import { strikeFeature } from '../features/strike/shared'
import { underlineFeature } from '../features/underline/shared'

export const compactRichTextPreset = defineRichTextPreset({
  key: 'compact',
  features: [
    baseFeature,
    boldFeature,
    italicFeature,
    underlineFeature,
    strikeFeature,
    headingFeature,
    blockquoteFeature,
    listFeature,
    horizontalRuleFeature,
    linkFeature,
    codeFeature,
    codeBlockFeature,
    historyFeature,
  ],
})

export const compactRichTextToolbarLayout = defineRichTextToolbarLayout([
  { key: 'marks', items: ['bold', 'italic', 'underline'] },
  { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
  { key: 'lists', items: ['bullet-list', 'ordered-list'] },
  { key: 'insert', items: ['horizontal-rule'] },
  { key: 'history', items: ['undo', 'redo'] },
])
```

Create `packages/rich-text/src/presets/index.ts`:

```ts
export * from './compact'
```

Create `packages/rich-text/src/index.ts`:

```ts
export type { RichTextFeature, RichTextIconClass } from './core/feature'
export type { RichTextPreset } from './core/preset'
export type { RichTextToolbarLayout, RichTextToolbarLayoutGroup } from './core/toolbar'
export type { RichTextDocument } from './schema'
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
pnpm --filter @rev30/rich-text test -- schema.test.ts compact.test.ts
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/rich-text
git commit -m "feat: add rich text core preset"
```

---

### Task 3: Server Derivation And Sanitize Policies

**Files:**

- Create: `packages/rich-text/__tests__/server/derive.test.ts`
- Create: `packages/rich-text/src/features/bold/server.ts`
- Create: `packages/rich-text/src/features/italic/server.ts`
- Create: `packages/rich-text/src/features/underline/server.ts`
- Create: `packages/rich-text/src/features/strike/server.ts`
- Create: `packages/rich-text/src/features/heading/server.ts`
- Create: `packages/rich-text/src/features/blockquote/server.ts`
- Create: `packages/rich-text/src/features/list/server.ts`
- Create: `packages/rich-text/src/features/horizontal-rule/server.ts`
- Create: `packages/rich-text/src/features/link/server.ts`
- Create: `packages/rich-text/src/features/code/server.ts`
- Create: `packages/rich-text/src/features/code-block/server.ts`
- Create: `packages/rich-text/src/server/derive.ts`
- Create: `packages/rich-text/src/server/errors.ts`
- Create: `packages/rich-text/src/server/registry.ts`
- Create: `packages/rich-text/src/server/sanitize.ts`
- Create: `packages/rich-text/src/server/index.ts`

- [ ] **Step 1: Write failing server tests**

Create `packages/rich-text/__tests__/server/derive.test.ts` by moving the generic assertions from `apps/server/__tests__/modules/content/announcements/content.test.ts` and targeting package exports:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadServerHelpers() {
  vi.resetModules()

  return await import('../../src/server')
}

afterEach(() => {
  vi.doUnmock('@tiptap/html')
  vi.doUnmock('@tiptap/html/server')
  vi.resetModules()
})

describe('deriveRichTextContent', () => {
  it('uses the server tiptap html entry instead of the browser entry', async () => {
    vi.resetModules()
    const serverGenerateHtml = vi.fn(() => '<p>维护通知</p>')
    vi.doMock('@tiptap/html/server', () => ({ generateHTML: serverGenerateHtml }))

    const { deriveRichTextContent } = await import('../../src/server')
    const { compactRichTextPreset } = await import('../../src/presets')

    expect(
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
        },
        { preset: compactRichTextPreset },
      ).html,
    ).toBe('<p>维护通知</p>')
    expect(serverGenerateHtml).toHaveBeenCalledOnce()
  })

  it('derives sanitized html from supported tiptap json', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '请访问 ' },
              {
                type: 'text',
                text: '帮助中心',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/help' } }],
              },
            ],
          },
        ],
      },
      { preset: compactRichTextPreset },
    )

    expect(content.text).toBe('维护通知\n\n请访问 帮助中心')
    expect(content.html).toContain('<h2>维护通知</h2>')
    expect(content.html).toContain('href="https://example.com/help"')
    expect(content.html).toContain('target="_blank"')
    expect(content.html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('removes unsafe link href protocols and normalizes target and rel', async () => {
    const { deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '危险链接',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'javascript:alert(1)', target: '_self', rel: 'opener' },
                  },
                ],
              },
            ],
          },
        ],
      },
      { preset: compactRichTextPreset },
    )

    expect(content.html).toBe(
      '<p><a target="_blank" rel="noopener noreferrer nofollow">危险链接</a></p>',
    )
  })

  it('rejects empty and unsupported documents', async () => {
    const { RichTextContentInvalidError, deriveRichTextContent } = await loadServerHelpers()
    const { compactRichTextPreset } = await import('../../src/presets')

    expect(() =>
      deriveRichTextContent(
        { type: 'doc', content: [{ type: 'paragraph' }] },
        { preset: compactRichTextPreset },
      ),
    ).toThrow(RichTextContentInvalidError)

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
        },
        { preset: compactRichTextPreset },
      ),
    ).toThrow(RichTextContentInvalidError)
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
pnpm --filter @rev30/rich-text test -- derive.test.ts
```

Expected: FAIL because server exports and policies are missing.

- [ ] **Step 3: Implement server policy types and merge helper**

Create `packages/rich-text/src/server/sanitize.ts`:

```ts
import sanitizeHtml from 'sanitize-html'

export interface RichTextHtmlPolicy {
  allowedTags?: string[]
  allowedAttributes?: sanitizeHtml.IOptions['allowedAttributes']
  allowedSchemes?: string[]
  transformTags?: sanitizeHtml.IOptions['transformTags']
}

export function mergeRichTextHtmlPolicies(policies: RichTextHtmlPolicy[]): sanitizeHtml.IOptions {
  const allowedTags = new Set<string>()
  const allowedSchemes = new Set(['http', 'https', 'mailto', 'tel'])
  const allowedAttributes: Record<string, string[]> = {}
  const transformTags: NonNullable<sanitizeHtml.IOptions['transformTags']> = {}

  for (const policy of policies) {
    for (const tag of policy.allowedTags ?? []) {
      allowedTags.add(tag)
    }

    for (const scheme of policy.allowedSchemes ?? []) {
      allowedSchemes.add(scheme)
    }

    for (const [tag, attributes] of Object.entries(policy.allowedAttributes ?? {})) {
      const current = new Set(allowedAttributes[tag] ?? [])
      for (const attribute of attributes) {
        current.add(attribute)
      }
      allowedAttributes[tag] = [...current]
    }

    Object.assign(transformTags, policy.transformTags)
  }

  return {
    allowedTags: [...allowedTags],
    allowedAttributes,
    allowedSchemes: [...allowedSchemes],
    allowProtocolRelative: false,
    transformTags,
  }
}

export function sanitizeRichTextHtml(html: string, policies: RichTextHtmlPolicy[]) {
  return sanitizeHtml(html, mergeRichTextHtmlPolicies(policies))
}
```

Create `packages/rich-text/src/server/errors.ts`:

```ts
export class RichTextContentInvalidError extends Error {
  constructor() {
    super('Rich text content is invalid')
  }
}
```

- [ ] **Step 4: Implement feature server policies**

Create these policy files:

```ts
// packages/rich-text/src/features/bold/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const boldHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['strong'],
}
```

```ts
// packages/rich-text/src/features/italic/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const italicHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['em'],
}
```

```ts
// packages/rich-text/src/features/underline/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const underlineHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['u'],
}
```

```ts
// packages/rich-text/src/features/strike/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const strikeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['s'],
}
```

```ts
// packages/rich-text/src/features/heading/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const headingHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['h1', 'h2', 'h3'],
}
```

```ts
// packages/rich-text/src/features/blockquote/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const blockquoteHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['blockquote'],
}
```

```ts
// packages/rich-text/src/features/list/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const listHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['ul', 'ol', 'li'],
}
```

```ts
// packages/rich-text/src/features/horizontal-rule/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const horizontalRuleHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['hr'],
}
```

```ts
// packages/rich-text/src/features/code/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const codeHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['code'],
}
```

```ts
// packages/rich-text/src/features/code-block/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre'],
}
```

```ts
// packages/rich-text/src/features/link/server.ts
import type { RichTextHtmlPolicy } from '../../server/sanitize'

const SAFE_LINK_TARGET = '_blank'
const SAFE_LINK_REL = 'noopener noreferrer nofollow'

export const linkHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['a'],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: {
        ...attribs,
        target: SAFE_LINK_TARGET,
        rel: SAFE_LINK_REL,
      },
    }),
  },
}
```

- [ ] **Step 5: Implement server registry and derive**

Create `packages/rich-text/src/server/registry.ts`:

```ts
import { blockquoteFeature } from '../features/blockquote/shared'
import { blockquoteHtmlPolicy } from '../features/blockquote/server'
import { boldFeature } from '../features/bold/shared'
import { boldHtmlPolicy } from '../features/bold/server'
import { codeBlockFeature } from '../features/code-block/shared'
import { codeBlockHtmlPolicy } from '../features/code-block/server'
import { codeFeature } from '../features/code/shared'
import { codeHtmlPolicy } from '../features/code/server'
import { headingFeature } from '../features/heading/shared'
import { headingHtmlPolicy } from '../features/heading/server'
import { horizontalRuleFeature } from '../features/horizontal-rule/shared'
import { horizontalRuleHtmlPolicy } from '../features/horizontal-rule/server'
import { italicFeature } from '../features/italic/shared'
import { italicHtmlPolicy } from '../features/italic/server'
import { linkFeature } from '../features/link/shared'
import { linkHtmlPolicy } from '../features/link/server'
import { listFeature } from '../features/list/shared'
import { listHtmlPolicy } from '../features/list/server'
import { strikeFeature } from '../features/strike/shared'
import { strikeHtmlPolicy } from '../features/strike/server'
import { underlineFeature } from '../features/underline/shared'
import { underlineHtmlPolicy } from '../features/underline/server'
import type { RichTextPreset } from '../core/preset'
import type { RichTextHtmlPolicy } from './sanitize'

const baseDocumentPolicy: RichTextHtmlPolicy = {
  allowedTags: ['p', 'br'],
}

const defaultPolicyByFeatureKey = new Map<string, RichTextHtmlPolicy>([
  ['base', baseDocumentPolicy],
  [boldFeature.key, boldHtmlPolicy],
  [italicFeature.key, italicHtmlPolicy],
  [underlineFeature.key, underlineHtmlPolicy],
  [strikeFeature.key, strikeHtmlPolicy],
  [headingFeature.key, headingHtmlPolicy],
  [blockquoteFeature.key, blockquoteHtmlPolicy],
  [listFeature.key, listHtmlPolicy],
  [horizontalRuleFeature.key, horizontalRuleHtmlPolicy],
  [linkFeature.key, linkHtmlPolicy],
  [codeFeature.key, codeHtmlPolicy],
  [codeBlockFeature.key, codeBlockHtmlPolicy],
])

export function getRichTextHtmlPolicies(preset: RichTextPreset): RichTextHtmlPolicy[] {
  return preset.features.flatMap((feature) => {
    const policy = defaultPolicyByFeatureKey.get(feature.key)
    return policy === undefined ? [] : [policy]
  })
}
```

Create `packages/rich-text/src/server/derive.ts`:

```ts
import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html/server'
import { Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model'
import type { RichTextPreset } from '../core/preset'
import { collectRichTextExtensions } from '../core/preset'
import { RichTextContentInvalidError } from './errors'
import { getRichTextHtmlPolicies } from './registry'
import { sanitizeRichTextHtml } from './sanitize'

const schemaCache = new WeakMap<RichTextPreset, Schema>()

export interface DeriveRichTextContentOptions {
  preset: RichTextPreset
}

export interface DerivedRichTextContent {
  text: string
  html: string
}

function getPresetSchema(preset: RichTextPreset) {
  const cachedSchema = schemaCache.get(preset)

  if (cachedSchema !== undefined) {
    return cachedSchema
  }

  const schema = getSchema(collectRichTextExtensions(preset))
  schemaCache.set(preset, schema)

  return schema
}

export function deriveRichTextContent(
  contentJson: unknown,
  { preset }: DeriveRichTextContentOptions,
): DerivedRichTextContent {
  try {
    const document = ProseMirrorNode.fromJSON(getPresetSchema(preset), contentJson)
    const text = document.textBetween(0, document.content.size, '\n\n').trim()

    if (text.length === 0) {
      throw new RichTextContentInvalidError()
    }

    const html = generateHTML(document.toJSON(), collectRichTextExtensions(preset))

    return {
      text,
      html: sanitizeRichTextHtml(html, getRichTextHtmlPolicies(preset)),
    }
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw error
    }

    throw new RichTextContentInvalidError()
  }
}
```

Create `packages/rich-text/src/server/index.ts`:

```ts
export * from './derive'
export * from './errors'
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- derive.test.ts
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rich-text
git commit -m "feat: add rich text server derivation"
```

---

### Task 4: Vue Editor And Toolbar Components

**Files:**

- Create: `packages/rich-text/__tests__/vue/RichTextEditor.test.ts`
- Create: `packages/rich-text/src/features/bold/vue.ts`
- Create: `packages/rich-text/src/features/italic/vue.ts`
- Create: `packages/rich-text/src/features/underline/vue.ts`
- Create: `packages/rich-text/src/features/heading/vue.ts`
- Create: `packages/rich-text/src/features/blockquote/vue.ts`
- Create: `packages/rich-text/src/features/list/vue.ts`
- Create: `packages/rich-text/src/features/horizontal-rule/vue.ts`
- Create: `packages/rich-text/src/features/history/vue.ts`
- Create: `packages/rich-text/src/vue/RichTextEditor.vue`
- Create: `packages/rich-text/src/vue/RichTextToolbar.vue`
- Create: `packages/rich-text/src/vue/RichTextToolbarButton.vue`
- Create: `packages/rich-text/src/vue/layouts.ts`
- Create: `packages/rich-text/src/vue/registry.ts`
- Create: `packages/rich-text/src/vue/useRichTextEditor.ts`
- Create: `packages/rich-text/src/vue/index.ts`

- [ ] **Step 1: Write failing Vue tests**

Create `packages/rich-text/__tests__/vue/RichTextEditor.test.ts` by moving current editor component tests and adding layout checks:

```ts
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import { compactRichTextPreset, compactRichTextToolbarLayout } from '../../src/presets'
import type { RichTextDocument } from '../../src/schema'

const contentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const toolbarDataTests = [
  'rich-text-bold',
  'rich-text-italic',
  'rich-text-underline',
  'rich-text-heading-1',
  'rich-text-heading-2',
  'rich-text-heading-3',
  'rich-text-blockquote',
  'rich-text-bullet-list',
  'rich-text-ordered-list',
  'rich-text-horizontal-rule',
  'rich-text-undo',
  'rich-text-redo',
]

async function getEditable(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('.ProseMirror[contenteditable="true"]').exists()).toBe(true)
  })

  return wrapper.get('.ProseMirror[contenteditable="true"]')
}

describe('RichTextEditor', () => {
  it('renders editor content and compact toolbar buttons', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
        toolbarLayout: compactRichTextToolbarLayout,
      },
    })

    const editable = await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-toolbar-group"]')).toHaveLength(5)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(editable.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    const editable = await getEditable(wrapper)
    editable.element.innerHTML = '<p>新的通知</p>'
    await editable.trigger('input')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新的通知' }] }],
    })
  })

  it('syncs external modelValue changes into the editor DOM', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    await getEditable(wrapper)
    await wrapper.setProps({
      modelValue: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '新的外部内容' }] }],
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').text()).toContain('新的外部内容')
    })
  })

  it('toggles editor editability when disabled changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    await getEditable(wrapper)
    await wrapper.setProps({ disabled: true })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('false')
    })

    await wrapper.setProps({ disabled: false })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('true')
    })
  })
})
```

- [ ] **Step 2: Run tests and confirm they fail**

Run:

```bash
pnpm --filter @rev30/rich-text test -- RichTextEditor.test.ts
```

Expected: FAIL because Vue components and toolbar registry do not exist yet.

- [ ] **Step 3: Implement toolbar item types and registry**

Append to `packages/rich-text/src/core/toolbar.ts`:

```ts
import type { Editor } from '@tiptap/vue-3'
import type { RichTextIconClass } from './feature'

export interface RichTextToolbarItem {
  key: string
  label: string
  icon: RichTextIconClass
  dataTest: string
  run: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
}

export function defineRichTextToolbarItem(item: RichTextToolbarItem): RichTextToolbarItem {
  return item
}
```

Create `packages/rich-text/src/vue/registry.ts`:

```ts
import type { RichTextPreset } from '../core/preset'
import type { RichTextToolbarItem } from '../core/toolbar'
import { blockquoteToolbarItems } from '../features/blockquote/vue'
import { boldToolbarItems } from '../features/bold/vue'
import { headingToolbarItems } from '../features/heading/vue'
import { historyToolbarItems } from '../features/history/vue'
import { horizontalRuleToolbarItems } from '../features/horizontal-rule/vue'
import { italicToolbarItems } from '../features/italic/vue'
import { listToolbarItems } from '../features/list/vue'
import { underlineToolbarItems } from '../features/underline/vue'

const toolbarItemsByFeatureKey = new Map<string, RichTextToolbarItem[]>([
  ['bold', boldToolbarItems],
  ['italic', italicToolbarItems],
  ['underline', underlineToolbarItems],
  ['heading', headingToolbarItems],
  ['blockquote', blockquoteToolbarItems],
  ['list', listToolbarItems],
  ['horizontal-rule', horizontalRuleToolbarItems],
  ['history', historyToolbarItems],
])

export function getRichTextToolbarItems(preset: RichTextPreset) {
  return new Map(
    preset.features
      .flatMap((feature) => toolbarItemsByFeatureKey.get(feature.key) ?? [])
      .map((item) => [item.key, item]),
  )
}
```

- [ ] **Step 4: Implement feature toolbar items**

Create toolbar item files following the current button behavior:

```ts
// packages/rich-text/src/features/bold/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'
import { boldFeature } from './shared'

export const boldToolbarItems = [
  defineRichTextToolbarItem({
    key: 'bold',
    label: boldFeature.label,
    icon: boldFeature.icon!,
    dataTest: 'rich-text-bold',
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/italic/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'
import { italicFeature } from './shared'

export const italicToolbarItems = [
  defineRichTextToolbarItem({
    key: 'italic',
    label: italicFeature.label,
    icon: italicFeature.icon!,
    dataTest: 'rich-text-italic',
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/underline/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'
import { underlineFeature } from './shared'

export const underlineToolbarItems = [
  defineRichTextToolbarItem({
    key: 'underline',
    label: underlineFeature.label,
    icon: underlineFeature.icon!,
    dataTest: 'rich-text-underline',
    isActive: (editor) => editor.isActive('underline'),
    run: (editor) => editor.chain().focus().toggleUnderline().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/heading/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'

export const headingToolbarItems = [
  defineRichTextToolbarItem({
    key: 'heading-1',
    label: '一级标题',
    icon: 'i-[lucide--heading-1]',
    dataTest: 'rich-text-heading-1',
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  }),
  defineRichTextToolbarItem({
    key: 'heading-2',
    label: '二级标题',
    icon: 'i-[lucide--heading-2]',
    dataTest: 'rich-text-heading-2',
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  }),
  defineRichTextToolbarItem({
    key: 'heading-3',
    label: '三级标题',
    icon: 'i-[lucide--heading-3]',
    dataTest: 'rich-text-heading-3',
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  }),
]
```

```ts
// packages/rich-text/src/features/blockquote/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'
import { blockquoteFeature } from './shared'

export const blockquoteToolbarItems = [
  defineRichTextToolbarItem({
    key: 'blockquote',
    label: blockquoteFeature.label,
    icon: blockquoteFeature.icon!,
    dataTest: 'rich-text-blockquote',
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/list/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'

export const listToolbarItems = [
  defineRichTextToolbarItem({
    key: 'bullet-list',
    label: '无序列表',
    icon: 'i-[lucide--list]',
    dataTest: 'rich-text-bullet-list',
    isActive: (editor) => editor.isActive('bulletList'),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  }),
  defineRichTextToolbarItem({
    key: 'ordered-list',
    label: '有序列表',
    icon: 'i-[lucide--list-ordered]',
    dataTest: 'rich-text-ordered-list',
    isActive: (editor) => editor.isActive('orderedList'),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/horizontal-rule/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'
import { horizontalRuleFeature } from './shared'

export const horizontalRuleToolbarItems = [
  defineRichTextToolbarItem({
    key: 'horizontal-rule',
    label: horizontalRuleFeature.label,
    icon: horizontalRuleFeature.icon!,
    dataTest: 'rich-text-horizontal-rule',
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  }),
]
```

```ts
// packages/rich-text/src/features/history/vue.ts
import { defineRichTextToolbarItem } from '../../core/toolbar'

export const historyToolbarItems = [
  defineRichTextToolbarItem({
    key: 'undo',
    label: '撤销',
    icon: 'i-[lucide--undo-2]',
    dataTest: 'rich-text-undo',
    run: (editor) => editor.chain().focus().undo().run(),
  }),
  defineRichTextToolbarItem({
    key: 'redo',
    label: '重做',
    icon: 'i-[lucide--redo-2]',
    dataTest: 'rich-text-redo',
    run: (editor) => editor.chain().focus().redo().run(),
  }),
]
```

- [ ] **Step 5: Implement editor composable and components**

Create `packages/rich-text/src/vue/useRichTextEditor.ts`:

```ts
import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { Editor } from '@tiptap/vue-3'
import type { RichTextDocument } from '../schema'
import type { RichTextPreset } from '../core/preset'
import { collectRichTextExtensions } from '../core/preset'

export interface UseRichTextEditorOptions {
  modelValue: Ref<RichTextDocument>
  disabled: Ref<boolean>
  preset: Ref<RichTextPreset>
  emitUpdate: (value: RichTextDocument) => void
  emitBlur: () => void
}

export function useRichTextEditor(options: UseRichTextEditorOptions) {
  const editor = shallowRef(
    new Editor({
      content: options.modelValue.value,
      editable: !options.disabled.value,
      extensions: collectRichTextExtensions(options.preset.value),
      onBlur() {
        options.emitBlur()
      },
      onUpdate({ editor }) {
        options.emitUpdate(editor.getJSON() as RichTextDocument)
      },
    }),
  )

  watch(options.disabled, (disabled) => {
    editor.value?.setEditable(!disabled)
  })

  watch(options.modelValue, (value) => {
    const currentValue = editor.value?.getJSON()
    if (JSON.stringify(currentValue) === JSON.stringify(value)) {
      return
    }

    editor.value?.commands.setContent(value, { emitUpdate: false })
  })

  onBeforeUnmount(() => {
    editor.value?.destroy()
  })

  return editor
}
```

Create `packages/rich-text/src/vue/RichTextToolbarButton.vue`:

```vue
<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import type { RichTextToolbarItem } from '../core/toolbar'

const props = defineProps<{
  editor: Editor | undefined
  item: RichTextToolbarItem
  disabled?: boolean
}>()
</script>

<template>
  <NButton
    :data-test="item.dataTest"
    :disabled="disabled || editor === undefined || item.isDisabled?.(editor) === true"
    quaternary
    :title="item.label"
    :aria-label="item.label"
    @click="editor && item.run(editor)"
  >
    <span :class="item.icon" aria-hidden="true" />
  </NButton>
</template>
```

Create `packages/rich-text/src/vue/RichTextToolbar.vue`:

```vue
<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButtonGroup } from 'naive-ui'
import type { RichTextToolbarItem, RichTextToolbarLayout } from '../core/toolbar'
import RichTextToolbarButton from './RichTextToolbarButton.vue'

const props = defineProps<{
  editor: Editor | undefined
  layout: RichTextToolbarLayout
  items: Map<string, RichTextToolbarItem>
  disabled?: boolean
}>()
</script>

<template>
  <div class="flex flex-wrap gap-1 border-b border-(--app-input-divider-color) px-2 py-1">
    <NButtonGroup
      v-for="(group, index) in layout.groups"
      :key="group.key"
      data-test="rich-text-toolbar-group"
      size="small"
      :class="index === 0 ? '' : 'border-l border-(--app-input-divider-color) pl-1'"
    >
      <RichTextToolbarButton
        v-for="itemKey in group.items"
        :key="itemKey"
        :editor="editor"
        :item="items.get(itemKey)!"
        :disabled="disabled"
      />
    </NButtonGroup>
  </div>
</template>
```

Create `packages/rich-text/src/vue/RichTextEditor.vue`:

```vue
<script setup lang="ts">
import { computed, toRef } from 'vue'
import { EditorContent } from '@tiptap/vue-3'
import type { RichTextPreset } from '../core/preset'
import type { RichTextToolbarLayout } from '../core/toolbar'
import { compactRichTextPreset, compactRichTextToolbarLayout } from '../presets'
import type { RichTextDocument } from '../schema'
import RichTextToolbar from './RichTextToolbar.vue'
import { getRichTextToolbarItems } from './registry'
import { useRichTextEditor } from './useRichTextEditor'

const props = withDefaults(
  defineProps<{
    modelValue: RichTextDocument
    preset?: RichTextPreset
    toolbarLayout?: RichTextToolbarLayout
    disabled?: boolean
    minHeight?: number
  }>(),
  {
    preset: () => compactRichTextPreset,
    toolbarLayout: () => compactRichTextToolbarLayout,
    disabled: false,
    minHeight: 240,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: RichTextDocument]
  blur: []
}>()

const presetRef = toRef(props, 'preset')
const editor = useRichTextEditor({
  modelValue: toRef(props, 'modelValue'),
  disabled: toRef(props, 'disabled'),
  preset: presetRef,
  emitUpdate: (value) => emit('update:modelValue', value),
  emitBlur: () => emit('blur'),
})

const toolbarItems = computed(() => getRichTextToolbarItems(props.preset))
</script>

<template>
  <div
    data-test="rich-text-editor"
    class="w-full overflow-hidden rounded-ui border border-(--app-input-border-color) bg-(--app-input-color) transition-[background-color,border-color,box-shadow] duration-300"
    :class="
      disabled
        ? ''
        : 'focus-within:border-input-focus-border focus-within:bg-(--app-input-color-focus) focus-within:shadow-input-focus hover:border-input-hover-border'
    "
  >
    <RichTextToolbar
      :editor="editor"
      :layout="toolbarLayout"
      :items="toolbarItems"
      :disabled="disabled"
    />

    <EditorContent
      :editor="editor"
      class="prose prose-sm flow-root max-w-none dark:prose-invert [&_.ProseMirror]:min-h-(--rich-text-editor-min-height) [&_.ProseMirror]:px-3 [&_.ProseMirror]:outline-none"
      :style="{ '--rich-text-editor-min-height': `${minHeight}px` }"
    />
  </div>
</template>
```

Create `packages/rich-text/src/vue/layouts.ts`:

```ts
export { compactRichTextToolbarLayout } from '../presets'
```

Create `packages/rich-text/src/vue/index.ts`:

```ts
export { default as RichTextEditor } from './RichTextEditor.vue'
export { compactRichTextToolbarLayout } from './layouts'
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --filter @rev30/rich-text test -- RichTextEditor.test.ts
pnpm --filter @rev30/rich-text typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/rich-text
git commit -m "feat: add rich text vue editor"
```

---

### Task 5: Reuse Rich Text Schema In Contracts

**Files:**

- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/src/content/announcements.ts`
- Modify: `packages/contracts/__tests__/schemas/content/announcements.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add failing import expectation**

Run current contracts tests before changes:

```bash
pnpm --filter @rev30/contracts test -- announcements.test.ts
```

Expected: PASS before refactor. This is the baseline.

- [ ] **Step 2: Add package dependency**

Modify `packages/contracts/package.json` dependencies:

```json
"@rev30/rich-text": "workspace:*"
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` records the new workspace dependency.

- [ ] **Step 3: Replace local Tiptap schema helper**

Modify `packages/contracts/src/content/announcements.ts`:

```ts
import {
  hasNonBlankRichText,
  richTextDocumentSchema,
  type RichTextDocument,
} from '@rev30/rich-text/schema'
```

Replace:

```ts
export const tiptapDocumentSchema = z.looseObject({
  type: z.literal('doc', '正文格式无效'),
})
function hasNonBlankTiptapText(value: unknown): boolean {
  ...
}
const announcementContentJsonInputSchema = tiptapDocumentSchema.refine(hasNonBlankTiptapText, {
  message: '请输入正文',
})
```

With:

```ts
export const tiptapDocumentSchema = richTextDocumentSchema
const announcementContentJsonInputSchema = tiptapDocumentSchema.refine(hasNonBlankRichText, {
  message: '请输入正文',
})
```

Keep the compatibility type export:

```ts
export type TiptapDocument = RichTextDocument
```

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @rev30/contracts test -- announcements.test.ts
pnpm --filter @rev30/contracts typecheck
```

Expected: PASS with existing business validation messages.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts pnpm-lock.yaml
git commit -m "refactor: reuse rich text schemas"
```

---

### Task 6: Reuse Rich Text Server Derivation In Announcements

**Files:**

- Modify: `apps/server/package.json`
- Modify: `apps/server/src/modules/content/announcements/content.ts`
- Modify: `apps/server/__tests__/modules/content/announcements/content.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add package dependency and remove server-local rich text dependencies**

Modify `apps/server/package.json` dependencies so the server app depends on the package:

```json
"@rev30/rich-text": "workspace:*"
```

Remove these direct dependencies from `apps/server/package.json` because they move into `@rev30/rich-text`:

```json
"@tiptap/core": "^3.23.6",
"@tiptap/extension-link": "^3.23.6",
"@tiptap/extension-underline": "^3.23.6",
"@tiptap/html": "^3.23.6",
"@tiptap/pm": "^3.23.6",
"@tiptap/starter-kit": "^3.23.6",
"sanitize-html": "^2.17.4"
```

Remove this direct dev dependency:

```json
"@types/sanitize-html": "^2.16.1"
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` reflects the server dependency move.

- [ ] **Step 2: Reduce announcement content helper to a business adapter**

Replace `apps/server/src/modules/content/announcements/content.ts` with:

```ts
import { compactRichTextPreset } from '@rev30/rich-text/presets'
import { deriveRichTextContent, RichTextContentInvalidError } from '@rev30/rich-text/server'
import { AnnouncementContentInvalidError } from './errors'

export function deriveAnnouncementContent(contentJson: unknown) {
  try {
    return deriveRichTextContent(contentJson, { preset: compactRichTextPreset })
  } catch (error) {
    if (error instanceof RichTextContentInvalidError) {
      throw new AnnouncementContentInvalidError()
    }

    throw error
  }
}
```

- [ ] **Step 3: Narrow announcement tests to business mapping**

Modify `apps/server/__tests__/modules/content/announcements/content.test.ts` so it keeps only announcement-specific mapping tests:

```ts
import { describe, expect, it } from 'vitest'
import { deriveAnnouncementContent } from '../../../../src/modules/content/announcements/content'
import { AnnouncementContentInvalidError } from '../../../../src/modules/content/announcements/errors'

describe('announcement content helpers', () => {
  it('maps supported rich text json into derived announcement content', () => {
    expect(
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
      }),
    ).toEqual({
      text: '维护通知',
      html: '<p>维护通知</p>',
    })
  })

  it('maps rich text invalid content errors to announcement content errors', () => {
    expect(() =>
      deriveAnnouncementContent({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })
})
```

- [ ] **Step 4: Run server tests**

Run:

```bash
pnpm --filter @rev30/server test -- content.test.ts
pnpm --filter @rev30/server test -- integration.test.ts
pnpm --filter @rev30/server typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server pnpm-lock.yaml
git commit -m "refactor: use rich text server package"
```

---

### Task 7: Reuse Rich Text Vue Component In Client

**Files:**

- Modify: `apps/client/package.json`
- Modify: `apps/client/src/style.css`
- Modify: `apps/client/src/features/content/AnnouncementFormDrawer.vue`
- Delete: `apps/client/src/features/content/RichTextEditor.vue`
- Delete: `apps/client/__tests__/features/content/RichTextEditor.test.ts`
- Modify: `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Add package dependency and remove client-local Tiptap dependencies**

Modify `apps/client/package.json` dependencies so the client app depends on the package:

```json
"@rev30/rich-text": "workspace:*"
```

Remove these direct dependencies from `apps/client/package.json` because the app no longer imports Tiptap directly:

```json
"@tiptap/extension-link": "^3.23.6",
"@tiptap/extension-underline": "^3.23.6",
"@tiptap/starter-kit": "^3.23.6",
"@tiptap/vue-3": "^3.23.6"
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` reflects the client dependency move.

- [ ] **Step 2: Add Tailwind source scanning for package icons**

Modify `apps/client/src/style.css`:

```css
@import 'tailwindcss';
@source '@rev30/rich-text';
@plugin '@tailwindcss/typography';
@plugin '@iconify/tailwind4' {
  prefix: 'i';
}
```

Use this fallback only when verification reports that Tailwind cannot resolve the package-name source:

```css
@source '../node_modules/@rev30/rich-text';
```

- [ ] **Step 3: Replace local editor import in announcement form**

Modify `apps/client/src/features/content/AnnouncementFormDrawer.vue` imports:

```ts
import { compactRichTextPreset } from '@rev30/rich-text/presets'
import { RichTextEditor } from '@rev30/rich-text/vue'
```

Remove:

```ts
import RichTextEditor from './RichTextEditor.vue'
```

Modify the component usage:

```vue
<RichTextEditor
  :disabled="isLoading || isSaving"
  :model-value="state.value"
  :preset="compactRichTextPreset"
  @blur="field.handleBlur"
  @update:model-value="
    (value) => {
      clearServerFieldError('contentJson')
      field.handleChange(value)
    }
  "
/>
```

- [ ] **Step 4: Delete local editor component and tests**

Delete:

```txt
apps/client/src/features/content/RichTextEditor.vue
apps/client/__tests__/features/content/RichTextEditor.test.ts
```

Update `apps/client/__tests__/features/content/AnnouncementFormDrawer.test.ts` mock path from local component to package component:

```ts
vi.mock('@rev30/rich-text/vue', () => ({
  RichTextEditor: {
    name: 'RichTextEditorStub',
    props: ['modelValue', 'disabled', 'preset'],
    emits: ['update:modelValue', 'blur'],
    template:
      '<button data-test="announcement-form-rich-text-stub" @click="$emit(`update:modelValue`, modelValue)" @blur="$emit(`blur`)">editor</button>',
  },
}))
```

- [ ] **Step 5: Run client tests and build**

Run:

```bash
pnpm --filter @rev30/client test -- AnnouncementFormDrawer.test.ts
pnpm --filter @rev30/client typecheck
pnpm --filter @rev30/client build
```

Expected: PASS. Confirm the generated CSS includes the rich text icon utilities by verifying the build does not render missing icon classes in component tests and no Tailwind source warning appears.

- [ ] **Step 6: Commit**

```bash
git add apps/client pnpm-lock.yaml
git commit -m "refactor: use rich text vue package"
```

---

### Task 8: Workspace Verification And Cleanup

**Files:**

- No file edits are expected in this task unless a verification failure points to a concrete fix.

- [ ] **Step 1: Run package-specific checks**

Run:

```bash
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/contracts test
pnpm --filter @rev30/server test
pnpm --filter @rev30/client test
```

Expected: all tests pass.

- [ ] **Step 2: Run workspace typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full workspace check**

Run:

```bash
pnpm check
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD~7..HEAD
```

Expected: status is clean after commits; diff shows the new rich-text package plus narrow app/contracts integration changes.

- [ ] **Step 5: Confirm no accidental implementation leftovers**

Run:

```bash
git status --short
```

Expected: no output.
