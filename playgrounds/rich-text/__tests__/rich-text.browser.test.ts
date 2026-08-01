import { expect, test } from 'vitest'
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
  await expect.element(screen.getByTestId('json-result')).toHaveTextContent('图片 payload 已省略')

  await screen.getByTestId('result-tabs').getByText('HTML', { exact: true }).click()
  await expect.element(screen.getByTestId('html-result')).toHaveTextContent('图片 payload 已省略')
})
