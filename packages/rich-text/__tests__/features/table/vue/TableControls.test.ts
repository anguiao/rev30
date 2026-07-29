import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NDropdown, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  insertTableAction,
  resolveRichTextTableContext,
} from '../../../../src/features/table/editor'
import TableSizePicker from '../../../../src/features/table/vue/TableSizePicker.vue'
import TableToolbarControl from '../../../../src/features/table/vue/TableToolbarControl.vue'
import { createTableExtensions } from '../../../../src/features/table/shared'
import { runRichTextAction } from '../../../../src/editor/action'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content: string | object = '<p>正文</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...createTableExtensions()],
    content,
  })
}

async function waitForPopupClose() {
  await new Promise((resolve) => setTimeout(resolve))
  await flushPromises()
}

async function waitForEditorFocus() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
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
    expect(cells[0]!.classes()).toContain('border-stone-200')
    expect(cells[0]!.classes()).toContain('dark:border-zinc-500/60')
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

  it('opens a size picker outside a table and a cascaded structure dropdown inside one', async () => {
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
    const activeTrigger = wrapper.get('[data-test="rich-text-table"]')
    expect(activeTrigger.attributes('data-active')).toBe('true')

    await activeTrigger.trigger('click')
    await flushPromises()
    const dropdown = wrapper.getComponent(NDropdown)
    const options = dropdown.props('options') as DropdownOption[]
    const submenus = options.filter((option) => option.richTextTableSubmenu === true)

    expect(submenus.map((option) => option.label)).toEqual(['行', '列'])
    expect(submenus.map((option) => option.children?.map((child) => child.label))).toEqual([
      ['上方新增行', '下方新增行', '删除行'],
      ['左侧新增列', '右侧新增列', '删除列'],
    ])
    expect(options.map((option) => option.key)).toEqual([
      'table-row-actions',
      'table-column-actions',
      'table-level-divider',
      'toggle-header-row',
      'delete-table',
    ])
    const headerOption = options.find((option) => option.key === 'toggle-header-row')!
    expect(headerOption.label).toBe('取消首行表头')
    expect(headerOption.richTextTableToggle).toBe(false)
    expect(options.some((option) => option.type === 'group')).toBe(false)
    expect(wrapper.findAll('[role="menu"]')).toHaveLength(1)
    const rowSubmenu = wrapper.get('[data-test="rich-text-table-menu-table-row-actions"]')
    expect(rowSubmenu.attributes('aria-haspopup')).toBe('menu')
    const headerAction = wrapper.get('[data-test="rich-text-table-menu-toggle-header-row"]')
    expect(headerAction.attributes('role')).toBe('menuitem')
    expect(headerAction.attributes('aria-checked')).toBeUndefined()
    const deleteTableIcon = wrapper.get(
      '[data-test="rich-text-table-menu-delete-table"] [data-rich-text-table-destructive-icon="true"]',
    )
    expect(deleteTableIcon.classes()).toContain('text-(--rich-text-theme-error-color)')

    await rowSubmenu.get('.rich-text-table-option-body').trigger('mouseenter')
    await vi.waitFor(() => expect(wrapper.findAll('[role="menu"]')).toHaveLength(2))
    expect(wrapper.get('[aria-label="行操作"]').attributes('role')).toBe('menu')
    expect(dropdown.props('show')).toBe(true)

    await wrapper
      .get('[data-test="rich-text-table-menu-add-row-after"]')
      .get('.rich-text-table-option-body')
      .trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(2)
    expect(dropdown.props('show')).toBe(false)

    await activeTrigger.trigger('click')
    await flushPromises()
    await wrapper
      .get('[data-test="rich-text-table-menu-toggle-header-row"]')
      .get('.rich-text-table-option-body')
      .trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe('tableCell')

    await activeTrigger.trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-table-menu-toggle-header-row"]').text()).toContain(
      '设置首行表头',
    )
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

  it.each([
    ['Tab', false],
    ['Shift+Tab', true],
  ])('lets %s keep native focus navigation while closing the size picker', async (_, shiftKey) => {
    const editor = createEditor()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get('[data-test="rich-text-table"]')
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    const cell = wrapper.get<HTMLElement>('[data-rich-text-table-size="1x1"]')
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    })

    cell.element.dispatchEvent(tab)
    outside.focus()
    await waitForPopupClose()

    expect(tab.defaultPrevented).toBe(false)
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
    expect(document.activeElement).toBe(outside)

    outside.remove()
  })

  it('opens the structure menu from the requested edge and preserves native Tab focus', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get<HTMLElement>('[data-test="rich-text-table"]')
    const outside = document.createElement('button')
    document.body.appendChild(outside)

    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    trigger.element.focus()
    await trigger.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()

    const dropdown = wrapper.getComponent(NDropdown)
    const deleteTable = wrapper.get<HTMLElement>('[data-test="rich-text-table-menu-delete-table"]')
    await vi.waitFor(() => expect(document.activeElement).toBe(deleteTable.element))
    expect(deleteTable.element.tabIndex).toBe(-1)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    deleteTable.element.dispatchEvent(tab)
    outside.focus()
    await waitForPopupClose()

    expect(tab.defaultPrevented).toBe(false)
    expect(dropdown.props('show')).toBe(false)
    expect(document.activeElement).toBe(outside)

    trigger.element.focus()
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    const rowSubmenu = wrapper.get<HTMLElement>(
      '[data-test="rich-text-table-menu-table-row-actions"]',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(rowSubmenu.element))

    await rowSubmenu.trigger('keydown', { key: 'ArrowRight' })
    const firstRowAction = wrapper.get<HTMLElement>(
      '[data-test="rich-text-table-menu-add-row-before"]',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(firstRowAction.element))
    expect(wrapper.findAll('[role="menu"]')).toHaveLength(2)

    await firstRowAction.trigger('keydown', { key: 'ArrowDown' })
    const secondRowAction = wrapper.get<HTMLElement>(
      '[data-test="rich-text-table-menu-add-row-after"]',
    )
    expect(document.activeElement).toBe(secondRowAction.element)

    await secondRowAction.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(secondRowAction.element)

    const arrowLeft = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true,
    })
    secondRowAction.element.dispatchEvent(arrowLeft)
    await vi.waitFor(() => expect(document.activeElement).toBe(rowSubmenu.element))
    expect(arrowLeft.defaultPrevented).toBe(true)
    await vi.waitFor(() => expect(wrapper.findAll('[role="menu"]')).toHaveLength(1))

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    rowSubmenu.element.dispatchEvent(escape)
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(dropdown.props('show')).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    outside.remove()
  })
})
