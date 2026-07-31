import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { runRichTextAction } from '../../../../src/editor/action'
import { insertTableAction } from '../../../../src/features/table/editor'
import { tableFeature } from '../../../../src/features/table/shared'
import { tableQuickBar } from '../../../../src/features/table/vue'
import { defineRichTextQuickBar } from '../../../../src/vue/quick-bar'
import RichTextQuickBar from '../../../../src/vue/quick-bar/RichTextQuickBar.vue'
import { appendTestElement, createTestEditor } from '../../../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...tableFeature.sharedExtensions!()],
    content: '<p></p>',
  })
}

async function waitForEditorFocus() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

describe('TableQuickBar', () => {
  it('exposes row and column dropdowns plus a destructive table action', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(tableQuickBar.component, {
      attachTo: document.body,
      props: { ...tableQuickBar.props, editor: markRaw(editor) },
    })

    expect(
      wrapper.findAll('[data-rich-text-toolbar-item]').map((item) => item.attributes('aria-label')),
    ).toEqual(['行操作', '列操作', '删除表格'])
    expect(
      wrapper.get('[data-test="rich-text-quick-bar-table-rows"]').attributes('role'),
    ).toBeUndefined()

    const dropdowns = wrapper.findAllComponents(NDropdown)
    expect(dropdowns).toHaveLength(2)
    expect(dropdowns.map((dropdown) => dropdown.props('placement'))).toEqual([
      'bottom-start',
      'bottom-start',
    ])
    expect(
      dropdowns.map((dropdown) =>
        (dropdown.props('options') as DropdownOption[]).map((option) => option.key),
      ),
    ).toEqual([
      ['add-row-before', 'add-row-after', 'delete-row'],
      ['add-column-before', 'add-column-after', 'delete-column'],
    ])
    expect(
      dropdowns
        .flatMap((dropdown) => dropdown.props('options') as DropdownOption[])
        .every((option) => option.children === undefined),
    ).toBe(true)

    await wrapper.get('[data-test="rich-text-quick-bar-table-rows"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-table-menu-add-row-after"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(3)

    const deleteButton = wrapper
      .findAllComponents(NButton)
      .find((button) => button.attributes('aria-label') === '删除表格')
    expect(deleteButton?.props('type')).toBe('error')
    expect(deleteButton?.attributes('title')).toBe('删除表格')
    await wrapper.get('[data-test="rich-text-quick-bar-table-delete"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
  })

  it('keeps the outer Quick Bar open when a row dropdown consumes Escape', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    editor.view.focus()
    const wrapper = mount(RichTextQuickBar, {
      attachTo: document.body,
      props: {
        appendTo: document.body,
        scrollContainer: document.body,
        editor: markRaw(editor),
        quickBar: defineRichTextQuickBar({ featureBars: [tableQuickBar] }),
      },
    })

    const rowTrigger = await vi.waitFor(() => {
      const trigger = wrapper.find<HTMLElement>('[data-test="rich-text-quick-bar-table-rows"]')
      expect(trigger.exists()).toBe(true)
      return trigger
    })
    rowTrigger.element.focus()
    await rowTrigger.trigger('click')
    await flushPromises()

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    rowTrigger.element.dispatchEvent(escape)
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(rowTrigger.element)
    expect(rowTrigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(true)
  })

  it('keeps native Tab focus movement while closing a row dropdown', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(tableQuickBar.component, {
      attachTo: document.body,
      props: { ...tableQuickBar.props, editor: markRaw(editor) },
    })
    const rowTrigger = wrapper.get<HTMLElement>('[data-test="rich-text-quick-bar-table-rows"]')
    const dropdown = wrapper.findAllComponents(NDropdown)[0]!
    const outside = appendTestElement('button')

    rowTrigger.element.focus()
    await rowTrigger.trigger('click')
    await flushPromises()

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    rowTrigger.element.dispatchEvent(tab)
    outside.focus()

    await vi.waitFor(() => expect(dropdown.props('show')).toBe(false))
    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})
