import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { codeBlockEditorFeature } from '../../../../src/features/code-block/editor'
import CodeBlockLanguageControl from '../../../../src/features/code-block/vue/CodeBlockLanguageControl.vue'
import { createTestEditor } from '../../../helpers/editor'

describe('CodeBlockLanguageControl', () => {
  it('keeps focus on its trigger when closing the language menu with Escape', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const first = 1</code></pre><pre><code>const second = 2</code></pre>',
    })
    editor.commands.setTextSelection(1)
    editor.view.focus()
    const wrapper = mount(CodeBlockLanguageControl, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
        showLabel: true,
      },
    })

    expect(wrapper.get('[data-test="rich-text-code-block-language"]').text()).toContain('纯文本')

    wrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    await flushPromises()
    const trigger = wrapper.get<HTMLElement>('[data-test="rich-text-code-block-language"]')
    trigger.element.focus()
    await trigger.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(editor.state.selection).toMatchObject({ from: 1, to: 1 })
    expect(document.activeElement).toBe(trigger.element)
  })

  it('shows a valid language that is not in the language menu', () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code class="language-c++">const value = 1</code></pre>',
    })
    editor.commands.setTextSelection(1)
    const wrapper = mount(CodeBlockLanguageControl, {
      props: {
        editor: markRaw(editor),
        showLabel: true,
      },
    })

    expect(wrapper.get('[data-test="rich-text-code-block-language"]').text()).toContain('c++')
  })
})
