import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { flushPromises, mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { runRichTextAction } from '../../../../src/editor/action'
import { insertTableAction } from '../../../../src/features/table/editor'
import { tableFeature } from '../../../../src/features/table/core/feature'
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

function getTableCellPosition(
  editor: ReturnType<typeof createEditor>,
  row: number,
  column: number,
) {
  let tablePosition: number | undefined
  let table: ReturnType<typeof editor.state.doc.nodeAt> | undefined

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'table') {
      table = node
      tablePosition = position
      return false
    }

    return true
  })

  if (!table || tablePosition === undefined) {
    throw new Error('Expected a table')
  }

  const map = TableMap.get(table)
  const position = map.map[row * map.width + column]

  if (position === undefined) {
    throw new Error('Expected a table cell')
  }

  return tablePosition + position + 1
}

function getTableCell(editor: ReturnType<typeof createEditor>, row: number, column: number) {
  const cell = editor.state.doc.nodeAt(getTableCellPosition(editor, row, column))

  if (!cell) {
    throw new Error('Expected a table cell')
  }

  return cell
}

function selectTableCells(
  editor: ReturnType<typeof createEditor>,
  anchor: readonly [row: number, column: number],
  head: readonly [row: number, column: number],
) {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      new CellSelection(
        editor.state.doc.resolve(getTableCellPosition(editor, anchor[0], anchor[1])),
        editor.state.doc.resolve(getTableCellPosition(editor, head[0], head[1])),
      ),
    ),
  )
}

async function waitForEditorFocus() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

