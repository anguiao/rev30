import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('keeps focus inside toolbar, popover, and quick bar without overall blur', async () => {
  const screen = await renderRichTextEditorHarness()
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
  await expect
    .poll(() => enabledToolbarItems.findIndex((item) => item === document.activeElement))
    .toBeGreaterThanOrEqual(0)
  const focusedToolbarIndex = enabledToolbarItems.findIndex(
    (item) => item === document.activeElement,
  )
  const nextToolbarItem =
    enabledToolbarItems[(focusedToolbarIndex + 1) % enabledToolbarItems.length]!

  await userEvent.keyboard('{ArrowRight}')
  await expect.element(nextToolbarItem).toHaveFocus()
  await expect.element(screen.getByTestId('blur-count')).toMatchTextContent('0')
  await userEvent.keyboard('{Escape}')
  await expect.element(screen.getByTestId('active-element')).toMatchTextContent('editor')

  await userEvent.type(editable, 'x')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  const linkButton = toolbar.getByRole('button', { name: '链接' })
  await linkButton.click()
  const popover = screen.getByRole('dialog', { name: '编辑链接' })
  const linkInput = screen.getByTestId('rich-text-link-url').getByRole('textbox')
  await expect.element(popover).toBeVisible()
  await linkInput.click()
  await expect.element(linkInput).toHaveFocus()
  await expect.element(screen.getByTestId('active-element')).toMatchTextContent('input')
  await expect.element(screen.getByTestId('blur-count')).toMatchTextContent('0')
  await userEvent.keyboard('{Escape}')

  await userEvent.click(editable)
  await userEvent.type(editable, 'y')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  const quickBar = screen.getByTestId('rich-text-quick-bar')
  await expect.element(quickBar).toBeVisible()
  await quickBar.getByRole('button', { name: '加粗' }).click()
  await expect.element(screen.getByTestId('blur-count')).toMatchTextContent('0')

  await screen.getByTestId('after-editor').click()
  await expect.element(screen.getByTestId('blur-count')).toMatchTextContent('1')
})
