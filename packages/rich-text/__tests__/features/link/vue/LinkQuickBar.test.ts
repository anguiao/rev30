import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NInput } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import LinkQuickBar from '../../../../src/features/link/vue/LinkQuickBar.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content = '<p><a href="https://example.com">链接文本</a>末尾</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...linkFeature.documentExtensions!()],
    content,
  })
}

async function mountQuickBar(editor = createEditor()) {
  editor.commands.setTextSelection(3)
  const wrapper = mount(LinkQuickBar, {
    props: { editor: markRaw(editor) },
  })
  await flushPromises()
  return { editor, wrapper }
}

describe('LinkQuickBar', () => {
  it('renders the shared URL editor directly without taking focus', async () => {
    const { editor, wrapper } = await mountQuickBar()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    expect(wrapper.getComponent(NInput).props('value')).toBe('https://example.com')
    expect(document.activeElement).not.toBe(
      wrapper.get('[data-test="rich-text-link-url"] input').element,
    )

    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')

    expect(wrapper.find('[data-test="rich-text-link-cancel"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-link-open"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="rich-text-link-remove"]')).toHaveLength(1)

    wrapper.getComponent(NInput).vm.$emit('update:value', 'javascript:alert(1)')
    await flushPromises()
    expect(wrapper.getComponent(NInput).props('status')).toBe('error')
    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('disabled')).toBeDefined()

    wrapper.getComponent(NInput).vm.$emit('update:value', 'https://draft.example')
    await wrapper.get('[data-test="rich-text-link-cancel"]').trigger('keydown', {
      key: 'Escape',
    })
    await flushPromises()

    expect(editor.getHTML()).toContain('href="https://example.com"')
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('removes the complete link without moving the collapsed selection', async () => {
    const { editor, wrapper } = await mountQuickBar()
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    await wrapper.get('[data-test="rich-text-link-remove"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"link"')
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(onTransaction.mock.calls.filter(([event]) => event.transaction.docChanged)).toHaveLength(
      1,
    )
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('applies a link change and requests dismissal', async () => {
    const { editor, wrapper } = await mountQuickBar()

    wrapper.getComponent(NInput).vm.$emit('update:value', 'updated.example')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')

    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      marks: [{ type: 'link', attrs: { href: 'https://updated.example' } }],
      text: '链接文本',
    })
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(wrapper.emitted('dismiss')).toHaveLength(1)
  })

  it('starts a new edit when moving between links with the same URL', async () => {
    const editor = createEditor(
      '<p><a href="https://example.com">first</a> gap <a href="https://example.com">second</a></p>',
    )
    const { wrapper } = await mountQuickBar(editor)

    wrapper.getComponent(NInput).vm.$emit('update:value', 'draft.example')
    await flushPromises()
    editor.commands.setTextSelection(12)

    await vi.waitFor(() => {
      expect(wrapper.getComponent(NInput).props('value')).toBe('https://example.com')
    })
  })
})
