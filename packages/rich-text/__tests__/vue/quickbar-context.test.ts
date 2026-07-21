import { defineComponent, shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseFeature } from '../../src/features/base/shared'
import { boldFeature } from '../../src/features/bold/shared'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'
import { defineRichTextQuickbar, richTextFeatureQuickbar } from '../../src/vue/quickbar'
import {
  isRichTextTextQuickbarSelection,
  resolveRichTextQuickbarContext,
} from '../../src/vue/quickbar/context'
import { createRichTextOverlayState } from '../../src/vue/overlay-state'
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

describe('rich text quickbar context', () => {
  it('resolves feature quickbars in declaration order before text selections', () => {
    const editor = createEditor('<p>context</p>')
    const component = defineComponent(() => () => null)
    const quickbar = defineRichTextQuickbar({
      features: [
        richTextFeatureQuickbar({
          feature: baseFeature,
          key: 'first',
          isActive: () => true,
          component,
          props: {},
        }),
        richTextFeatureQuickbar({
          feature: boldFeature,
          key: 'second',
          isActive: () => true,
          component,
          props: {},
        }),
      ],
    })

    expect(resolveRichTextQuickbarContext(editor, quickbar)).toMatchObject({
      type: 'feature',
      feature: { key: 'first' },
    })
  })

  it('selects Link, CodeBlock, Image, and plain text contexts from the all preset', () => {
    const linkEditor = createEditor('<p><a href="https://example.com">link</a> text</p>')
    linkEditor.commands.setTextSelection(2)
    expect(resolveRichTextQuickbarContext(linkEditor, allPreset.quickbar!)).toMatchObject({
      type: 'feature',
      feature: { key: 'link' },
    })

    const codeEditor = createEditor('<pre><code>const value = 1</code></pre>')
    codeEditor.commands.setTextSelection(2)
    expect(resolveRichTextQuickbarContext(codeEditor, allPreset.quickbar!)).toMatchObject({
      type: 'feature',
      feature: { key: 'code-block' },
    })

    const imageEditor = createEditor('<img src="/image.png" alt="image" />')
    imageEditor.commands.setNodeSelection(0)
    expect(resolveRichTextQuickbarContext(imageEditor, allPreset.quickbar!)).toMatchObject({
      type: 'feature',
      feature: { key: 'image' },
    })

    const textEditor = createEditor('<p>plain text</p>')
    textEditor.commands.setTextSelection({ from: 1, to: 6 })
    expect(resolveRichTextQuickbarContext(textEditor, allPreset.quickbar!)).toEqual({
      type: 'text',
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
    expect(isRichTextTextQuickbarSelection(textEditor)).toBe(true)

    const codeEditor = createEditor('<p>first</p><pre><code>code</code></pre><p>second</p>')
    codeEditor.commands.setTextSelection({
      from: 1,
      to: codeEditor.state.doc.content.size - 1,
    })
    expect(isRichTextTextQuickbarSelection(codeEditor)).toBe(false)
    expect(resolveRichTextQuickbarContext(codeEditor, allPreset.quickbar!)).toBeNull()

    const atomEditor = createEditor('<p>first</p><hr><p>second</p>')
    atomEditor.commands.setTextSelection({
      from: 1,
      to: atomEditor.state.doc.content.size - 1,
    })
    expect(isRichTextTextQuickbarSelection(atomEditor)).toBe(false)
  })

  it('hides all quickbars for coarse pointers and disabled editors', () => {
    const editor = createEditor('<p>plain text</p>')
    editor.commands.setTextSelection({ from: 1, to: 6 })
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList)

    expect(resolveRichTextQuickbarContext(editor, allPreset.quickbar!)).toBeNull()

    matchMedia.mockReturnValue({ matches: false } as MediaQueryList)
    editor.setEditable(false)
    expect(resolveRichTextQuickbarContext(editor, allPreset.quickbar!)).toBeNull()
  })
})

describe('rich text overlay state', () => {
  it('keeps a newer toolbar overlay active when an older overlay closes late', () => {
    const state = createRichTextOverlayState(shallowRef(null))
    const closeQuickbar = vi.fn()
    const closeFirst = vi.fn()
    const closeSecond = vi.fn()
    const firstOverlay = { close: closeFirst }
    const secondOverlay = { close: closeSecond }

    state.registerQuickbarCloser(closeQuickbar)
    state.openToolbarOverlay(firstOverlay)
    expect(state.toolbarOverlayOpen.value).toBe(true)

    state.openToolbarOverlay(secondOverlay)
    expect(closeFirst).toHaveBeenCalledWith('outside')
    expect(state.toolbarOverlayOpen.value).toBe(true)

    state.closeToolbarOverlay(firstOverlay)
    expect(state.toolbarOverlayOpen.value).toBe(true)

    state.closeToolbarOverlay(secondOverlay)
    expect(state.toolbarOverlayOpen.value).toBe(false)
    expect(closeQuickbar).toHaveBeenCalledTimes(2)
  })
})
