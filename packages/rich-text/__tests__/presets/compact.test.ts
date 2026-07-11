import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { allRichTextPreset } from '../../src/presets/all'
import { compactRichTextPreset } from '../../src/presets/compact'
import { createAllRichTextServerPreset } from '../../src/server/presets/all'
import { compactRichTextServerPreset } from '../../src/server/presets/compact'
import { collectRichTextServerExtensions } from '../../src/server/feature'
import type { RichTextToolbarControlConfig } from '../../src/vue/toolbar'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'

const imageUpload = async (file: File) => ({
  src: `/api/attachments/${file.name}/content`,
})

const imageServerOptions = {
  isAllowedSrc: (src: string) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
}

const allFeatureKeys = [
  'base',
  'history',
  'bold',
  'italic',
  'underline',
  'strike',
  'inline-code',
  'highlight',
  'text-style',
  'link',
  'remove-format',
  'heading',
  'text-align',
  'blockquote',
  'code-block',
  'list',
  'horizontal-rule',
  'image',
]

const compactFeatureKeys = ['base', 'history', 'bold', 'italic', 'link', 'heading', 'list']

const allEditorPreset = createAllRichTextEditorPreset({
  image: {
    upload: imageUpload,
  },
})

const allServerPreset = createAllRichTextServerPreset({
  image: imageServerOptions,
})

function getToolbarControlKey(control: RichTextToolbarControlConfig) {
  return control.type === 'button' ? control.item.action.key : control.key
}

function expectNoDuplicateTiptapExtensions(
  preset: Parameters<typeof collectRichTextEditorExtensions>[0],
) {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  try {
    getSchema(collectRichTextEditorExtensions(preset))

    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Duplicate extension names found'),
      ),
    ).toBe(false)
  } finally {
    warnSpy.mockRestore()
  }
}

describe('all rich text preset', () => {
  it('enables every current built-in feature', () => {
    expect(allRichTextPreset.features.map((feature) => feature.key)).toEqual(allFeatureKeys)
  })

  it('contains every compact feature by canonical identity', () => {
    expect(
      compactRichTextPreset.features.every((feature) =>
        allRichTextPreset.features.includes(feature),
      ),
    ).toBe(true)
  })

  it('keeps editor implementations and extension order with the editor preset', () => {
    expect(allEditorPreset.key).toBe(allRichTextPreset.key)
    expect(allEditorPreset.features).toBe(allRichTextPreset.features)
    expect(allEditorPreset.editorFeatures.map(({ feature }) => feature.key)).toEqual(allFeatureKeys)
    expect(
      collectRichTextEditorExtensions(allEditorPreset).map((extension) => extension.name),
    ).toEqual([
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'dropCursor',
      'gapCursor',
      'selection',
      'undoRedo',
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'highlight',
      'textStyle',
      'color',
      'fontFamily',
      'fontSize',
      'lineHeight',
      'link',
      'heading',
      'textAlign',
      'blockquote',
      'codeBlock',
      'bulletList',
      'orderedList',
      'listItem',
      'horizontalRule',
      'image',
    ])
  })

  it('keeps the complete visible toolbar layout with the editor preset', () => {
    expect(allEditorPreset.toolbar?.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'text-style',
      'blocks',
      'insert',
    ])

    const history = allEditorPreset.toolbar?.groups.find((group) => group.key === 'history')
    const marks = allEditorPreset.toolbar?.groups.find((group) => group.key === 'marks')
    const textStyle = allEditorPreset.toolbar?.groups.find((group) => group.key === 'text-style')
    const blocks = allEditorPreset.toolbar?.groups.find((group) => group.key === 'blocks')
    const insert = allEditorPreset.toolbar?.groups.find((group) => group.key === 'insert')
    const heading = blocks?.controls.find((control) => control.type === 'dropdown')
    const textAlign = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'text-align',
    )
    const list = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'list',
    )

    expect(history?.controls.map(getToolbarControlKey) ?? []).toEqual(['undo', 'redo'])
    expect(marks?.controls.map(getToolbarControlKey) ?? []).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'inline-code',
      'highlight',
      'link',
      'remove-format',
    ])
    expect(textStyle?.controls.map(getToolbarControlKey) ?? []).toEqual(['text-style'])
    expect(
      heading?.type === 'dropdown' ? heading.items.map((item) => item.action.key) : [],
    ).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(
      textAlign?.type === 'dropdown' ? textAlign.items.map((item) => item.action.key) : [],
    ).toEqual(['text-align-left', 'text-align-center', 'text-align-right', 'text-align-justify'])
    expect(list?.type === 'dropdown' ? list.items.map((item) => item.action.key) : []).toEqual([
      'bullet-list',
      'ordered-list',
    ])
    expect(blocks?.controls.map(getToolbarControlKey) ?? []).toEqual([
      'heading',
      'text-align',
      'list',
      'blockquote',
      'code-block',
    ])
    expect(insert?.controls.map(getToolbarControlKey) ?? []).toEqual(['horizontal-rule', 'image'])
  })

  it('keeps server implementations, document extensions, and html policy order', () => {
    expect(allServerPreset.key).toBe(allRichTextPreset.key)
    expect(allServerPreset.features).toBe(allRichTextPreset.features)
    expect(allServerPreset.serverFeatures.map(({ feature }) => feature.key)).toEqual([
      'base',
      'bold',
      'italic',
      'underline',
      'strike',
      'inline-code',
      'highlight',
      'text-style',
      'link',
      'heading',
      'text-align',
      'list',
      'blockquote',
      'code-block',
      'horizontal-rule',
      'image',
    ])
    expect(
      collectRichTextServerExtensions(allServerPreset).map((extension) => extension.name),
    ).toEqual([
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'highlight',
      'textStyle',
      'color',
      'fontFamily',
      'fontSize',
      'lineHeight',
      'link',
      'heading',
      'textAlign',
      'blockquote',
      'codeBlock',
      'bulletList',
      'orderedList',
      'listItem',
      'horizontalRule',
      'image',
    ])
    expect(allServerPreset.htmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toEqual([
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'code',
      'mark',
      'span',
      'a',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'hr',
      'img',
    ])
  })

  it('does not register duplicate Tiptap extensions', () => {
    expectNoDuplicateTiptapExtensions(allEditorPreset)
  })
})

