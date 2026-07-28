import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { runRichTextAction } from '../../../../src/editor/action'
import { insertTableAction } from '../../../../src/features/table/editor'
import { tableQuickBar } from '../../../../src/features/table/vue'
import { createTableExtensions } from '../../../../src/features/table/shared'
import { createTestEditor } from '../../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...createTableExtensions()],
    content: '<p></p>',
  })
}

describe('TableQuickBar', () => {
  it('exposes four roving controls and performs row, header, and table actions', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    const wrapper = mount(tableQuickBar.component, {
      attachTo: document.body,
      props: { ...tableQuickBar.props, editor: markRaw(editor) },
    })

    expect(
      wrapper.findAll('[data-rich-text-toolbar-item]').map((item) => item.attributes('data-test')),
    ).toEqual([
      'rich-text-quick-bar-table-rows',
      'rich-text-quick-bar-table-columns',
      'rich-text-quick-bar-table-header',
      'rich-text-quick-bar-table-delete',
    ])

    await wrapper.get('[data-test="rich-text-quick-bar-table-rows"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-table-menu-add-row-after"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(3)

    await wrapper.get('[data-test="rich-text-quick-bar-table-header"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe('tableCell')

    await wrapper.get('[data-test="rich-text-quick-bar-table-delete"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
  })
})
