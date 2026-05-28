import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextExtensions } from '../../src/core/preset'
import { compactRichTextToolbar, compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { compactRichTextPreset } from '../../src/presets'
import {
  compactRichTextHtmlPolicies,
  compactRichTextServerPreset,
} from '../../src/server/presets/compact'

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
    expect(
      compactRichTextToolbar.groups.map((group) => ({
        key: group.key,
        controls: group.controls.map((control) =>
          control.type === 'button' ? control.command.key : control.key,
        ),
      })),
    ).toEqual([
      { key: 'history', controls: ['undo', 'redo'] },
      { key: 'marks', controls: ['bold', 'italic', 'underline'] },
      { key: 'blocks', controls: ['heading', 'list', 'blockquote'] },
      { key: 'insert', controls: ['horizontal-rule'] },
    ])
    expect(compactRichTextEditorPreset.toolbar).toBe(compactRichTextToolbar)

    const blocks = compactRichTextToolbar.groups.find((group) => group.key === 'blocks')
    const heading = blocks?.controls.find((control) => control.type === 'dropdown')
    const list = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'list',
    )

    expect(
      heading?.type === 'dropdown' ? heading.commands.map((command) => command.key) : [],
    ).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(list?.type === 'dropdown' ? list.commands.map((command) => command.key) : []).toEqual([
      'bullet-list',
      'ordered-list',
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
      'ul',
      'ol',
      'li',
      'blockquote',
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