describe('compact rich text preset', () => {
  it('keeps the selected lightweight feature set', () => {
    expect(compactRichTextPreset.features.map((feature) => feature.key)).toEqual(compactFeatureKeys)
  })

  it('keeps editor implementations and extension order with the editor preset', () => {
    expect(compactRichTextEditorPreset.key).toBe(compactRichTextPreset.key)
    expect(compactRichTextEditorPreset.features).toBe(compactRichTextPreset.features)
    expect(compactRichTextEditorPreset.editorFeatures.map(({ feature }) => feature.key)).toEqual(
      compactFeatureKeys,
    )
    expect(
      collectRichTextEditorExtensions(compactRichTextEditorPreset).map(
        (extension) => extension.name,
      ),
    ).toEqual([
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'dropCursor',
      'gapCursor',
      'selection',
      'undoRedo',
      'bold',
      'italic',
      'link',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
    ])
  })

  it('keeps the lightweight visible toolbar layout with the editor preset', () => {
    expect(compactRichTextEditorPreset.toolbar?.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'blocks',
    ])

    const history = compactRichTextEditorPreset.toolbar?.groups.find(
      (group) => group.key === 'history',
    )
    const marks = compactRichTextEditorPreset.toolbar?.groups.find((group) => group.key === 'marks')
    const blocks = compactRichTextEditorPreset.toolbar?.groups.find(
      (group) => group.key === 'blocks',
    )

    expect(history?.controls.map(getToolbarControlKey) ?? []).toEqual(['undo', 'redo'])
    expect(marks?.controls.map(getToolbarControlKey) ?? []).toEqual(['bold', 'italic', 'link'])
    expect(blocks?.controls.map(getToolbarControlKey) ?? []).toEqual(['heading', 'list'])
  })

  it('keeps server implementations, document extensions, and html policy order', () => {
    expect(compactRichTextServerPreset.key).toBe(compactRichTextPreset.key)
    expect(compactRichTextServerPreset.features).toBe(compactRichTextPreset.features)
    expect(compactRichTextServerPreset.serverFeatures.map(({ feature }) => feature.key)).toEqual([
      'base',
      'bold',
      'italic',
      'link',
      'heading',
      'list',
    ])
    expect(
      collectRichTextServerExtensions(compactRichTextServerPreset).map(
        (extension) => extension.name,
      ),
    ).toEqual([
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'bold',
      'italic',
      'link',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
    ])
    expect(
      compactRichTextServerPreset.htmlPolicies.flatMap((policy) => policy.allowedTags ?? []),
    ).toEqual(['p', 'br', 'strong', 'em', 'a', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'])
  })

  it('does not register duplicate Tiptap extensions', () => {
    expectNoDuplicateTiptapExtensions(compactRichTextEditorPreset)
  })
})
