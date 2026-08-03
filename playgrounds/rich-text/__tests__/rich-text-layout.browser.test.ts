import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('exits a trailing code block only after a real click below its DOM rect', async () => {
  const screen = renderRichTextEditorHarness()
  await screen.getByTestId('set-code-block-document').click()
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"codeBlock"')

  const editable = await getEditable(screen)
  const editorElement = editable.element()
  const codeElement = editorElement.querySelector<HTMLElement>('pre')
  expect(codeElement).not.toBeNull()

  const editorRect = editorElement.getBoundingClientRect()
  const codeRect = codeElement!.getBoundingClientRect()
  expect(codeRect.bottom).toBeLessThan(editorRect.bottom)

  const clickY = codeRect.bottom - editorRect.top + 24
  expect(clickY).toBeGreaterThan(codeRect.bottom - editorRect.top)
  expect(clickY).toBeLessThan(editorRect.height)
  await userEvent.click(editable, { position: { x: 24, y: clickY } })
  await userEvent.keyboard('next')

  const document = JSON.parse(
    screen.getByTestId('model-json').element().textContent ?? '',
  ) as unknown
  expect(document).toEqual({
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const value = 1' }],
      },
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: [{ type: 'text', text: 'next' }],
      },
    ],
  })
})

test('keeps a wide table scrollable and adds a row from the last cell with native Tab', async () => {
  const screen = renderRichTextEditorHarness()
  await screen.getByTestId('set-table-document').click()
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"table"')

  const editable = await getEditable(screen)
  const tableWrapper = editable.element().querySelector<HTMLElement>('.tableWrapper')
  const table = tableWrapper?.querySelector<HTMLTableElement>('table')
  expect(tableWrapper).not.toBeNull()
  expect(table).not.toBeNull()
  expect(tableWrapper!.scrollWidth).toBeGreaterThan(tableWrapper!.clientWidth)

  const rowsBefore = table!.querySelectorAll('tr').length
  const lastRow = table!.querySelectorAll('tr')[rowsBefore - 1]
  const cells = lastRow?.querySelectorAll('th, td')
  const lastCell = cells?.[cells.length - 1]
  expect(lastCell).not.toBeUndefined()

  await userEvent.click(lastCell!)
  await userEvent.keyboard('{Tab}')
  await userEvent.keyboard('row')

  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"tableRow"')
  const rowsAfter = table!.querySelectorAll('tr')
  expect(rowsAfter).toHaveLength(rowsBefore + 1)

  const document = JSON.parse(
    screen.getByTestId('model-json').element().textContent ?? '',
  ) as unknown
  expect(document).toEqual({
    type: 'doc',
    content: [
      expect.objectContaining({
        type: 'table',
        content: [
          expect.objectContaining({ type: 'tableRow' }),
          expect.objectContaining({ type: 'tableRow' }),
          expect.objectContaining({
            type: 'tableRow',
            content: [
              expect.objectContaining({
                type: 'tableCell',
                content: [
                  expect.objectContaining({
                    type: 'paragraph',
                    content: [expect.objectContaining({ type: 'text', text: 'row' })],
                  }),
                ],
              }),
              expect.objectContaining({ type: 'tableCell' }),
              expect.objectContaining({ type: 'tableCell' }),
              expect.objectContaining({ type: 'tableCell' }),
              expect.objectContaining({ type: 'tableCell' }),
            ],
          }),
        ],
      }),
    ],
  })

  const newFirstCell = rowsAfter[rowsAfter.length - 1]?.querySelector('th, td')
  expect(newFirstCell).not.toBeNull()
  const selection = window.getSelection()
  expect(selection?.anchorNode).not.toBeNull()
  expect(newFirstCell!.contains(selection!.anchorNode)).toBe(true)
})
