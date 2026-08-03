import { expect, test } from 'vitest'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('reflects image NodeSelection through the img path item', async () => {
  const screen = renderRichTextEditorHarness()
  await screen.getByTestId('set-image-selection-document').click()
  const editable = await getEditable(screen)
  const imageLocator = editable.getByRole('img', { name: '路径图片' })
  await expect.element(imageLocator).toBeVisible()
  const image = imageLocator.element()

  await imageLocator.click()
  const path = screen.getByTestId('rich-text-element-path')
  await expect.element(path.getByRole('button', { name: '选择 img 元素' })).toBeVisible()
  expect(image.classList.contains('ProseMirror-selectednode')).toBe(true)

  await path.getByRole('button', { name: '选择 img 元素' }).click()
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')
  expect(image.classList.contains('ProseMirror-selectednode')).toBe(true)
})
