import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextExtensions } from '../../src/core/preset'
import { createCompactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { compactRichTextPreset } from '../../src/presets'
import { createCompactRichTextServerPreset } from '../../src/server/presets/compact'

const imageUpload = async (file: File) => ({
  src: `/api/attachments/${file.name}/content`,
})

const imageServerOptions = {
  isAllowedSrc: (src: string) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
}

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
      'image',
    ])
  })

  it('keeps the current visible toolbar layout with the editor preset', () => {
    const editorPreset = createCompactRichTextEditorPreset({
      image: {
        accept: 'image/*',
        upload: imageUpload,
      },
    })

    expect(editorPreset.key).toBe(compactRichTextPreset.key)
    expect(editorPreset.features).toBe(compactRichTextPreset.features)
    expect(editorPreset.toolbar?.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'blocks',
      'insert',
    ])

    const marks = editorPreset.toolbar?.groups.find((group) => group.key === 'marks')
    const blocks = editorPreset.toolbar?.groups.find((group) => group.key === 'blocks')
    const insert = editorPreset.toolbar?.groups.find((group) => group.key === 'insert')
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
    expect(
      insert?.controls.map((control) =>
        control.type === 'button' ? control.command.key : control.key,
      ) ?? [],
    ).toEqual(['horizontal-rule', 'image'])
  })

  it('keeps server html policies with the server preset', () => {
    const serverPreset = createCompactRichTextServerPreset({
      image: imageServerOptions,
    })

    expect(serverPreset.key).toBe(compactRichTextPreset.key)
    expect(serverPreset.features).toBe(compactRichTextPreset.features)
    expect(serverPreset.htmlPolicies.flatMap((policy) => policy.allowedTags ?? [])).toEqual([
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
      'img',
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
