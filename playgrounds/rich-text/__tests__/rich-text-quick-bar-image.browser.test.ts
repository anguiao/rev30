import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createDefaultDocument } from '../src/playground/defaultDocument'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('does not flash the quick bar when a pointer click beside an image returns to the editor', async () => {
  const screen = renderRichTextEditorHarness(createDefaultDocument())
  const editable = await getEditable(screen)
  const heading = editable.element().querySelector('h1')
  const imageLocator = editable.getByRole('img', { name: '一位编辑正在整理文章结构' })
  await expect.element(imageLocator).toBeVisible()
  const image = imageLocator.element()
  expect(heading).not.toBeNull()

  await userEvent.click(heading!)
  await userEvent.keyboard('{End}')
  await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
  await expect.element(screen.getByTestId('rich-text-quick-bar')).toBeVisible()

  image.scrollIntoView({ block: 'center' })
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
  const imageRect = image.getBoundingClientRect()
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
