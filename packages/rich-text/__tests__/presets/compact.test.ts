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
      'highlight',
      'link',
      'heading',
      'blockquote',
      'list',
      'horizontal-rule',
    ])
  })

  it('keeps the current visible toolbar layout with the editor preset', () => {
    expect(compactRichTextEditorPreset.key).toBe(compactRichTextPreset.key)
    expect(compactRichTextEditorPreset.features).toBe(compactRichTextPreset.features)
    expect(compactRichTextToolbar.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'blocks',
      'insert',
    ])
    expect(compactRichTextEditorPreset.toolbar).toBe(compactRichTextToolbar)

    const marks = compactRichTextToolbar.groups.find((group) => group.key === 'marks')
    const blocks = compactRichTextToolbar.groups.find((group) => group.key === 'blocks')
    const heading = blocks?.controls.find((control) => control.type === 'dropdown')
    const list = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'list',
    )

    expect(
      marks?.controls.map((control) =>
        control.type === 'button' ? control.command.key : control.key,
      ) ?? [],
    ).toEqual(['bold', 'italic', 'underline', 'highlight', 'link'])
    expect(
      heading?.type === 'dropdown' ? heading.commands.map((command) => command.key) : [],
    ).toEqual(['heading-1', 'heading-2', 'heading-3'])
    expect(list?.type === 'dropdown' ? list.commands.map((command) => command.key) : []).toEqual([
      'bullet-list',
      'ordered-list',
    ])
  })

  it('keeps server html policies with the server preset', () => {
    expect(compactRichTextServerPreset.key).toBe(compactRichTextPreset.key)
    expect(compactRichTextServerPreset.features).toBe(compactRichTextPreset.features)
    expect(compactRichTextServerPreset.htmlPolicies).toBe(compactRichTextHtmlPolicies)
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
