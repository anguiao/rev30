import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { codeBlockEditorFeature } from '../../../../src/features/code-block/editor'
import { codeBlockLanguageOptions } from '../../../../src/features/code-block/vue'
import CodeBlockQuickbar from '../../../../src/features/code-block/vue/CodeBlockQuickbar.vue'
import { createTestEditor } from '../../../helpers/editor'

describe('CodeBlockQuickbar', () => {
  it('closes only its language menu on Escape and restores the Quickbar target', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const first = 1</code></pre><pre><code>const second = 2</code></pre>',
    })
    editor.commands.setTextSelection(1)
    editor.view.focus()
    const wrapper = mount(CodeBlockQuickbar, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
        languages: [...codeBlockLanguageOptions],
      },
    })

    wrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    await flushPromises()
    editor.commands.setTextSelection(18)
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(
      wrapper
        .get('[data-test="rich-text-quickbar-code-block-language"]')
        .attributes('aria-expanded'),
    ).toBe('false')
    expect(editor.state.selection).toMatchObject({ from: 1, to: 1 })
    expect(document.activeElement).toBe(editor.view.dom)
  })
})
