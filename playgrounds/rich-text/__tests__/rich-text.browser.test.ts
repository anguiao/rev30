import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { deriveRichTextContent } from '@rev30/rich-text/server'
import App from '../src/App.vue'
import { createDefaultDocument } from '../src/playground/defaultDocument'
import { createPlaygroundPresets } from '../src/playground/presets'

test('creates all presets and renders the complete default document in Chromium', async () => {
  const imageErrors: unknown[] = []
  const { serverPreset } = createPlaygroundPresets({
    onImageError: (error) => imageErrors.push(error),
  })
  const derived = deriveRichTextContent(createDefaultDocument(), serverPreset)

  expect(imageErrors).toHaveLength(0)
  expect(derived.json).toMatchObject({ type: 'doc' })
  expect(derived.html).toContain('<h1>')
  expect(derived.html).toContain('https://example.com/docs')
  expect(derived.html).toContain('language-typescript')
  expect(derived.html).toContain('<img')
  expect(derived.html).toContain('data:image/png;base64,')
  expect(derived.html).toContain('tableWrapper')
  expect(JSON.stringify(derived.json)).toContain('data:image/png;base64,')

  const screen = render(App)
  await expect.element(screen.getByRole('heading', { name: 'Rich Text Playground' })).toBeVisible()
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('已同步')
  await expect
    .element(screen.getByTestId('rendered-result').getByRole('heading', { level: 1 }))
    .toBeVisible()

  await screen.getByTestId('result-tabs').getByText('JSON', { exact: true }).click()
  await expect.element(screen.getByTestId('json-result')).not.toHaveTextContent('iVBORw0KGgo')
  await expect
    .element(screen.getByTestId('json-result'))
    .toHaveTextContent(/图片 payload 已省略，\d+ 字节/)

  await screen.getByTestId('result-tabs').getByText('HTML', { exact: true }).click()
  await expect
    .element(screen.getByTestId('html-result'))
    .toHaveTextContent(/图片 payload 已省略，\d+ 字节/)
})

test('highlights rendered code and switches its theme with the playground mode', async () => {
  const screen = render(App)
  const renderedResult = screen.getByTestId('rendered-result')
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('已同步')

  const code = renderedResult.element().querySelector<HTMLElement>('pre code')
  expect(code).not.toBeNull()
  expect(code!.classList.contains('hljs')).toBe(true)
  const keyword = code!.querySelector<HTMLElement>('.hljs-keyword')
  expect(keyword?.textContent).toBe('const')

  const themeSelect = screen.getByTestId('theme-mode')
  await themeSelect.click()
  await screen.getByText('亮色', { exact: true }).click()
  const lightKeywordColor = getComputedStyle(keyword!).color

  await themeSelect.click()
  await screen.getByText('暗色', { exact: true }).click()
  const darkKeywordColor = getComputedStyle(keyword!).color

  expect(lightKeywordColor).not.toBe(darkKeywordColor)
})

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
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('已同步')
})
