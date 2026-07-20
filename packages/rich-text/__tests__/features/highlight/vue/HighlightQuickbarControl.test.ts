import Document from '@tiptap/extension-document'
import Highlight from '@tiptap/extension-highlight'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { highlightColorOptions } from '../../../../src/features/highlight/colors'
import HighlightQuickbarControl from '../../../../src/features/highlight/vue/HighlightQuickbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

describe('HighlightQuickbarControl', () => {
  it('closes only its color menu on Escape and restores the Quickbar target', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, Highlight.configure({ multicolor: true })],
      content: '<p>维护通知</p>',
    })
    editor.commands.setTextSelection({ from: 1, to: 3 })
    editor.view.focus()
    const wrapper = mount(HighlightQuickbarControl, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
        colors: [...highlightColorOptions],
      },
    })

    await wrapper.get('[data-test="rich-text-quickbar-highlight"]').trigger('click')
    await flushPromises()
    editor.commands.setTextSelection(5)

    const color = document.querySelector<HTMLElement>(
      '[data-test="rich-text-quickbar-highlight-yellow"]',
    )
    expect(color).not.toBeNull()
    color!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(
      wrapper.get('[data-test="rich-text-quickbar-highlight"]').attributes('aria-expanded'),
    ).toBe('false')
    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    expect(document.activeElement).toBe(editor.view.dom)
  })
})
