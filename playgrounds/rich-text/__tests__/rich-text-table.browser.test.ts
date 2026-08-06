import { expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import {
  getEditorRoot,
  renderRichTextEditorHarness,
  type RichTextEditorHarnessScreen,
} from './fixtures/renderRichTextEditorHarness'

interface TableCellModel {
  readonly type: 'tableCell' | 'tableHeader'
  readonly attrs: {
    readonly align: string | null
    readonly colwidth: readonly number[] | null
  }
}

interface TableRowModel {
  readonly type: 'tableRow'
  readonly content: readonly TableCellModel[]
}

interface TableModel {
  readonly type: 'table'
  readonly content: readonly TableRowModel[]
}

const editorSelector = '[data-test="editor-container"] .ProseMirror'
const bodyRowSelector = `${editorSelector} .tableWrapper tbody tr:nth-child(2)`

function bodyCellSelector(column: number) {
  return `${bodyRowSelector} > :is(th, td):nth-child(${column})`
}

function getEditorTable(editor: HTMLElement) {
  const table = editor.querySelector<HTMLTableElement>('.tableWrapper > table')

  if (table === null) {
    throw new Error('Expected an editor table')
  }

  return table
}

function getCurrentEditorRoot(screen: RichTextEditorHarnessScreen) {
  const editor = screen
    .getByTestId('editor-container')
    .element()
    .querySelector<HTMLElement>('.ProseMirror')

  if (editor === null) {
    throw new Error('Expected a current ProseMirror editor')
  }

  return editor
}

function getCurrentEditorTable(screen: RichTextEditorHarnessScreen) {
  return getEditorTable(getCurrentEditorRoot(screen))
}

function getTableBodyCell(table: HTMLTableElement, column: number) {
  const row = table.tBodies.item(0)?.rows.item(1)
  const cell = row?.cells.item(column - 1)

  if (cell === null || cell === undefined) {
    throw new Error(`Expected table body cell ${column}`)
  }

  return cell
}

function readTableModel(screen: RichTextEditorHarnessScreen) {
  const document = JSON.parse(screen.getByTestId('model-json').element().textContent ?? '') as {
    content?: unknown[]
  }
  const table = document.content?.find(
    (node): node is TableModel =>
      typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'table',
  )

  if (table === undefined) {
    throw new Error('Expected a table in the editor model')
  }

  return table
}

function getRenderedTable(screen: RichTextEditorHarnessScreen) {
  const table = screen
    .getByTestId('rendered-result')
    .element()
    .querySelector<HTMLTableElement>('table')

  if (table === null) {
    throw new Error('Expected a derived table')
  }

  return table
}

function getColumnWidth(table: TableModel, column: number) {
  return table.content
    .map((row) => row.content[column]?.attrs.colwidth?.[0])
    .find((width): width is number => typeof width === 'number')
}

async function setTableDocument(screen: RichTextEditorHarnessScreen) {
  await screen.getByTestId('set-table-document').click()
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"table"')
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('ready')
}

async function selectTwoBodyCells() {
  await commands.dragMouse(
    { selector: bodyCellSelector(1), x: 0.5, y: 0.5 },
    { selector: bodyCellSelector(2), x: 0.45, y: 0.5 },
  )
}

async function focusToolbarTableControl(screen: RichTextEditorHarnessScreen) {
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })
  const tableControl = toolbar.getByRole('button', { name: '表格操作' })
  const toolbarItems = Array.from(
    toolbar.element().querySelectorAll<HTMLElement>('[data-rich-text-toolbar-item]'),
  ).filter((item) => !item.matches(':disabled') && item.getAttribute('aria-disabled') !== 'true')

  await userEvent.keyboard('{Alt>}{F10}{/Alt}')

  for (let index = 0; index < toolbarItems.length; index += 1) {
    if (document.activeElement === tableControl.element()) {
      break
    }

    await userEvent.keyboard('{ArrowRight}')
  }

  expect(document.activeElement).toBe(tableControl.element())
  await userEvent.keyboard('{Enter}')
}

