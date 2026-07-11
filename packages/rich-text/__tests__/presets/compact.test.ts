import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextDocumentExtensions } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { compactRichTextPreset } from '../../src/presets'
import { createCompactRichTextServerPreset } from '../../src/server/presets/compact'
import type { RichTextToolbarControlConfig } from '../../src/vue/toolbar'
import { createCompactRichTextEditorPreset } from '../../src/vue/presets/compact'

const imageUpload = async (file: File) => ({
  src: `/api/attachments/${file.name}/content`,
})

const imageServerOptions = {
  isAllowedSrc: (src: string) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
}

const compactFeatureKeys = [
  'base',
  'history',
  'bold',
  'italic',
  'underline',
  'strike',
  'highlight',
  'link',
  'remove-format',
  'heading',
  'text-align',
  'blockquote',
  'list',
  'horizontal-rule',
  'image',
]

function getToolbarControlKey(control: RichTextToolbarControlConfig) {
  return control.type === 'button' ? control.item.action.key : control.key
}

describe('compact rich text preset', () => {
  it('enables current editor features', () => {
    expect(compactRichTextPreset.features.map((feature) => feature.key)).toEqual(compactFeatureKeys)
  })

  it('keeps editor implementations and extension order with the editor preset', () => {
    const editorPreset = createCompactRichTextEditorPreset({
      image: {
        upload: imageUpload,
      },
    })

    expect(editorPreset.key).toBe(compactRichTextPreset.key)
    expect(editorPreset.features).toBe(compactRichTextPreset.features)
    expect(editorPreset.editorFeatures.map(({ feature }) => feature.key)).toEqual(
      compactFeatureKeys,
    )
    expect(
      collectRichTextEditorExtensions(editorPreset).map((extension) => extension.name),
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
      'highlight',
      'link',
      'heading',
      'textAlign',
      'blockquote',
      'bulletList',
      'orderedList',
      'listItem',
      'horizontalRule',
      'image',
    ])
  })

  it('keeps the current visible toolbar layout with the editor preset', () => {
    const editorPreset = createCompactRichTextEditorPreset({
      image: {
        upload: imageUpload,
      },
    })

    expect(editorPreset.toolbar?.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'blocks',
      'insert',
    ])

    const history = editorPreset.toolbar?.groups.find((group) => group.key === 'history')
    const marks = editorPreset.toolbar?.groups.find((group) => group.key === 'marks')
    const blocks = editorPreset.toolbar?.groups.find((group) => group.key === 'blocks')
    const insert = editorPreset.toolbar?.groups.find((group) => group.key === 'insert')
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
      'highlight',
      'link',
      'remove-format',
    ])
    expect(
      heading?.type === 'dropdown' ? heading.items.map((item) => item.action.key) : [],
    ).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(
      textAlign?.type === 'dropdown' ? textAlign.items.map((item) => item.action.key) : [],
    ).toEqual(['text-align-left', 'text-align-center', 'text-align-right'])
    expect(list?.type === 'dropdown' ? list.items.map((item) => item.action.key) : []).toEqual([
      'bullet-list',
      'ordered-list',
    ])
    expect(blocks?.controls.map(getToolbarControlKey) ?? []).toEqual([
      'heading',
      'text-align',
      'list',
      'blockquote',
    ])
    expect(insert?.controls.map(getToolbarControlKey) ?? []).toEqual(['horizontal-rule', 'image'])
  })

  it('keeps server implementations, document extensions, and html policy order', () => {
    const serverPreset = createCompactRichTextServerPreset({
      image: imageServerOptions,
    })

    expect(serverPreset.key).toBe(compactRichTextPreset.key)
    expect(serverPreset.features).toBe(compactRichTextPreset.features)
    expect(serverPreset.serverFeatures.map(({ feature }) => feature.key)).toEqual([
      'base',
      'bold',
      'italic',
      'underline',
      'strike',
      'highlight',
      'link',
      'heading',
      'text-align',
      'list',
      'blockquote',
      'horizontal-rule',
      'image',
    ])
    expect(
      collectRichTextDocumentExtensions(serverPreset).map((extension) => extension.name),
    ).toEqual([
      'doc',
      'paragraph',
      'text',
      'hardBreak',
      'bold',
      'italic',
      'underline',
      'strike',
      'highlight',
      'link',
      'heading',
      'textAlign',
      'blockquote',
      'bulletList',
      'orderedList',
      'listItem',
      'horizontalRule',
      'image',
    ])
    expect(serverPreset.htmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toEqual([
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
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
      'img',
    ])
  })

  it('does not register duplicate Tiptap extensions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editorPreset = createCompactRichTextEditorPreset({
      image: {
        upload: imageUpload,
      },
    })

    try {
      getSchema(collectRichTextEditorExtensions(editorPreset))

      expect(
        warnSpy.mock.calls.some(
          ([message]) =>
            typeof message === 'string' && message.includes('Duplicate extension names found'),
        ),
      ).toBe(false)
    } finally {
      warnSpy.mockRestore()
    }
  })
})
