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

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...linkFeature.documentExtensions!()],
    content: '<p><a href="https://example.com">链接文本</a>末尾</p>',
  })
}

async function mountQuickBar(editor = createEditor()) {
  editor.commands.setTextSelection(3)
  const wrapper = mount(LinkQuickBar, {
    global: {
      stubs: { teleport: true },
    },
    props: { editor: markRaw(editor) },
  })
  await flushPromises()
  return { editor, wrapper }
}

describe('LinkQuickBar', () => {
  it('starts read-only and enters the shared URL editor explicitly', async () => {
    const { editor, wrapper } = await mountQuickBar()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    expect(wrapper.get('[data-test="rich-text-link-readonly-url"]').text()).toBe(
      'https://example.com',
    )
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)

    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(wrapper.find('[data-test="rich-text-link-readonly-url"]').exists()).toBe(true)

    await wrapper.get('[data-test="rich-text-link-edit"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-link-edit"]').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-link-readonly-url"]').text()).toBe(
      'https://example.com',
    )
    expect(wrapper.getComponent(NInput).props('value')).toBe('https://example.com')
    expect(wrapper.find('[data-test="rich-text-link-cancel"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-link-open"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-test="rich-text-link-remove"]')).toHaveLength(1)

    wrapper.getComponent(NInput).vm.$emit('update:value', 'javascript:alert(1)')
    await flushPromises()
    expect(wrapper.getComponent(NInput).props('status')).toBe('error')
    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('disabled')).toBeDefined()

    wrapper.getComponent(NInput).vm.$emit('update:value', 'https://draft.example')
    editor.commands.setTextSelection(6)
    await wrapper.get('[data-test="rich-text-link-cancel"]').trigger('keydown', {
      key: 'Escape',
    })
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="rich-text-link-readonly-url"]').text()).toBe(
      'https://example.com',
    )
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('removes the complete link and restores the collapsed selection', async () => {
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
    expect(wrapper.find('[data-test="rich-text-link-readonly-url"]').exists()).toBe(false)
  })

  it('returns to a refreshed read-only state after editing', async () => {
    const { editor, wrapper } = await mountQuickBar()

    await wrapper.get('[data-test="rich-text-link-edit"]').trigger('click')
    wrapper.getComponent(NInput).vm.$emit('update:value', 'updated.example')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-link-readonly-url"]').text()).toBe(
      'https://updated.example',
    )
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
  })

  it('abandons an editing draft after an external document change', async () => {
    const { editor, wrapper } = await mountQuickBar()

    await wrapper.get('[data-test="rich-text-link-edit"]').trigger('click')
    wrapper.getComponent(NInput).vm.$emit('update:value', 'https://draft.example')
    await flushPromises()

    editor.commands.insertContent('外部')
    await flushPromises()

    expect(wrapper.emitted('close')?.at(-1)).toEqual(['invalidated'])
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
    expect(editor.getText()).toContain('外部')
    expect(editor.getHTML()).not.toContain('draft.example')
  })
})
