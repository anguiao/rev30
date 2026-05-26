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
