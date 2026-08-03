import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import App from '../src/App.vue'

test('keeps image errors through normal edits until restoring the example', async () => {
  const screen = render(App)
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })
  await toolbar.getByRole('button', { name: '图片', exact: true }).click()

  const dialog = screen.getByRole('dialog', { name: '图片' })
  await expect.element(dialog).toBeVisible()
  const fileInput = dialog.getByTestId('rich-text-image-file-input').element()
  await userEvent.upload(fileInput, new File(['not an image'], 'notes.txt', { type: 'text/plain' }))
  await expect.element(dialog.getByTestId('rich-text-image-upload-action')).toBeEnabled()
  await dialog.getByTestId('rich-text-image-upload-action').click()
  await expect
    .element(screen.getByTestId('image-error'))
    .toHaveTextContent('仅支持 JPEG、PNG 和 WebP 图片')

  await dialog.getByTestId('rich-text-image-cancel').click()
  await expect.element(dialog).not.toBeInTheDocument()

  const editable = screen.getByRole('textbox')
  await userEvent.click(editable)
  await userEvent.type(editable, 'x')
  await expect
    .element(screen.getByTestId('image-error'))
    .toHaveTextContent('仅支持 JPEG、PNG 和 WebP 图片')

  await screen.getByTestId('restore-example').click()
  await expect.element(screen.getByTestId('image-error')).not.toBeInTheDocument()
  await expect.element(screen.getByTestId('rendered-result')).toBeVisible()
})
