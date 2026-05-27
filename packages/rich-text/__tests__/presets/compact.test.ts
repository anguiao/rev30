import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextExtensions } from '../../src/core/preset'
import {
  compactRichTextToolbarItems,
  compactRichTextToolbarLayout,
  compactRichTextEditorPreset,
} from '../../src/vue/presets'
import { compactRichTextPreset } from '../../src/presets'
import { compactRichTextHtmlPolicies, compactRichTextServerPreset } from '../../src/server/presets'

describe('compact rich text preset', () => {
  it('enables current editor features', () => {
    expect(compactRichTextPreset.features.map((feature) => feature.key)).toEqual([
      'base',
      'history',
      'bold',
      'italic',
      'underline',
      'heading',
      'blockquote',
      'list',
      'horizontal-rule',
    ])
  })

  it('keeps the current visible toolbar layout with the editor preset', () => {
    expect(compactRichTextEditorPreset.preset).toBe(compactRichTextPreset)
    expect(compactRichTextToolbarLayout.groups).toEqual([
      { key: 'history', items: ['undo', 'redo'] },
      { key: 'marks', items: ['bold', 'italic', 'underline'] },
      { key: 'blocks', items: ['heading-1', 'heading-2', 'heading-3', 'blockquote'] },
      { key: 'lists', items: ['bullet-list', 'ordered-list'] },
      { key: 'insert', items: ['horizontal-rule'] },
    ])
    expect(compactRichTextEditorPreset.toolbarLayout).toBe(compactRichTextToolbarLayout)
    expect(compactRichTextEditorPreset.toolbarItems).toBe(compactRichTextToolbarItems)
    expect(compactRichTextToolbarItems.map((item) => item.key)).toEqual([
      'undo',
      'redo',
      'bold',
      'italic',
      'underline',
      'heading-1',
      'heading-2',
      'heading-3',
      'blockquote',
      'bullet-list',
      'ordered-list',
      'horizontal-rule',
    ])
  })

  it('keeps server html policies with the server preset', () => {
    expect(compactRichTextServerPreset.preset).toBe(compactRichTextPreset)
    expect(compactRichTextServerPreset.htmlPolicies).toBe(compactRichTextHtmlPolicies)
    expect(compactRichTextHtmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toEqual([
      'p',
      'br',
      'strong',
      'em',
      'u',
      'h1',
      'h2',
      'h3',
      'blockquote',
      'ul',
      'ol',
      'li',
      'hr',
    ])
  })

  it('does not register duplicate Tiptap extensions', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      getSchema(collectRichTextExtensions(compactRichTextPreset))

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
