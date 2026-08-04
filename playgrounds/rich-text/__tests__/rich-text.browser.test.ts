import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { deriveRichTextContent } from '@rev30/rich-text/server'
import App from '../src/App.vue'
import { createDefaultDocument } from '../src/playground/defaultDocument'
import { createPlaygroundPresets } from '../src/playground/presets'
import RichTextContentStyleHarness from './fixtures/RichTextContentStyleHarness.vue'

function getRequiredElement<T extends Element>(container: ParentNode, selector: string) {
  const element = container.querySelector<T>(selector)

  if (element === null) {
    throw new Error(`Expected ${selector} to exist`)
  }

  return element
}

function getFirstElement(container: Element) {
  const element = container.firstElementChild

  if (element === null) {
    throw new Error('Expected a first child element')
  }

  return element
}

function getLastElement(container: Element) {
  const element = container.lastElementChild

  if (element === null) {
    throw new Error('Expected a last child element')
  }

  return element
}

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

test('applies matching editor and readonly content typography across supported sizes', async () => {
  const content = createDefaultDocument()
  const { serverPreset } = createPlaygroundPresets({ onImageError() {} })
  const derived = deriveRichTextContent(content, serverPreset)
  const screen = render(RichTextContentStyleHarness, {
    props: { document: content, html: derived.html, dark: false },
  })

  await expect.element(screen.getByTestId('style-editor')).toBeVisible()
  await expect.element(screen.getByTestId('style-readonly-sm')).toBeVisible()

  const editorRoot = screen.getByTestId('style-editor').element()
  const editor = getRequiredElement<HTMLElement>(editorRoot, '.ProseMirror')
  const readonlySm = screen.getByTestId('style-readonly-sm').element()
  const readonlyBase = screen.getByTestId('style-readonly-base').element()
  const readonlyLg = screen.getByTestId('style-readonly-lg').element()

  for (const [selector, properties] of [
    ['h1', ['fontSize', 'lineHeight', 'marginTop', 'marginBottom']],
    ['p', ['fontSize', 'lineHeight', 'marginTop', 'marginBottom']],
    ['li > p', ['marginTop', 'marginBottom']],
    ['pre', ['fontSize', 'lineHeight', 'marginTop', 'marginBottom', 'paddingLeft']],
    ['.tableWrapper > table', ['fontSize', 'lineHeight']],
  ] as const) {
    const editorElement = getRequiredElement<HTMLElement>(editor, selector)
    const readonlyElement = getRequiredElement<HTMLElement>(readonlySm, selector)

    for (const property of properties) {
      expect(getComputedStyle(editorElement)[property]).toBe(
        getComputedStyle(readonlyElement)[property],
      )
    }
  }

  expect(getComputedStyle(readonlySm).fontSize).toBe('14px')
  expect(getComputedStyle(readonlySm).lineHeight).toBe('24px')
  expect(getComputedStyle(readonlyBase).fontSize).toBe('16px')
  expect(getComputedStyle(readonlyBase).lineHeight).toBe('28px')
  expect(getComputedStyle(readonlyLg).fontSize).toBe('18px')
  expect(getComputedStyle(readonlyLg).lineHeight).toBe('32px')

  const sizeExpectations = [
    {
      container: readonlySm,
      headingSize: '30px',
      listPadding: '22px',
      tableSize: '12px',
      tableMargin: '24px',
      cellBlockPadding: 8,
      cellInlinePadding: 10,
    },
    {
      container: readonlyBase,
      headingSize: '36px',
      listPadding: '26px',
      tableSize: '14px',
      tableMargin: '28px',
      cellBlockPadding: 9.3333,
      cellInlinePadding: 11.6667,
    },
    {
      container: readonlyLg,
      headingSize: '48px',
      listPadding: '28px',
      tableSize: '16px',
      tableMargin: '32px',
      cellBlockPadding: 10.6667,
      cellInlinePadding: 13.3333,
    },
  ]

  for (const {
    container,
    headingSize,
    listPadding,
    tableSize,
    tableMargin,
    cellBlockPadding,
    cellInlinePadding,
  } of sizeExpectations) {
    const tableWrapper = getRequiredElement<HTMLElement>(container, '.tableWrapper')
    const table = getRequiredElement<HTMLTableElement>(tableWrapper, 'table')
    const header = getRequiredElement<HTMLElement>(table, 'th')
    const image = getRequiredElement<HTMLImageElement>(container, 'img')
    const quote = getRequiredElement<HTMLElement>(container, 'blockquote')

    expect(getComputedStyle(getRequiredElement<HTMLElement>(container, 'h1')).fontSize).toBe(
      headingSize,
    )
    expect(
      getComputedStyle(getRequiredElement<HTMLElement>(container, 'ul')).paddingInlineStart,
    ).toBe(listPadding)
    expect(getComputedStyle(table).fontSize).toBe(tableSize)
    expect(getComputedStyle(header).minWidth).toBe('96px')
    expect(getComputedStyle(tableWrapper).marginTop).toBe(tableMargin)
    expect(parseFloat(getComputedStyle(header).paddingBlockStart)).toBeCloseTo(cellBlockPadding)
    expect(parseFloat(getComputedStyle(header).paddingInlineStart)).toBeCloseTo(cellInlinePadding)
    expect(getComputedStyle(tableWrapper).overflowX).toBe('auto')
    expect(getComputedStyle(image).display).toBe('block')
    expect(getComputedStyle(image).maxWidth).toBe('100%')
    expect(getComputedStyle(quote).marginInlineStart).toBe('0px')
    expect(getComputedStyle(quote).marginInlineEnd).toBe('0px')
  }

  const editorH2 = getRequiredElement<HTMLElement>(editor, 'h2')
  const readonlyH2 = getRequiredElement<HTMLElement>(readonlySm, 'h2')
  const editorList = editorH2.nextElementSibling
  const readonlyList = readonlyH2.nextElementSibling

  expect(editorList?.tagName).toBe('UL')
  expect(readonlyList?.tagName).toBe('UL')
  expect(getComputedStyle(editorList as HTMLElement).marginTop).toBe('0px')
  expect(getComputedStyle(readonlyList as HTMLElement).marginTop).toBe('0px')
  expect(getComputedStyle(getFirstElement(editor)).marginTop).toBe('0px')
  expect(getComputedStyle(getFirstElement(readonlySm)).marginTop).toBe('0px')
  expect(getComputedStyle(getLastElement(editor)).marginBottom).toBe('0px')
  expect(getComputedStyle(getLastElement(readonlySm)).marginBottom).toBe('0px')

  const editorCode = getRequiredElement<HTMLElement>(editor, 'pre > code')
  const readonlyCode = getRequiredElement<HTMLElement>(readonlySm, 'pre > code')

  expect(getComputedStyle(editorCode).fontSize).toBe(
    getComputedStyle(editorCode.parentElement!).fontSize,
  )
  expect(getComputedStyle(readonlyCode).fontSize).toBe('12px')
  expect(getComputedStyle(readonlyCode).fontWeight).toBe('400')
  expect(getComputedStyle(readonlyCode).color).toBe(
    getComputedStyle(readonlyCode.parentElement!).color,
  )
})