describe('TableQuickBar', () => {
  it('uses the default centered anchor alignment', () => {
    expect(tableQuickBar.anchorAlignment).toBeUndefined()
  })

  it('keeps five ordered entries and runs flat cell and alignment actions', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(tableQuickBar.component, {
      attachTo: document.body,
      props: { ...tableQuickBar.props, editor: markRaw(editor) },
    })

    expect(
      wrapper.findAll('[data-rich-text-toolbar-item]').map((item) => item.attributes('aria-label')),
    ).toEqual(['行操作', '列操作', '单元格操作', '对齐操作', '删除表格'])
    expect(
      wrapper
        .findAll('[data-rich-text-toolbar-item]')
        .map((item) => item.attributes('data-rich-text-toolbar-item')),
    ).toEqual(['table-rows', 'table-columns', 'table-cells', 'table-alignment', 'table-delete'])
    expect(
      wrapper.get('[data-test="rich-text-quick-bar-table-rows"]').attributes('role'),
    ).toBeUndefined()

    const dropdowns = wrapper.findAllComponents(NDropdown)
    expect(dropdowns).toHaveLength(4)
    expect(dropdowns.map((dropdown) => dropdown.props('placement'))).toEqual([
      'bottom-start',
      'bottom-start',
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
      ['merge-cells', 'split-cell', 'toggle-header-cell'],
      [
        'set-cell-align-default',
        'set-cell-align-left',
        'set-cell-align-center',
        'set-cell-align-right',
      ],
    ])
    expect(
      dropdowns
        .flatMap((dropdown) => dropdown.props('options') as DropdownOption[])
        .every((option) => option.children === undefined),
    ).toBe(true)

    const cellOptions = dropdowns[2]!.props('options') as DropdownOption[]
    const alignmentOptions = dropdowns[3]!.props('options') as DropdownOption[]

    expect(cellOptions.map((option) => option.label)).toEqual([
      '合并单元格',
      '拆分单元格',
      '取消表头单元格',
    ])
    expect(cellOptions[2]!.props).toMatchObject({
      role: 'menuitemcheckbox',
      'aria-checked': true,
    })
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

    await wrapper.get('[data-test="rich-text-quick-bar-table-rows"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-table-menu-add-row-after"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.childCount).toBe(3)

    await wrapper.get('[data-test="rich-text-quick-bar-table-cells"]').trigger('click')
    await flushPromises()
    const headerCellAction = wrapper.get('[data-test="rich-text-table-menu-toggle-header-cell"]')
    expect(headerCellAction.attributes('role')).toBe('menuitemcheckbox')
    expect(headerCellAction.attributes('aria-checked')).toBe('true')
    await headerCellAction.trigger('click')
    await flushPromises()
    expect(getTableCell(editor, 0, 0).type.name).toBe('tableCell')

    await wrapper.get('[data-test="rich-text-quick-bar-table-alignment"]').trigger('click')
    await flushPromises()
    const centerAlignment = wrapper.get('[data-test="rich-text-table-menu-set-cell-align-center"]')
    expect(centerAlignment.attributes('role')).toBe('menuitemradio')
    expect(centerAlignment.attributes('aria-checked')).toBe('false')
    await centerAlignment.trigger('click')
    await flushPromises()
    expect(getTableCell(editor, 0, 0).attrs.align).toBe('center')

    selectTableCells(editor, [0, 0], [0, 1])
    await flushPromises()
    const mixedCellOptions = wrapper
      .findAllComponents(NDropdown)[2]!
      .props('options') as DropdownOption[]
    const mixedAlignmentOptions = wrapper
      .findAllComponents(NDropdown)[3]!
      .props('options') as DropdownOption[]

    expect(mixedCellOptions[2]!.label).toBe('设置表头单元格')
    expect(mixedAlignmentOptions.map((option) => option.props?.['aria-checked'])).toEqual([
      false,
      false,
      false,
      false,
    ])

    await wrapper.get('[data-test="rich-text-quick-bar-table-cells"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-table-menu-merge-cells"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(1)

    await wrapper.get('[data-test="rich-text-quick-bar-table-cells"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="rich-text-table-menu-split-cell"]').trigger('click')
    await flushPromises()
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(2)

    const deleteButton = wrapper
      .findAllComponents(NButton)
      .find((button) => button.attributes('aria-label') === '删除表格')
    expect(deleteButton?.props('type')).toBe('error')
    expect(deleteButton?.attributes('title')).toBe('删除表格')
    await wrapper.get('[data-test="rich-text-quick-bar-table-delete"]').trigger('click')
    await flushPromises()
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
  })

  it('keeps the outer Quick Bar open when an alignment dropdown consumes Escape', async () => {
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

    const alignmentTrigger = await vi.waitFor(() => {
      const trigger = wrapper.find<HTMLElement>('[data-test="rich-text-quick-bar-table-alignment"]')
      expect(trigger.exists()).toBe(true)
      return trigger
    })
    alignmentTrigger.element.focus()
    await alignmentTrigger.trigger('click')
    await flushPromises()

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
    alignmentTrigger.element.dispatchEvent(escape)
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(alignmentTrigger.element)
    expect(alignmentTrigger.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(true)
  })

  it('keeps five enabled controls in the outer roving focus order', async () => {
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

    const controls = await vi.waitFor(() => {
      const controls = wrapper.findAll<HTMLElement>('[data-rich-text-toolbar-item]')
      expect(controls).toHaveLength(5)
      return controls
    })

    expect(controls.map((control) => control.element.tabIndex)).toEqual([0, -1, -1, -1, -1])
    await controls[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[1]!.element)
    await controls[1]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(controls[4]!.element)
    await controls[4]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[0]!.element)
  })

  it('keeps native Tab focus movement while closing an alignment dropdown', async () => {
    const editor = createEditor()
    runRichTextAction(editor, insertTableAction, 2, 2)
    await waitForEditorFocus()
    const wrapper = mount(tableQuickBar.component, {
      attachTo: document.body,
      props: { ...tableQuickBar.props, editor: markRaw(editor) },
    })
    const alignmentTrigger = wrapper.get<HTMLElement>(
      '[data-test="rich-text-quick-bar-table-alignment"]',
    )
    const dropdown = wrapper.findAllComponents(NDropdown)[3]!
    const outside = appendTestElement('button')

    alignmentTrigger.element.focus()
    await alignmentTrigger.trigger('click')
    await flushPromises()

    const tab = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    alignmentTrigger.element.dispatchEvent(tab)
    outside.focus()

    await vi.waitFor(() => expect(dropdown.props('show')).toBe(false))
    expect(tab.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})
