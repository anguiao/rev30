import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

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
  await userEvent.click(nextEditable)
  await userEvent.type(nextEditable, '/')
  await expect.element(screen.getByTestId('rich-text-slash-menu')).toBeVisible()
  await userEvent.keyboard('{Tab}')
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('node:paragraph')
  await userEvent.keyboard('{Tab}')
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('after-editor')
})
