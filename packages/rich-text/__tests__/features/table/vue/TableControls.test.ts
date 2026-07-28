import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { resolveRichTextTableContext } from '../../../../src/features/table/editor'
import TableSizePicker from '../../../../src/features/table/vue/TableSizePicker.vue'
import TableToolbarControl from '../../../../src/features/table/vue/TableToolbarControl.vue'
import { createTableExtensions } from '../../../../src/features/table/shared'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content: string | object = '<p>正文</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...createTableExtensions()],
    content,
  })
}

describe('table size picker and toolbar control', () => {
  it('uses a single palette tab stop, hover dimensions, and inserts the selected size', async () => {
    const editor = createEditor()
    const onClose = vi.fn()
    const wrapper = mount(TableSizePicker, {
      attachTo: document.body,
      props: { editor: markRaw(editor), onClose },
    })

    const cells = wrapper.findAll('[data-rich-text-palette-item]')
    expect(cells).toHaveLength(64)
    expect(cells.filter((cell) => cell.attributes('tabindex') === '0')).toHaveLength(1)
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('1 列 × 1 行')

    await cells[2 * 8 + 3]!.trigger('mouseenter')
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('4 列 × 3 行')
    expect(wrapper.get('[data-rich-text-table-size="3x4"]').attributes('data-active')).toBe('true')
    expect(wrapper.findAll('[data-rich-text-table-size-highlighted="true"]')).toHaveLength(12)
    expect(
      wrapper
        .get('[data-rich-text-table-size="4x5"]')
        .attributes('data-rich-text-table-size-highlighted'),
    ).toBeUndefined()

    await wrapper.get('[data-rich-text-table-size="3x4"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'table' }, { type: 'paragraph' }],
    })
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(4)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens a size picker outside a table and a structure menu inside one', async () => {
    const editor = createEditor()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get('[data-test="rich-text-table"]')

    expect(trigger.attributes('data-active')).toBeUndefined()
    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="rich-text-table-size-picker"]').exists()).toBe(true)

    await wrapper.get('[data-rich-text-table-size="1x1"]').trigger('click')
    await flushPromises()
    expect(resolveRichTextTableContext(editor.state.selection)).not.toBeNull()
    expect(trigger.attributes('data-active')).toBe('true')

    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="menu"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-table-rows"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-table-columns"]').exists()).toBe(true)
    expect(wrapper.getComponent(NPopover).props('show')).toBe(true)
  })

  it('opens at opposite palette edges with trigger arrow keys and restores focus on Escape', async () => {
    const editor = createEditor()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get('[data-test="rich-text-table"]')

    await trigger.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('8 列 × 8 行')

    await wrapper.get('[data-rich-text-table-size="8x8"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })
})
