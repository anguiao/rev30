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
  expect(derived.html).toContain('https://github.com/anguiao/rev30')
  expect(derived.html).toContain('language-typescript')
  expect(derived.html).toContain('<img')
  expect(derived.html).toContain('data:image/png;base64,')
  expect(derived.html).toContain('tableWrapper')
  expect(derived.html).not.toContain('all preset')
  expect(derived.html).not.toContain('deriveRichTextContent')
  expect(JSON.stringify(derived.json)).toContain('data:image/png;base64,')

  const screen = render(App)
  await expect.element(screen.getByRole('heading', { name: 'Rich Text Playground' })).toBeVisible()
  const themeMode = screen.getByTestId('theme-mode').element()
  expect(themeMode.getAttribute('aria-label')).toBe('主题')
  expect(themeMode.getBoundingClientRect().width).toBe(128)
  await expect.element(screen.getByText('主题', { exact: true })).not.toBeInTheDocument()
  await expect.element(screen.getByTestId('derivation-status')).not.toBeInTheDocument()
  await expect
    .element(screen.getByText('使用真实 client all preset。', { exact: true }))
    .not.toBeInTheDocument()
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

test('keeps the editor and preview within the viewport with internal scrolling', async () => {
  const screen = render(App)
  const editorPanel = screen.getByRole('region', { name: '编辑' })
  const resultPanel = screen.getByRole('region', { name: '派生结果' })
  const renderedResult = screen.getByTestId('rendered-result')

  await expect.element(editorPanel).toBeVisible()
  await expect.element(resultPanel).toBeVisible()
  await expect.element(renderedResult).toBeVisible()

  for (const panel of [editorPanel.element(), resultPanel.element()]) {
    const rect = panel.getBoundingClientRect()
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight)
  }

  const editorRoot = screen.getByTestId('playground-editor').element()
  const editorScrollContainer =
    editorRoot.querySelector('.ProseMirror')?.parentElement?.parentElement
  expect(editorScrollContainer).not.toBeNull()
  expect(getComputedStyle(editorScrollContainer!).overflowY).toBe('auto')
  expect(editorScrollContainer!.scrollHeight).toBeGreaterThan(editorScrollContainer!.clientHeight)

  const previewScrollContainer = renderedResult.element().closest<HTMLElement>('.n-tab-pane')
  expect(previewScrollContainer).not.toBeNull()
  expect(getComputedStyle(previewScrollContainer!).overflowY).toBe('auto')
  expect(previewScrollContainer!.scrollHeight).toBeGreaterThan(previewScrollContainer!.clientHeight)
})

test('highlights rendered code and switches its theme with the playground mode', async () => {
  const screen = render(App)
  const renderedResult = screen.getByTestId('rendered-result')
  await expect.element(renderedResult).toBeVisible()

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
