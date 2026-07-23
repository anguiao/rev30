import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseFeature } from '../../src/features/base/shared'
import { boldFeature } from '../../src/features/bold/shared'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'
import { defineRichTextQuickBar, richTextFeatureQuickBar } from '../../src/vue/quick-bar'
import { resolveRichTextQuickBar } from '../../src/vue/quick-bar/resolve'
import { createTestEditor } from '../helpers/editor'

const allPreset = createAllRichTextEditorPreset({
  image: {
    upload: async (file) => ({ src: `/uploads/${file.name}` }),
  },
})

function createEditor(content: string) {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(allPreset),
    content,
  })
}

describe('rich text quick bar resolution', () => {
  it('resolves feature quick bars in declaration order before text selections', () => {
    const editor = createEditor('<p>context</p>')
    const component = defineComponent(() => () => null)
    const quickBar = defineRichTextQuickBar({
      featureBars: [
        richTextFeatureQuickBar({
          feature: baseFeature,
          isActive: () => true,
          component,
          props: {},
        }),
        richTextFeatureQuickBar({
          feature: boldFeature,
          isActive: () => true,
          component,
          props: {},
        }),
      ],
    })

    expect(resolveRichTextQuickBar(editor, quickBar)).toMatchObject({
      type: 'feature',
      quickBar: {
        feature: { key: 'base' },
      },
    })
  })

  it('selects Link, CodeBlock, Image, and plain text quick bars from the all preset', () => {
    const linkEditor = createEditor('<p><a href="https://example.com">link</a> text</p>')
    linkEditor.commands.setTextSelection(2)
    expect(resolveRichTextQuickBar(linkEditor, allPreset.quickBar!)).toMatchObject({
      type: 'feature',
      quickBar: {
        feature: { key: 'link' },
      },
    })

    const codeEditor = createEditor('<pre><code>const value = 1</code></pre>')
    codeEditor.commands.setTextSelection(2)
    expect(resolveRichTextQuickBar(codeEditor, allPreset.quickBar!)).toMatchObject({
      type: 'feature',
      quickBar: {
        feature: { key: 'code-block' },
      },
    })

    const imageEditor = createEditor('<img src="/image.png" alt="image" />')
    imageEditor.commands.setNodeSelection(0)
    expect(resolveRichTextQuickBar(imageEditor, allPreset.quickBar!)).toMatchObject({
      type: 'feature',
      quickBar: {
        feature: { key: 'image' },
      },
    })

    const textEditor = createEditor('<p>plain text</p>')
    textEditor.commands.setTextSelection({ from: 1, to: 6 })
    expect(resolveRichTextQuickBar(textEditor, allPreset.quickBar!)).toEqual({
      type: 'text',
      controls: allPreset.quickBar!.textControls,
    })
  })

  it('accepts cross-block text but rejects selections containing code blocks or atoms', () => {
    const textEditor = createEditor(
      '<p>first</p><h2>second</h2><blockquote><p>third</p></blockquote>',
    )
    textEditor.commands.setTextSelection({
      from: 1,
      to: textEditor.state.doc.content.size - 1,
    })
    expect(resolveRichTextQuickBar(textEditor, allPreset.quickBar!)).toEqual({
      type: 'text',
      controls: allPreset.quickBar!.textControls,
    })

    const codeEditor = createEditor('<p>first</p><pre><code>code</code></pre><p>second</p>')
    codeEditor.commands.setTextSelection({
      from: 1,
      to: codeEditor.state.doc.content.size - 1,
    })
    expect(resolveRichTextQuickBar(codeEditor, allPreset.quickBar!)).toBeNull()

    const atomEditor = createEditor('<p>first</p><hr><p>second</p>')
    atomEditor.commands.setTextSelection({
      from: 1,
      to: atomEditor.state.doc.content.size - 1,
    })
    expect(resolveRichTextQuickBar(atomEditor, allPreset.quickBar!)).toBeNull()
  })

  it('hides all quick bars for coarse pointers and disabled editors', () => {
    const editor = createEditor('<p>plain text</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList)

    expect(resolveRichTextQuickBar(editor, allPreset.quickBar!)).toBeNull()

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList)
    editor.setEditable(false)
    expect(resolveRichTextQuickBar(editor, allPreset.quickBar!)).toBeNull()
  })
})
