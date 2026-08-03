import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('uses native input and DOM selection to show an in-bounds quick bar', async () => {
  const screen = renderRichTextEditorHarness()
  const editable = await getEditable(screen)

  await userEvent.click(editable)
  await userEvent.type(editable, 'hello')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')

  const quickBar = screen.getByTestId('rich-text-quick-bar')
  await expect.element(quickBar).toBeVisible()
  await expect.element(screen.getByTestId('selection-text')).toHaveTextContent('o')

  const containerRect = screen.getByTestId('editor-container').element().getBoundingClientRect()
  const quickBarRect = quickBar.element().getBoundingClientRect()
  expect(quickBarRect.left).toBeGreaterThanOrEqual(containerRect.left)
  expect(quickBarRect.right).toBeLessThanOrEqual(containerRect.right)
  expect(quickBarRect.top).toBeGreaterThanOrEqual(containerRect.top)
  expect(quickBarRect.bottom).toBeLessThanOrEqual(containerRect.bottom)

  await quickBar.getByRole('button', { name: '加粗' }).click()
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"bold"')
  const document = JSON.parse(
    screen.getByTestId('model-json').element().textContent ?? '',
  ) as unknown
  expect(document).toEqual({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: [
          { type: 'text', text: 'hell' },
          { type: 'text', text: 'o', marks: [{ type: 'bold' }] },
        ],
      },
    ],
  })
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')
  await expect.element(screen.getByTestId('selection-text')).toHaveTextContent('o')
})
