import { getSchema } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { allRichTextPreset } from '../../src/core/presets/all'
import { compactRichTextPreset } from '../../src/core/presets/compact'
import { standardRichTextPreset } from '../../src/core/presets/standard'
import { RichTextContentInvalidError, deriveRichTextContent } from '../../src/server'
import { createAllRichTextServerPreset } from '../../src/server/presets/all'
import { compactRichTextServerPreset } from '../../src/server/presets/compact'
import { createStandardRichTextServerPreset } from '../../src/server/presets/standard'
import { collectRichTextServerExtensions } from '../../src/server/feature'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { createStandardRichTextEditorPreset } from '../../src/vue/presets/standard'

const imageUpload = async (file: File) => ({
  src: `/api/attachments/${file.name}/content`,
})

const imageServerOptions = {
  isAllowedSrc: (src: string) => /^\/api\/attachments\/[0-9a-f-]{36}\/content$/i.test(src),
}

const allFeatureKeys = [
  'base',
  'history',
  'character-count',
  'search-replace',
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
  'table',
  'element-path',
]

const compactFeatureKeys = ['base', 'history', 'bold', 'italic', 'link', 'heading', 'list']

const standardFeatureKeys = [
  'base',
  'history',
  'character-count',
  'search-replace',
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

const allEditorExtensionNames = [
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'dropCursor',
  'gapCursor',
  'selection',
  'undoRedo',
  'characterCount',
  'searchReplace',
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
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
]

const compactEditorExtensionNames = [
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
]

const standardEditorExtensionNames = [
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'dropCursor',
  'gapCursor',
  'selection',
  'undoRedo',
  'characterCount',
  'searchReplace',
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
]

const allEditorPreset = createAllRichTextEditorPreset({
  image: {
    upload: imageUpload,
  },
})

const allServerPreset = createAllRichTextServerPreset({
  image: imageServerOptions,
})

const standardEditorPreset = createStandardRichTextEditorPreset({
  image: {
    upload: imageUpload,
  },
})

const standardServerPreset = createStandardRichTextServerPreset({
  image: imageServerOptions,
})

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

function expectKnownExtensionOrder(
  actualNames: readonly string[],
  expectedNames: readonly string[],
) {
  expect(actualNames.filter((name) => expectedNames.includes(name))).toEqual(expectedNames)
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

  it('contains every standard feature by canonical identity', () => {
    expect(
      standardRichTextPreset.features.every((feature) =>
        allRichTextPreset.features.includes(feature),
      ),
    ).toBe(true)
  })

  it('keeps editor implementations and extension order with the editor preset', () => {
    expect(allEditorPreset.key).toBe(allRichTextPreset.key)
    expect(allEditorPreset.features).toBe(allRichTextPreset.features)
    expect(allEditorPreset.editorFeatures.map(({ feature }) => feature.key)).toEqual(allFeatureKeys)
    expectKnownExtensionOrder(
      collectRichTextEditorExtensions(allEditorPreset).map((extension) => extension.name),
      allEditorExtensionNames,
    )
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

    expect(history?.controls.map((control) => control.key) ?? []).toEqual([
      'undo',
      'redo',
      'search-replace',
    ])
    expect(marks?.controls.map((control) => control.key) ?? []).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'inline-code',
      'highlight',
      'link',
      'remove-format',
    ])
    expect(textStyle?.controls.map((control) => control.key) ?? []).toEqual(['text-style'])
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
    expect(blocks?.controls.map((control) => control.key) ?? []).toEqual([
      'heading',
      'text-align',
      'list',
      'blockquote',
      'code-block',
    ])
    expect(insert?.controls.map((control) => control.key) ?? []).toEqual([
      'horizontal-rule',
      'table',
      'image',
    ])
    expect(allEditorPreset.statusBar?.start.map((item) => item.key)).toEqual(['element-path'])
    expect(allEditorPreset.statusBar?.end.map((item) => item.key)).toEqual(['character-count'])
  })

  it('provides the full contextual quick bar and slash command layout', () => {
    const textControls = allEditorPreset.quickBar?.textControls

    expect(textControls?.map((control) => control.key)).toEqual([
      'bold',
      'italic',
      'underline',
      'highlight',
      'link',
    ])
    expect(allEditorPreset.quickBar?.featureBars.map((quickBar) => quickBar.feature.key)).toEqual([
      'image',
      'link',
      'code-block',
      'table',
    ])
    expect(allEditorPreset.slashMenu?.map(({ key }) => key)).toEqual(['basic', 'list', 'insert'])
    expect(allEditorPreset.slashMenu?.map((group) => group.commands.map(({ key }) => key))).toEqual(
      [
        ['paragraph', 'heading-1', 'heading-2', 'heading-3', 'blockquote'],
        ['bullet-list', 'ordered-list'],
        ['code-block', 'horizontal-rule', 'table', 'image'],
      ],
    )
  })

  it('keeps server implementations, shared extensions, and html policy order', () => {
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
      'blockquote',
      'code-block',
      'list',
      'horizontal-rule',
      'image',
      'table',
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
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
    ])
    expect(
      allServerPreset.serverFeatures.flatMap(({ htmlPolicy }) => htmlPolicy.allowedTags ?? []),
    ).toEqual([
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
      'blockquote',
      'pre',
      'code',
      'ul',
      'ol',
      'li',
      'hr',
      'img',
      'div',
      'table',
      'colgroup',
      'col',
      'tbody',
      'tr',
      'th',
      'td',
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
    expectKnownExtensionOrder(
      collectRichTextEditorExtensions(compactRichTextEditorPreset).map(
        (extension) => extension.name,
      ),
      compactEditorExtensionNames,
    )
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

    expect(history?.controls.map((control) => control.key) ?? []).toEqual(['undo', 'redo'])
    expect(marks?.controls.map((control) => control.key) ?? []).toEqual(['bold', 'italic', 'link'])
    expect(blocks?.controls.map((control) => control.key) ?? []).toEqual(['heading', 'list'])
  })

  it('adds compact quick bars and slash commands', () => {
    const textControls = compactRichTextEditorPreset.quickBar?.textControls

    expect(textControls?.map((control) => control.key)).toEqual(['bold', 'italic', 'link'])
    expect(
      compactRichTextEditorPreset.quickBar?.featureBars.map((quickBar) => quickBar.feature.key),
    ).toEqual(['link'])
    expect(compactRichTextEditorPreset.slashMenu?.map(({ key }) => key)).toEqual(['basic', 'list'])
    expect(
      compactRichTextEditorPreset.slashMenu?.map((group) => group.commands.map(({ key }) => key)),
    ).toEqual([
      ['paragraph', 'heading-1', 'heading-2', 'heading-3'],
      ['bullet-list', 'ordered-list'],
    ])
  })

  it('keeps server implementations, shared extensions, and html policy order', () => {
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
      compactRichTextServerPreset.serverFeatures.flatMap(
        ({ htmlPolicy }) => htmlPolicy.allowedTags ?? [],
      ),
    ).toEqual(['p', 'br', 'strong', 'em', 'a', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'])
  })

  it('does not register duplicate Tiptap extensions', () => {
    expectNoDuplicateTiptapExtensions(compactRichTextEditorPreset)
  })
})

