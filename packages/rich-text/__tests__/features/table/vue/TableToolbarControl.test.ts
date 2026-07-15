import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { JSONContent } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import { NButton, NCheckbox, NInputNumber, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { tableEditorFeature } from '../../../../src/features/table/editor'
import TableToolbarControl from '../../../../src/features/table/vue/TableToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(
  content: NonNullable<ConstructorParameters<typeof Editor>[0]>['content'] = '<p>维护通知</p>',
) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...tableEditorFeature.extensions!()],
    content,
  })
}

function createTableEditor(rowCount = 2, columnCount = 2) {
  const editor = createEditor({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: Array.from({ length: rowCount }, (_, rowIndex) => ({
          type: 'tableRow',
          content: Array.from({ length: columnCount }, (_, columnIndex) => ({
            type: 'tableCell',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: `${rowIndex}-${columnIndex}` }],
              },
            ],
          })),
        })),
      },
      { type: 'paragraph', content: [{ type: 'text', text: '表格后' }] },
    ],
  })

  editor.commands.setTextSelection(4)
  return editor
}

function mountControl(editor: Editor | null, disabled = false) {
  return mount(TableToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: editor ? markRaw(editor) : null,
      disabled,
    },
  })
}

function getButtonComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const button = wrapper.findAllComponents(NButton).find((component) => {
    return component.attributes('data-test') === dataTest
  })

  if (!button) {
    throw new Error(`Button not found: ${dataTest}`)
  }

  return button
}

function isPopoverOpen(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent(NPopover).props('show') === true
}

async function openPopover(wrapper: ReturnType<typeof mount>, panelDataTest: string) {
  await wrapper.get('[data-test="rich-text-table"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find(`[data-test="${panelDataTest}"]`).exists()).toBe(true)
  })
}

function findTable(editor: Editor): JSONContent | undefined {
  const json: JSONContent = editor.getJSON()

  return json.content?.find((node) => node.type === 'table')
}

function findParagraphPosition(editor: Editor, text: string) {
  let position: number | undefined

  editor.state.doc.descendants((node, nodePosition) => {
    if (node.type.name === 'paragraph' && node.textContent === text) {
      position = nodePosition + 1
      return false
    }

    return true
  })

  if (position === undefined) {
    throw new Error(`Paragraph not found: ${text}`)
  }

  return position
}

describe('TableToolbarControl', () => {
  it('inserts the default 3 by 3 table with a header row and closes the popover', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)

    await openPopover(wrapper, 'rich-text-table-insert-panel')

    expect(wrapper.getComponent(NInputNumber).props('value')).toBe(3)
    expect(wrapper.findAllComponents(NInputNumber)[1]?.props('value')).toBe(3)
    expect(wrapper.getComponent(NCheckbox).props('checked')).toBe(true)

    getButtonComponent(wrapper, 'rich-text-table-insert').vm.$emit('click')
    await flushPromises()

    const table = findTable(editor)
    expect(table?.content).toHaveLength(3)
    expect(table?.content?.every((row) => row.content?.length === 3)).toBe(true)
    expect(table?.content?.[0]?.content?.every((cell) => cell.type === 'tableHeader')).toBe(true)
    expect(table?.content?.[1]?.content?.every((cell) => cell.type === 'tableCell')).toBe(true)
    expect(isPopoverOpen(wrapper)).toBe(false)
  })

  it('validates dimensions and inserts a custom table without a header row', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)

    await openPopover(wrapper, 'rich-text-table-insert-panel')

    const [rowsInput, columnsInput] = wrapper.findAllComponents(NInputNumber)
    const headerRowInput = wrapper.getComponent(NCheckbox)
    const insertButton = getButtonComponent(wrapper, 'rich-text-table-insert')

    rowsInput!.vm.$emit('update:value', null)
    columnsInput!.vm.$emit('update:value', 11)
    await flushPromises()

    expect(insertButton.props('disabled')).toBe(true)

    rowsInput!.vm.$emit('update:value', 2)
    columnsInput!.vm.$emit('update:value', 3)
    headerRowInput.vm.$emit('update:checked', false)
    await flushPromises()

    expect(insertButton.props('disabled')).toBe(false)
    insertButton.vm.$emit('click')
    await flushPromises()

    const table = findTable(editor)
    expect(table?.content).toHaveLength(2)
    expect(table?.content?.every((row) => row.content?.length === 3)).toBe(true)
    expect(
      table?.content?.every((row) => row.content?.every((cell) => cell.type === 'tableCell')),
    ).toBe(true)
  })

  it('runs available table actions, preserves the panel, and closes when the selection leaves', async () => {
    const editor = createTableEditor()
    const wrapper = mountControl(editor)

    await openPopover(wrapper, 'rich-text-table-actions')

    expect(
      getButtonComponent(wrapper, 'rich-text-table-add-table-row-after').props('disabled'),
    ).toBe(false)
    expect(getButtonComponent(wrapper, 'rich-text-table-merge-table-cells').props('disabled')).toBe(
      true,
    )

    getButtonComponent(wrapper, 'rich-text-table-add-table-row-after').vm.$emit('click')
    await flushPromises()

    expect(findTable(editor)?.content).toHaveLength(3)
    expect(isPopoverOpen(wrapper)).toBe(true)

    editor.commands.setTextSelection(findParagraphPosition(editor, '表格后'))
    await flushPromises()

    expect(isPopoverOpen(wrapper)).toBe(false)
  })

  it('closes after deleting a table', async () => {
    const editor = createTableEditor()
    const wrapper = mountControl(editor)

    await openPopover(wrapper, 'rich-text-table-actions')
    getButtonComponent(wrapper, 'rich-text-table-delete-table').vm.$emit('click')
    await flushPromises()

    expect(findTable(editor)).toBeUndefined()
    expect(isPopoverOpen(wrapper)).toBe(false)
  })

  it('refreshes row and column availability after document-only transactions', async () => {
    const rowEditor = createTableEditor(99, 1)
    const rowWrapper = mountControl(rowEditor)

    await openPopover(rowWrapper, 'rich-text-table-actions')
    const addRowButton = getButtonComponent(rowWrapper, 'rich-text-table-add-table-row-after')
    expect(addRowButton.props('disabled')).toBe(false)

    addRowButton.vm.$emit('click')
    await flushPromises()

    expect(findTable(rowEditor)?.content).toHaveLength(100)
    expect(addRowButton.props('disabled')).toBe(true)

    const columnEditor = createTableEditor(1, 99)
    const columnWrapper = mountControl(columnEditor)

    await openPopover(columnWrapper, 'rich-text-table-actions')
    const addColumnButton = getButtonComponent(
      columnWrapper,
      'rich-text-table-add-table-column-after',
    )
    expect(addColumnButton.props('disabled')).toBe(false)

    addColumnButton.vm.$emit('click')
    await flushPromises()

    expect(findTable(columnEditor)?.content?.[0]?.content).toHaveLength(100)
    expect(addColumnButton.props('disabled')).toBe(true)
  })

  it('disables the control without an editor and closes it when disabled', async () => {
    const wrapperWithoutEditor = mountControl(null)
    const wrapper = mountControl(createEditor())

    expect(
      wrapperWithoutEditor.get('[data-test="rich-text-table"]').attributes('disabled'),
    ).toBeDefined()

    await openPopover(wrapper, 'rich-text-table-insert-panel')
    await wrapper.setProps({ disabled: true })
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-table"]').attributes('disabled')).toBeDefined()
    expect(isPopoverOpen(wrapper)).toBe(false)
  })
})