test('preserves ordered list markers and collapses adjacent flow spacing', async () => {
  const markerTypes = ['a', 'A', 'i', 'I'] as const
  const expectedListStyles = ['lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman']
  const document: RichTextDocument = {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: [{ type: 'text', text: 'Heading two' }],
      },
      {
        type: 'heading',
        attrs: { level: 3, textAlign: null },
        content: [{ type: 'text', text: 'Heading three' }],
      },
      { type: 'horizontalRule' },
      { type: 'horizontalRule' },
      ...markerTypes.map((type) => ({
        type: 'orderedList',
        attrs: { start: 1, type },
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                attrs: { textAlign: null },
                content: [{ type: 'text', text: `${type} item` }],
              },
            ],
          },
        ],
      })),
    ],
  }
  const { serverPreset } = createPlaygroundPresets({ onImageError() {} })
  const derived = deriveRichTextContent(document, serverPreset)
  const screen = render(RichTextContentStyleHarness, {
    props: { document, html: derived.html, dark: false },
  })

  await expect.element(screen.getByTestId('style-editor')).toBeVisible()

  const editor = getRequiredElement<HTMLElement>(
    screen.getByTestId('style-editor').element(),
    '.ProseMirror',
  )
  const containers = [
    editor,
    screen.getByTestId('style-readonly-sm').element(),
    screen.getByTestId('style-readonly-base').element(),
    screen.getByTestId('style-readonly-lg').element(),
  ]

  for (const container of containers) {
    const lists = Array.from(container.querySelectorAll<HTMLOListElement>('ol'))

    expect(lists.map((list) => list.getAttribute('type'))).toEqual(markerTypes)
    expect(lists.map((list) => getComputedStyle(list).listStyleType)).toEqual(expectedListStyles)

    for (const selector of ['h2 + h3', 'h3 + hr', 'hr + hr', 'hr + ol']) {
      expect(getComputedStyle(getRequiredElement<HTMLElement>(container, selector)).marginTop).toBe(
        '0px',
      )
    }
  }
})

