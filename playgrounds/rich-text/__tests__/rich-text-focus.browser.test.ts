import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('keeps focus inside toolbar, popover, and quick bar without overall blur', async () => {
  const screen = renderRichTextEditorHarness()
  const editable = await getEditable(screen)
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })

  await userEvent.click(editable)
  await userEvent.keyboard('{Alt>}{F10}{/Alt}')
  const toolbarItems = Array.from(
    toolbar.element().querySelectorAll<HTMLElement>('[data-rich-text-toolbar-item]'),
  )
  const enabledToolbarItems = toolbarItems.filter(
    (item) => !item.matches(':disabled') && item.getAttribute('aria-disabled') !== 'true',
  )
  const enabledToolbarKeys = enabledToolbarItems.map((item) => item.dataset.richTextToolbarItem)
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent(/\S+/)
  const focusedToolbarKey = screen.getByTestId('active-element').element().textContent?.trim()

  expect(focusedToolbarKey).toBeTruthy()
  expect(enabledToolbarKeys).toContain(focusedToolbarKey)
  await userEvent.keyboard('{ArrowRight}')
  const focusedToolbarIndex = enabledToolbarKeys.indexOf(focusedToolbarKey)
  const nextToolbarKey = enabledToolbarKeys[(focusedToolbarIndex + 1) % enabledToolbarKeys.length]
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent(nextToolbarKey ?? '')
  await expect.element(screen.getByTestId('blur-count')).toHaveTextContent('0')
  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')

  await userEvent.type(editable, 'x')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  const linkButton = toolbar.getByRole('button', { name: '链接' })
  await linkButton.click()
  const popover = screen.getByRole('dialog', { name: '编辑链接' })
  const linkInput = screen.getByTestId('rich-text-link-url').getByRole('textbox')
  await expect.element(popover).toBeVisible()
  await linkInput.click()
  await expect.element(linkInput).toHaveFocus()
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('input')
  await expect.element(screen.getByTestId('blur-count')).toHaveTextContent('0')
  await userEvent.keyboard('{Escape}')

  await userEvent.click(editable)
  await userEvent.type(editable, 'y')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  const quickBar = screen.getByTestId('rich-text-quick-bar')
  await expect.element(quickBar).toBeVisible()
  await quickBar.getByRole('button', { name: '加粗' }).click()
  await expect.element(screen.getByTestId('blur-count')).toHaveTextContent('0')

  await screen.getByTestId('after-editor').click()
  await expect.element(screen.getByTestId('blur-count')).toHaveTextContent('1')
})