describe('standard rich text preset', () => {
  it('keeps the selected standard feature set in its canonical order', () => {
    expect(standardRichTextPreset.features.map((feature) => feature.key)).toEqual(
      standardFeatureKeys,
    )
  })

  it('keeps editor implementations and extension order with the editor preset', () => {
    expect(standardEditorPreset.key).toBe(standardRichTextPreset.key)
    expect(standardEditorPreset.features).toBe(standardRichTextPreset.features)
    expect(standardEditorPreset.editorFeatures.map(({ feature }) => feature.key)).toEqual(
      standardFeatureKeys,
    )
    expectKnownExtensionOrder(
      collectRichTextEditorExtensions(standardEditorPreset).map((extension) => extension.name),
      standardEditorExtensionNames,
    )
  })

  it('keeps the standard visible toolbar layout with the editor preset', () => {
    expect(standardEditorPreset.toolbar?.groups.map((group) => group.key)).toEqual([
      'history',
      'marks',
      'blocks',
      'insert',
    ])

    const history = standardEditorPreset.toolbar?.groups.find((group) => group.key === 'history')
    const marks = standardEditorPreset.toolbar?.groups.find((group) => group.key === 'marks')
    const blocks = standardEditorPreset.toolbar?.groups.find((group) => group.key === 'blocks')
    const insert = standardEditorPreset.toolbar?.groups.find((group) => group.key === 'insert')
    const heading = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'heading',
    )
    const textAlign = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'text-align',
    )
    const list = blocks?.controls.find(
      (control) => control.type === 'dropdown' && control.key === 'list',
    )

    expect(history?.controls.map((control) => control.key) ?? []).toEqual([
      'undo',
      'redo',
      'search-replace',
    ])
    expect(marks?.controls.map((control) => control.key) ?? []).toEqual([
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
    ).toEqual(['text-align-left', 'text-align-center', 'text-align-right', 'text-align-justify'])
    expect(list?.type === 'dropdown' ? list.items.map((item) => item.action.key) : []).toEqual([
      'bullet-list',
      'ordered-list',
    ])
    expect(blocks?.controls.map((control) => control.key) ?? []).toEqual([
      'heading',
      'text-align',
      'list',
      'blockquote',
    ])
    expect(insert?.controls.map((control) => control.key) ?? []).toEqual([
      'horizontal-rule',
      'image',
    ])
  })

  it('keeps the standard quick bar, slash menu, and status bar layout', () => {
    expect(standardEditorPreset.quickBar?.textControls?.map((control) => control.key)).toEqual([
      'bold',
      'italic',
      'underline',
      'highlight',
      'link',
    ])
    expect(
      standardEditorPreset.quickBar?.featureBars.map((quickBar) => quickBar.feature.key),
    ).toEqual(['image', 'link'])
    expect(standardEditorPreset.slashMenu?.map(({ key }) => key)).toEqual([
      'basic',
      'list',
      'insert',
    ])
    expect(
      standardEditorPreset.slashMenu?.map((group) => group.commands.map(({ key }) => key)),
    ).toEqual([
      ['paragraph', 'heading-3', 'blockquote'],
      ['bullet-list', 'ordered-list'],
      ['horizontal-rule', 'image'],
    ])
    expect(standardEditorPreset.statusBar?.start.map((item) => item.key)).toEqual([])
    expect(standardEditorPreset.statusBar?.end.map((item) => item.key)).toEqual(['character-count'])
  })

  it('keeps server implementations, shared extensions, and html policy order', () => {
    expect(standardServerPreset.key).toBe(standardRichTextPreset.key)
    expect(standardServerPreset.features).toBe(standardRichTextPreset.features)
    expect(standardServerPreset.serverFeatures.map(({ feature }) => feature.key)).toEqual([
      'base',
      'bold',
      'italic',
      'underline',
      'strike',
      'highlight',
      'link',
      'heading',
      'text-align',
      'blockquote',
      'list',
      'horizontal-rule',
      'image',
    ])
    expect(
      collectRichTextServerExtensions(standardServerPreset).map((extension) => extension.name),
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
    expect(
      standardServerPreset.serverFeatures.flatMap(({ htmlPolicy }) => htmlPolicy.allowedTags ?? []),
    ).toEqual([
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
      'blockquote',
      'ul',
      'ol',
      'li',
      'hr',
      'img',
    ])
  })

  it('derives standard content and applies the injected image source strategy', () => {
    const imageSrc = '/api/attachments/11111111-1111-4111-8111-111111111111/content'
    const content = deriveRichTextContent(
      {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: '维护通知' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '需要关注',
                marks: [{ type: 'underline' }, { type: 'strike' }, { type: 'highlight' }],
              },
            ],
          },
          { type: 'image', attrs: { src: imageSrc, alt: '通知图片' } },
        ],
      },
      createStandardRichTextServerPreset({
        image: { isAllowedSrc: (src) => src === imageSrc },
      }),
    )

    expect(content.html).toContain('<h3>维护通知</h3>')
    expect(content.html).toContain('<mark><s><u>需要关注</u></s></mark>')
    expect(content.html).toContain(`src="${imageSrc}"`)
    expect(content.html).toContain('alt="通知图片"')

    expect(() =>
      deriveRichTextContent(
        {
          type: 'doc',
          content: [
            {
              type: 'image',
              attrs: { src: 'https://example.com/image.png', alt: '外部图片' },
            },
          ],
        },
        standardServerPreset,
      ),
    ).toThrow(RichTextContentInvalidError)
  })

  it('does not register duplicate Tiptap extensions', () => {
    expectNoDuplicateTiptapExtensions(standardEditorPreset)
  })
})