test('switches content defaults with the root theme and honors public color variables', async () => {
  const content = createDefaultDocument()
  const { serverPreset } = createPlaygroundPresets({ onImageError() {} })
  const derived = deriveRichTextContent(content, serverPreset)
  const screen = render(RichTextContentStyleHarness, {
    props: { document: content, html: derived.html, dark: false },
  })
  const readonly = screen.getByTestId('style-readonly-sm').element()
  const paragraph = getRequiredElement<HTMLElement>(readonly, 'p')
  const heading = getRequiredElement<HTMLElement>(readonly, 'h1')
  const link = getRequiredElement<HTMLElement>(readonly, 'a')
  const quote = getRequiredElement<HTMLElement>(readonly, 'blockquote')
  const code = getRequiredElement<HTMLElement>(readonly, 'pre')
  const cell = getRequiredElement<HTMLElement>(readonly, 'th')

  const lightColors = [
    getComputedStyle(paragraph).color,
    getComputedStyle(heading).color,
    getComputedStyle(link).color,
    getComputedStyle(quote).color,
    getComputedStyle(code).color,
    getComputedStyle(cell).borderTopColor,
    getComputedStyle(cell).backgroundColor,
  ]

  await screen.rerender({ dark: true })

  const darkColors = [
    getComputedStyle(paragraph).color,
    getComputedStyle(heading).color,
    getComputedStyle(link).color,
    getComputedStyle(quote).color,
    getComputedStyle(code).color,
    getComputedStyle(cell).borderTopColor,
    getComputedStyle(cell).backgroundColor,
  ]

  for (const [index, color] of darkColors.entries()) {
    expect(color).not.toBe(lightColors[index])
  }
  expect(getComputedStyle(code).backgroundColor).toBe('rgb(9, 9, 11)')

  await screen.rerender({ dark: false })
  readonly.style.setProperty('--rich-text-content-body-color', 'rgb(1, 2, 3)')
  readonly.style.setProperty('--rich-text-content-link-color', 'rgb(4, 5, 6)')
  readonly.style.setProperty('--rich-text-content-code-color', 'rgb(7, 8, 9)')
  readonly.style.setProperty('--rich-text-content-table-border-color', 'rgb(10, 11, 12)')
  readonly.style.setProperty('--rich-text-content-table-header-background', 'rgb(13, 14, 15)')

  expect(getComputedStyle(paragraph).color).toBe('rgb(1, 2, 3)')
  expect(getComputedStyle(link).color).toBe('rgb(4, 5, 6)')
  expect(getComputedStyle(code).color).toBe('rgb(7, 8, 9)')
  expect(getComputedStyle(cell).borderTopColor).toBe('rgb(10, 11, 12)')
  expect(getComputedStyle(cell).backgroundColor).toBe('rgb(13, 14, 15)')
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

  expect(lightKeywordColor).toBe('rgb(215, 58, 73)')
  expect(darkKeywordColor).toBe('rgb(255, 123, 114)')
})
