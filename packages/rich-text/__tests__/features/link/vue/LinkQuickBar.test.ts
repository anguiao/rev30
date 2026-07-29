import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NInput, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import { linkQuickBar } from '../../../../src/features/link/vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content = '<p><a href="https://example.com">链接文本</a>末尾</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...linkFeature.sharedExtensions!()],
    content,
  })
}

function mountQuickBar(editor: ReturnType<typeof createEditor>) {
  return mount(linkQuickBar.component, {
    attachTo: document.body,
    props: {
      ...linkQuickBar.props,
      editor: markRaw(editor),
    },
  })
}

describe('LinkQuickBar', () => {
  it('offers a native open action and the shared link editor', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(3)
    const wrapper = mountQuickBar(editor)
    const controls = wrapper.findAll('[data-rich-text-toolbar-item]')
    const open = controls[0]!
    const edit = controls[1]!
    const editElement = edit.element as HTMLElement

    expect(controls.map((control) => control.attributes('data-test'))).toEqual([
      'rich-text-quick-bar-link-open',
      'rich-text-quick-bar-link-edit',
    ])
    expect(open.element.tagName).toBe('A')
    expect(open.attributes('href')).toBe('https://example.com')
    expect(open.attributes('target')).toBe('_blank')
    expect(open.attributes('rel')).toBe('noopener noreferrer')
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)

    editElement.focus()
    await edit.trigger('click')
    await flushPromises()

    const input = wrapper.get('[data-test="rich-text-link-url"] input')
    expect(wrapper.getComponent(NInput).props('value')).toBe('https://example.com')
    expect(document.activeElement).toBe(input.element)

    wrapper.getComponent(NInput).vm.$emit('update:value', 'draft.example')
    await input.trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(editor.getHTML()).toContain('href="https://example.com"')
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
    expect(document.activeElement).toBe(editElement)
  })

  it('is active only for a collapsed caret in an existing link', () => {
    const editor = createEditor()

    editor.commands.setTextSelection(3)
    expect(linkQuickBar.isActive(editor)).toBe(true)

    editor.commands.setTextSelection({ from: 2, to: 4 })
    expect(linkQuickBar.isActive(editor)).toBe(false)

    editor.commands.setTextSelection(7)
    expect(linkQuickBar.isActive(editor)).toBe(false)
  })
})
