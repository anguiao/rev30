import { expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

const editorSelector = '[data-test="editor-container"] .ProseMirror'
const pathButtonSelector =
  '[data-test="rich-text-element-path"] [data-rich-text-toolbar-item^="node:paragraph:"]'

test('runs slash commands with keyboard geometry and native tab navigation', async () => {
  const screen = renderRichTextEditorHarness()
  const editable = await getEditable(screen)

  await userEvent.click(editable)
  await userEvent.type(editable, '/h2')

  const menu = screen.getByTestId('rich-text-slash-menu')
  await expect.element(menu).toBeVisible()
  await expect.element(menu.getByRole('option', { name: '二级标题' })).toBeVisible()

  const containerRect = screen.getByTestId('editor-container').element().getBoundingClientRect()
  const menuRect = menu.element().getBoundingClientRect()
  expect(menuRect.left).toBeGreaterThanOrEqual(containerRect.left)
  expect(menuRect.right).toBeLessThanOrEqual(containerRect.right)
  expect(menuRect.top).toBeGreaterThanOrEqual(containerRect.top)
  expect(menuRect.bottom).toBeLessThanOrEqual(containerRect.bottom)
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')

  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Enter}')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"type":"heading"')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"level":2')
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')

  await screen.getByTestId('reset-short-document').click()
  const nextEditable = await getEditable(screen)
  await expect.poll(() => nextEditable.element().textContent).toBe('')
  await userEvent.click(nextEditable)
  await expect.element(nextEditable).toHaveFocus()
  await userEvent.type(nextEditable, '/')
  await expect.element(screen.getByTestId('rich-text-slash-menu')).toBeVisible()
  await expect.element(nextEditable).toHaveFocus()

  const pathButton = screen.getByRole('button', { name: '选择 p 元素' })
  await commands.pressKey(editorSelector, 'Tab')
  await expect.element(pathButton).toHaveFocus()
  await commands.pressKey(pathButtonSelector, 'Tab')
  await expect.element(screen.getByTestId('after-editor')).toHaveFocus()
})
