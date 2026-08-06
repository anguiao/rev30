import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NDropdown, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { getSelectedTable, insertTableAction } from '../../../../src/features/table/editor'
import { tableFeature } from '../../../../src/features/table/shared'
import TableToolbarSizePicker from '../../../../src/features/table/vue/TableToolbarSizePicker.vue'
import TableToolbarControl from '../../../../src/features/table/vue/TableToolbarControl.vue'
import { runRichTextAction } from '../../../../src/editor/action'
import { appendTestElement, createTestEditor } from '../../../helpers/editor'

function createEditor(content: string | object = '<p>正文</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...tableFeature.sharedExtensions!()],
    content,
  })
}

async function waitForEditorFocus() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

describe('table size picker and toolbar control', () => {
  it('uses a single grid tab stop, hover dimensions, and inserts the selected size', async () => {
    const editor = createEditor()
    const onClose = vi.fn()
    const wrapper = mount(TableToolbarSizePicker, {
      attachTo: document.body,
      props: { editor: markRaw(editor), onClose },
    })

    const cells = wrapper.findAll('[data-rich-text-grid-item]')
    expect(cells).toHaveLength(64)
    expect(wrapper.get('[data-test="rich-text-table-size-picker"]').attributes('role')).toBe(
      'dialog',
    )
    expect(cells.filter((cell) => cell.attributes('tabindex') === '0')).toHaveLength(1)
    expect(cells[0]!.classes()).toContain('border-stone-200')
    expect(cells[0]!.classes()).toContain('dark:border-zinc-500/60')
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('1 行 × 1 列')

    await cells[2 * 8 + 3]!.trigger('mouseenter')
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('3 行 × 4 列')
    expect(wrapper.get('[aria-label="3 行 4 列"]').attributes('aria-selected')).toBe('true')
    expect(
      cells.filter((cell) => cell.classes().includes('bg-(--rich-text-theme-primary-muted-color)')),
    ).toHaveLength(12)
    expect(wrapper.get('[aria-label="4 行 5 列"]').classes()).not.toContain(
      'bg-(--rich-text-theme-primary-muted-color)',
    )

    await wrapper.get('[aria-label="3 行 4 列"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'table' }, { type: 'paragraph' }],
    })
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(4)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens a size picker outside a table and exposes the complete cascaded action menu inside one', async () => {
    const editor = createEditor()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get('[data-test="rich-text-table"]')

    expect(trigger.attributes('aria-pressed')).toBe('false')
    await trigger.trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="rich-text-table-size-picker"]').exists()).toBe(true)

    await wrapper.get('[aria-label="2 行 2 列"]').trigger('click')
    await flushPromises()
    expect(getSelectedTable(editor.state.selection)).not.toBeNull()
    const activeTrigger = await vi.waitFor(() => {
      const trigger = wrapper.get('[data-test="rich-text-table"]')
      expect(trigger.attributes('aria-pressed')).toBe('true')
      return trigger
    })

    await activeTrigger.trigger('click')
    await flushPromises()
    const dropdown = wrapper.getComponent(NDropdown)
    const getOptions = () => dropdown.props('options') as DropdownOption[]
    const options = getOptions()
    const submenus = options.filter((option) => option.children !== undefined)

    expect(submenus.map((option) => option.label)).toEqual(['行', '列', '单元格', '对齐'])
    expect(submenus.map((option) => option.children?.map((child) => child.label))).toEqual([
      ['上方新增行', '下方新增行', '删除行'],
      ['左侧新增列', '右侧新增列', '删除列'],
      ['合并单元格', '拆分单元格', '取消表头单元格'],
      ['默认', '左对齐', '居中', '右对齐'],
    ])
    expect(options.map((option) => option.key)).toEqual([
      'table-row-actions',
      'table-column-actions',
      'table-cell-actions',
      'table-alignment-actions',
      'table-level-divider',
      'toggle-header-row',
      'toggle-header-column',
      'table-delete-divider',
      'delete-table',
    ])
    const headerRowOption = options.find((option) => option.key === 'toggle-header-row')!
    const headerColumnOption = options.find((option) => option.key === 'toggle-header-column')!
    const headerCellOption = submenus[2]!.children!.at(-1)!
    const alignmentOptions = submenus[3]!.children!

    expect(headerRowOption.label).toBe('取消首行表头')
    expect(headerColumnOption.label).toBe('设置首列表头')
    expect(headerCellOption.label).toBe('取消表头单元格')
    expect(headerRowOption.props).toMatchObject({
      role: 'menuitemcheckbox',
      'aria-checked': true,
    })
    expect(headerColumnOption.props).toMatchObject({
      role: 'menuitemcheckbox',
      'aria-checked': false,
    })
    expect(headerCellOption.props).toMatchObject({
      role: 'menuitemcheckbox',
      'aria-checked': true,
    })
    expect(alignmentOptions.map((option) => option.key)).toEqual([
      'set-cell-align-default',
      'set-cell-align-left',
      'set-cell-align-center',
      'set-cell-align-right',
    ])
    expect(alignmentOptions[0]!.props).toMatchObject({
      role: 'menuitemradio',
      'aria-checked': true,
      'aria-disabled': true,
    })
    expect(alignmentOptions.slice(1).map((option) => option.props?.['aria-checked'])).toEqual([
      false,
      false,
      false,
    ])
    expect(
      alignmentOptions.slice(1).every((option) => option.props?.['aria-disabled'] === undefined),
    ).toBe(true)
    expect(options.some((option) => option.type === 'group')).toBe(false)
    expect(wrapper.findAll('[role="menu"]')).toHaveLength(1)
    const rowSubmenu = wrapper.get('[data-test="rich-text-table-menu-table-row-actions"]')
    expect(rowSubmenu.attributes('aria-haspopup')).toBe('menu')
    const headerAction = wrapper.get('[data-test="rich-text-table-menu-toggle-header-row"]')
    expect(headerAction.attributes('role')).toBe('menuitemcheckbox')
    expect(headerAction.attributes('aria-checked')).toBe('true')
    expect(headerAction.attributes('aria-pressed')).toBeUndefined()
    const deleteTableIcon = wrapper.get(
      '[data-test="rich-text-table-menu-delete-table"] [class*="lucide--trash-2"]',
    )
    expect(deleteTableIcon.classes()).toContain('text-(--rich-text-theme-error-color)')

    const alignmentSubmenu = wrapper.get(
      '[data-test="rich-text-table-menu-table-alignment-actions"]',
    )
    await alignmentSubmenu.trigger('mouseenter')
    await vi.waitFor(() => expect(wrapper.findAll('[role="menu"]')).toHaveLength(2))
    expect(wrapper.get('[aria-label="对齐操作"]').attributes('role')).toBe('menu')
    const defaultAlignment = wrapper.get(
      '[data-test="rich-text-table-menu-set-cell-align-default"]',
    )
    const centerAlignment = wrapper.get('[data-test="rich-text-table-menu-set-cell-align-center"]')

    expect(defaultAlignment.attributes('role')).toBe('menuitemradio')
    expect(defaultAlignment.attributes('aria-checked')).toBe('true')
    expect(defaultAlignment.attributes('aria-disabled')).toBe('true')
    expect(defaultAlignment.attributes('aria-pressed')).toBeUndefined()
    expect(centerAlignment.attributes('role')).toBe('menuitemradio')
    expect(centerAlignment.attributes('aria-checked')).toBe('false')
    expect(centerAlignment.attributes('aria-disabled')).toBeUndefined()
    expect(dropdown.props('show')).toBe(true)

    await centerAlignment.trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.attrs.align).toBe('center')
    expect(dropdown.props('show')).toBe(false)

    await activeTrigger.trigger('click')
    await flushPromises()
    const updatedAlignmentOptions = getOptions().find(
      (option) => option.key === 'table-alignment-actions',
    )!.children!

    expect(updatedAlignmentOptions[0]!.props).toMatchObject({
      role: 'menuitemradio',
      'aria-checked': false,
    })
    expect(updatedAlignmentOptions[0]!.props?.['aria-disabled']).toBeUndefined()
    expect(updatedAlignmentOptions[2]!.props).toMatchObject({
      role: 'menuitemradio',
      'aria-checked': true,
      'aria-disabled': true,
    })

    await wrapper.get('[data-test="rich-text-table-menu-toggle-header-row"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe('tableCell')

    await activeTrigger.trigger('click')
    await flushPromises()
    expect(getOptions().find((option) => option.key === 'toggle-header-row')?.label).toBe(
      '设置首行表头',
    )
    expect(getOptions().find((option) => option.key === 'toggle-header-column')?.label).toBe(
      '设置首列表头',
    )
    expect(
      getOptions()
        .find((option) => option.key === 'table-cell-actions')
        ?.children?.at(-1)?.label,
    ).toBe('设置表头单元格')

    await wrapper.get('[data-test="rich-text-table-menu-toggle-header-column"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.firstChild?.type.name).toBe('tableHeader')

    await activeTrigger.trigger('click')
    await flushPromises()
    expect(getOptions().find((option) => option.key === 'toggle-header-row')?.label).toBe(
      '设置首行表头',
    )
    expect(getOptions().find((option) => option.key === 'toggle-header-column')?.label).toBe(
      '取消首列表头',
    )
    expect(
      getOptions()
        .find((option) => option.key === 'table-cell-actions')
        ?.children?.at(-1)?.label,
    ).toBe('取消表头单元格')

    await wrapper.get('[data-test="rich-text-table-menu-table-row-actions"]').trigger('mouseenter')
    await vi.waitFor(() => expect(wrapper.findAll('[role="menu"]')).toHaveLength(2))
    await wrapper.get('[data-test="rich-text-table-menu-add-row-after"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
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
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('8 行 × 8 列')

    await wrapper.get('[aria-label="8 行 8 列"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-table-size-label"]').text()).toContain('1 行 × 1 列')
    expect(document.activeElement).toBe(wrapper.get('[aria-label="1 行 1 列"]').element)
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
    const outside = appendTestElement('button')

    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    const cell = wrapper.get<HTMLElement>('[aria-label="1 行 1 列"]')
    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey,
      bubbles: true,
      cancelable: true,
    })

    cell.element.dispatchEvent(tab)
    outside.focus()
    await vi.waitFor(() => expect(wrapper.getComponent(NPopover).props('show')).toBe(false))

    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('uses the dropdown keyboard navigation and preserves native Tab focus', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(TableToolbarControl, {
      attachTo: document.body,
      props: { editor: markRaw(editor) },
    })
    const trigger = wrapper.get<HTMLElement>('[data-test="rich-text-table"]')
    const outside = appendTestElement('button')

    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()

    const dropdown = wrapper.getComponent(NDropdown)
    const rowSubmenu = wrapper.get<HTMLElement>(
      '[data-test="rich-text-table-menu-table-row-actions"]',
    )
    const arrowDown = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(arrowDown)
    await flushPromises()
    expect(arrowDown.defaultPrevented).toBe(true)
    expect(rowSubmenu.classes()).toContain('n-dropdown-option-body--pending')

    const arrowRight = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(arrowRight)
    await vi.waitFor(() => expect(wrapper.findAll('[role="menu"]')).toHaveLength(2))

    const nextRow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(nextRow)
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-table-menu-add-row-after"]').classes()).toContain(
      'n-dropdown-option-body--pending',
    )

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(enter)
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(dropdown.props('show')).toBe(false)

    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(escape)
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(dropdown.props('show')).toBe(false)
    expect(document.activeElement).toBe(trigger.element)

    await trigger.trigger('click')
    await flushPromises()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    trigger.element.dispatchEvent(tab)
    outside.focus()
    await vi.waitFor(() => expect(dropdown.props('show')).toBe(false))

    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})
