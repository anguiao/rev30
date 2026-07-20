import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NInput } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import LinkQuickbarControl from '../../../../src/features/link/vue/LinkQuickbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content: string) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...linkFeature.documentExtensions!()],
    content,
  })
}

function mountControl(editor: ReturnType<typeof createEditor>) {
  return mount(LinkQuickbarControl, {
    props: {
      editor: markRaw(editor),
    },
  })
}

async function setUrl(wrapper: ReturnType<typeof mountControl>, value: string) {
  wrapper.getComponent(NInput).vm.$emit('update:value', value)
  await flushPromises()
}

describe('LinkQuickbarControl', () => {
  it('creates a link for the exact single-block text selection', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })
    const wrapper = mountControl(editor)

    expect(
      wrapper.get('[data-test="rich-text-quickbar-link"]').attributes('disabled'),
    ).toBeUndefined()
    await wrapper.get('[data-test="rich-text-quickbar-link"]').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(NInput).props('value')).toBe('')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(false)

    editor.commands.setTextSelection(5)
    await setUrl(wrapper, 'example.com')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      { text: '普' },
      {
        text: '通文',
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
      },
      { text: '字' },
    ])
    expect(editor.state.selection).toMatchObject({ from: 2, to: 4 })
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
  })

  it('edits the complete continuous link for a partial link selection', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接文本</a>末尾</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-quickbar-link"]').trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(NInput).props('value')).toBe('https://old.example')
    await setUrl(wrapper, 'new.example')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      text: '链接文本',
      marks: [{ type: 'link', attrs: { href: 'https://new.example' } }],
    })
    expect(editor.state.selection).toMatchObject({ from: 2, to: 4 })
  })

  it('is disabled for cross-block selections while other text controls may remain available', async () => {
    const editor = createEditor('<p>第一段</p><p>第二段</p>')
    editor.commands.setTextSelection({ from: 2, to: 7 })
    const wrapper = mountControl(editor)

    const button = wrapper.get('[data-test="rich-text-quickbar-link"]')
    expect(button.attributes('disabled')).toBeDefined()
    await button.trigger('click')
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
  })

  it('restores its fixed selection on Escape and keeps a new selection on outside close', async () => {
    const editor = createEditor('<p>普通文字末尾</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await wrapper.get('[data-test="rich-text-quickbar-link"]').trigger('click')
    await setUrl(wrapper, 'draft.example')
    editor.commands.setTextSelection(5)
    await wrapper.get('[data-test="rich-text-link-url"] input').trigger('keydown', {
      key: 'Escape',
    })
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    expect(editor.getHTML()).not.toContain('draft.example')

    await wrapper.get('[data-test="rich-text-quickbar-link"]').trigger('click')
    await setUrl(wrapper, 'outside.example')
    editor.commands.setTextSelection(5)
    ;(wrapper.vm as unknown as { close: (reason: 'outside') => void }).close('outside')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 5, to: 5 })
    expect(editor.getHTML()).not.toContain('outside.example')
  })
})
