import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import RichTextEditorHarness from './fixtures/RichTextEditorHarness.vue'

function getHarness() {
  return render(RichTextEditorHarness)
}

async function getEditable(screen: ReturnType<typeof getHarness>) {
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toBeVisible()
  return editable
}

test('uses native input and DOM selection to show an in-bounds quick bar', async () => {
  const screen = getHarness()
  await screen.getByTestId('reset-short-document').click()
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

test('does not flash the quick bar when a pointer click beside an image returns to the editor', async () => {
  const screen = getHarness()
  const editable = await getEditable(screen)
  const heading = editable.element().querySelector('h1')
  const image = editable.element().querySelector('img')
  expect(heading).not.toBeNull()
  expect(image).not.toBeNull()

  await userEvent.click(heading!)
  await userEvent.keyboard('{End}')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  await expect.element(screen.getByTestId('rich-text-quick-bar')).toBeVisible()

  image!.scrollIntoView({ block: 'center' })
  await screen.getByTestId('before-editor').click()
  await expect.element(screen.getByTestId('rich-text-quick-bar')).not.toBeInTheDocument()

  let quickBarAppeared = false
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (
          node instanceof HTMLElement &&
          (node.matches('[data-test="rich-text-quick-bar"]') ||
            node.querySelector('[data-test="rich-text-quick-bar"]'))
        ) {
          quickBarAppeared = true
        }
      }
    }
  })
  observer.observe(screen.getByTestId('editor-container').element(), {
    childList: true,
    subtree: true,
  })

  const editorRect = editable.element().getBoundingClientRect()
  const imageRect = image!.getBoundingClientRect()
  await userEvent.click(editable, {
    delay: 100,
    position: {
      x: imageRect.right - editorRect.left + 16,
      y: imageRect.top - editorRect.top + imageRect.height / 2,
    },
  })
  await new Promise((resolve) => window.setTimeout(resolve, 50))
  observer.disconnect()

  expect(window.getSelection()?.toString()).toBe('')
  await expect.element(screen.getByTestId('rich-text-quick-bar')).not.toBeInTheDocument()
  expect(quickBarAppeared).toBe(false)
})

test('runs slash commands with keyboard geometry and native tab navigation', async () => {
  const screen = getHarness()
  await screen.getByTestId('reset-short-document').click()
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
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('after-editor')
})

test('keeps focus inside toolbar, popover, and quick bar without overall blur', async () => {
  const screen = getHarness()
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