test('runs table Quick Bar and toolbar actions through a real multi-cell drag', async () => {
  const screen = renderRichTextEditorHarness()
  await setTableDocument(screen)
  const editor = await getEditorRoot(screen)

  await selectTwoBodyCells()
  await expect.poll(() => getEditorTable(editor).querySelectorAll('.selectedCell').length).toBe(2)

  const quickBar = screen.getByTestId('rich-text-quick-bar')
  await expect.element(quickBar.getByRole('button', { name: '单元格操作' })).toBeVisible()
  await quickBar.getByRole('button', { name: '单元格操作' }).click()
  await screen.getByRole('menuitem', { name: '合并单元格' }).click()
  await expect.poll(() => getTableBodyCell(getEditorTable(editor), 1).colSpan).toBe(2)
  expect(readTableModel(screen).content[1]?.content).toHaveLength(4)

  await quickBar.getByRole('button', { name: '单元格操作' }).click()
  await screen.getByRole('menuitem', { name: '拆分单元格' }).click()
  await expect.poll(() => getTableBodyCell(getEditorTable(editor), 1).colSpan).toBe(1)
  expect(readTableModel(screen).content[1]?.content).toHaveLength(5)

  await focusToolbarTableControl(screen)
  await screen.getByRole('menuitemcheckbox', { name: '设置首列表头' }).click()
  await expect.poll(() => getTableBodyCell(getEditorTable(editor), 1).tagName).toBe('TH')

  await userEvent.click(getTableBodyCell(getEditorTable(editor), 2))
  const elementPath = screen.getByTestId('rich-text-element-path')
  await expect.element(elementPath.getByRole('button', { name: '选择 tr 元素' })).toBeVisible()
  await elementPath.getByRole('button', { name: '选择 tr 元素' }).click()
  await expect.poll(() => getEditorTable(editor).querySelectorAll('.selectedCell').length).toBe(5)
  await quickBar.getByRole('button', { name: '单元格操作' }).click()
  await screen.getByRole('menuitemcheckbox', { name: '设置表头单元格' }).click()
  await quickBar.getByRole('button', { name: '对齐操作' }).click()
  await expect.element(screen.getByRole('menuitemradio', { name: '居中' })).toBeVisible()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

  await expect
    .poll(() => {
      const table = readTableModel(screen)
      const cells = table.content[1]?.content ?? []

      return (
        cells.length === 5 &&
        cells.every((cell) => cell.type === 'tableHeader' && cell.attrs.align === 'center')
      )
    })
    .toBe(true)
  const editorCells = getEditorTable(editor).querySelectorAll<HTMLTableCellElement>(
    'tbody tr:nth-child(2) > th',
  )
  expect(editorCells).toHaveLength(5)
  expect(Array.from(editorCells).every((cell) => cell.style.textAlign === 'center')).toBe(true)

  await expect
    .poll(() => {
      const renderedTable = getRenderedTable(screen)
      const cells = renderedTable.querySelectorAll<HTMLTableCellElement>(
        'tbody tr:nth-child(2) > th',
      )

      return (
        cells.length === 5 && Array.from(cells).every((cell) => cell.style.textAlign === 'center')
      )
    })
    .toBe(true)
})

