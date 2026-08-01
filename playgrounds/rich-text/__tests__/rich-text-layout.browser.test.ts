import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import RichTextEditorHarness from './fixtures/RichTextEditorHarness.vue'

const FIXTURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAK0lEQVR4nO3OIQEAAAgDMBqRkdRIiHEzMb+qnr0kAQEBAQEBAQEBAYF04AHpJ/FrJbf1awAAAABJRU5ErkJggg=='

function getHarness() {
  return render(RichTextEditorHarness)
}

async function getEditable(screen: ReturnType<typeof getHarness>) {
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toBeVisible()
  return editable
}

test('exits a trailing code block only after a real click below its DOM rect', async () => {
  const screen = getHarness()
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
  const screen = getHarness()
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

test('uploads a local image, derives sanitized HTML, and deletes the selected node', async () => {
  const screen = getHarness()
  await screen.getByTestId('set-image-document').click()
  const editable = await getEditable(screen)
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })
  await toolbar.getByRole('button', { name: '图片', exact: true }).click()

  const dialog = screen.getByRole('dialog', { name: '图片' })
  await expect.element(dialog).toBeVisible()
  const fileInput = dialog.getByTestId('rich-text-image-file-input').element()
  expect(fileInput).toBeInstanceOf(HTMLInputElement)

  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  const imageFile = new File([imageBytes], 'fixture.png', { type: 'image/png' })
  await userEvent.upload(fileInput, imageFile)
  await expect.element(dialog.getByTestId('rich-text-image-upload-action')).toBeEnabled()
  await dialog.getByTestId('rich-text-image-upload-action').click()
  await expect.element(dialog.getByTestId('rich-text-image-confirm')).toBeEnabled()
  await dialog.getByTestId('rich-text-image-confirm').click()

  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"type":"image"')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('data:image/png;base64,')
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('ready')

  const renderedResult = screen.getByTestId('rendered-result').element()
  const renderedImage = renderedResult.querySelector<HTMLImageElement>('img')
  expect(renderedImage).not.toBeNull()
  expect(renderedImage!.src).toContain('data:image/png;base64,')
  expect(renderedImage!.getAttribute('onerror')).toBeNull()

  const editorImage = editable.element().querySelector<HTMLImageElement>('img')
  expect(editorImage).not.toBeNull()
  await expect.element(dialog).not.toBeInTheDocument()
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(true)
  await userEvent.keyboard('{ArrowRight}')
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(false)
  await userEvent.click(editorImage!)
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(true)
  await userEvent.keyboard('{Backspace}')
  await expect.element(screen.getByTestId('model-json')).not.toHaveTextContent('"type":"image"')
  await userEvent.keyboard('after')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"text":"after"')
})