test('resizes inner and final table edges with native mouse input and one undo', async () => {
  const screen = renderRichTextEditorHarness()
  await setTableDocument(screen)
  const editor = await getEditorRoot(screen)

  await new Promise<void>((resolve) => window.setTimeout(resolve, 600))

  await commands.dragMouse(
    { selector: bodyCellSelector(1), x: 0.98, y: 0.5 },
    { selector: bodyCellSelector(2), x: 0.45, y: 0.5 },
  )
  await expect.poll(() => getColumnWidth(readTableModel(screen), 0)).toBeTypeOf('number')
  const firstColumnWidth = getColumnWidth(readTableModel(screen), 0)
  const editorFirstColumn = getEditorTable(editor).querySelectorAll('col')[0]
  expect(firstColumnWidth).toBeDefined()
  expect(editorFirstColumn?.style.width).toBe(`${firstColumnWidth}px`)

  await expect
    .poll(() => {
      const renderedColumn = getRenderedTable(screen).querySelectorAll('col')[0]

      return renderedColumn?.style.width === `${firstColumnWidth}px`
    })
    .toBe(true)

  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '撤销' })
    .click()
  await expect.poll(() => getColumnWidth(readTableModel(screen), 0)).toBeUndefined()

  const tableWrapper = getCurrentEditorRoot(screen).querySelector<HTMLElement>('.tableWrapper')
  if (tableWrapper === null) {
    throw new Error('Expected a table wrapper')
  }

  tableWrapper.scrollLeft = tableWrapper.scrollWidth
  const minWidthBefore = Number.parseFloat(getCurrentEditorTable(screen).style.minWidth)
  await commands.dragMouse(
    { selector: bodyCellSelector(5), x: 0.98, y: 0.5 },
    { selector: bodyCellSelector(5), x: 1.45, y: 0.5 },
  )
  await expect.poll(() => getColumnWidth(readTableModel(screen), 4)).toBeTypeOf('number')
  const finalColumnWidth = getColumnWidth(readTableModel(screen), 4)

  expect(finalColumnWidth).toBeDefined()
  expect(Number.parseFloat(getCurrentEditorTable(screen).style.minWidth)).toBeGreaterThan(
    minWidthBefore,
  )
  expect(tableWrapper.scrollWidth).toBeGreaterThan(tableWrapper.clientWidth)
  await expect
    .poll(() => {
      const renderedTable = getRenderedTable(screen)
      const renderedColumn = renderedTable.querySelectorAll('col')[4]

      return (
        renderedColumn?.style.width === `${finalColumnWidth}px` &&
        Number.parseFloat(renderedTable.style.minWidth) > minWidthBefore
      )
    })
    .toBe(true)
})

test('blocks new resize gestures while disabled without mutating the model on lifecycle changes', async () => {
  const screen = renderRichTextEditorHarness(undefined, { initialDisabled: true })
  await setTableDocument(screen)
  const editor = await getEditorRoot(screen)
  const modelBefore = screen.getByTestId('model-json').element().textContent
  await expect.element(editor).toHaveAttribute('contenteditable', 'false')

  await commands.dragMouse(
    { selector: bodyCellSelector(1), x: 0.98, y: 0.5 },
    { selector: bodyCellSelector(2), x: 0.45, y: 0.5 },
  )
  expect(screen.getByTestId('model-json').element().textContent).toBe(modelBefore)

  await screen.getByTestId('toggle-editor-disabled').click()
  await expect.element(editor).toHaveAttribute('contenteditable', 'true')
  expect(screen.getByTestId('model-json').element().textContent).toBe(modelBefore)

  await commands.dragMouse(
    { selector: bodyCellSelector(1), x: 0.98, y: 0.5 },
    { selector: bodyCellSelector(2), x: 0.45, y: 0.5 },
  )
  await expect.poll(() => getColumnWidth(readTableModel(screen), 0)).toBeTypeOf('number')
  const resizedModel = screen.getByTestId('model-json').element().textContent

  await screen.getByTestId('toggle-editor-disabled').click()
  await expect.element(editor).toHaveAttribute('contenteditable', 'false')
  expect(screen.getByTestId('model-json').element().textContent).toBe(resizedModel)

  await commands.dragMouse(
    { selector: bodyCellSelector(1), x: 0.98, y: 0.5 },
    { selector: bodyCellSelector(2), x: 0.45, y: 0.5 },
  )
  expect(screen.getByTestId('model-json').element().textContent).toBe(resizedModel)
})

test('prioritizes text and full-cell selections for their corresponding Quick Bars', async () => {
  const screen = renderRichTextEditorHarness()
  await setTableDocument(screen)
  const editor = await getEditorRoot(screen)
  const firstCell = getTableBodyCell(getEditorTable(editor), 1)
  const quickBar = screen.getByTestId('rich-text-quick-bar')

  await userEvent.click(firstCell)
  await expect.element(quickBar.getByRole('button', { name: '行操作' })).toBeVisible()

  await userEvent.keyboard('{End}')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  await expect.element(quickBar.getByRole('button', { name: '加粗' })).toBeVisible()
  expect(quickBar.element().querySelector('[aria-label="行操作"]')).toBeNull()

  await selectTwoBodyCells()
  await expect.poll(() => getEditorTable(editor).querySelectorAll('.selectedCell').length).toBe(2)
  await expect.element(quickBar.getByRole('button', { name: '行操作' })).toBeVisible()
})
