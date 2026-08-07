import { afterEach, expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import RichTextEditorHarness from './fixtures/RichTextEditorHarness.vue'

const pastedUrl = 'https://example.com/pasted'
const editorSelector = '[data-test="editor-container"] .ProseMirror'

function getDocumentText(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return ''
  }

  const record = value as Record<string, unknown>

  if (typeof record.text === 'string') {
    return record.text
  }

  return Array.isArray(record.content) ? record.content.map(getDocumentText).join('') : ''
}

function getImageSources(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) {
    return []
  }

  const record = value as Record<string, unknown>
  const source =
    record.type === 'image' &&
    typeof (record.attrs as Record<string, unknown> | undefined)?.src === 'string'
      ? ((record.attrs as Record<string, unknown>).src as string)
      : undefined
  const nestedSources = Array.isArray(record.content) ? record.content.flatMap(getImageSources) : []

  return source === undefined ? nestedSources : [source, ...nestedSources]
}

async function pasteNativeClipboard() {
  if (navigator.userAgent.includes('Macintosh')) {
    await userEvent.keyboard('{Meta>}{v}{/Meta}')
  } else {
    await userEvent.keyboard('{Control>}{v}{/Control}')
  }
}

async function copyNativeClipboard() {
  if (navigator.userAgent.includes('Macintosh')) {
    await userEvent.keyboard('{Meta>}{c}{/Meta}')
  } else {
    await userEvent.keyboard('{Control>}{c}{/Control}')
  }
}

function readModel(element: Element) {
  return JSON.parse(element.textContent ?? '') as unknown
}

afterEach(async () => {
  await commands.setClipboard('')
})

test('adds a link only to a locally selected text range through the native clipboard shortcut', async () => {
  const screen = render(RichTextEditorHarness)
  await screen.getByTestId('set-paste-document').click()
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toHaveTextContent('未选已选')
  await userEvent.click(editable)
  await expect.element(editable).toHaveFocus()
  await expect.poll(() => window.getSelection()?.focusOffset).toBe(4)
  await commands.pressKey(editorSelector, 'Shift+ArrowLeft')
  await expect.poll(() => window.getSelection()?.toString()).toBe('选')
  await commands.pressKey(editorSelector, 'Shift+ArrowLeft')
  await expect.poll(() => window.getSelection()?.toString()).toBe('已选')
  await commands.setClipboard(pastedUrl)
  await pasteNativeClipboard()

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toHaveTextContent('"link"')

  expect(readModel(modelOutput.element())).toEqual({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { textAlign: null },
        content: [
          { type: 'text', text: '未选' },
          {
            type: 'text',
            text: '已选',
            marks: [{ type: 'link', attrs: { href: pastedUrl } }],
          },
        ],
      },
    ],
  })
})

test('replaces an all-selection with pasted URL text through the native clipboard shortcut', async () => {
  const screen = render(RichTextEditorHarness)
  await screen.getByTestId('set-paste-document').click()
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await userEvent.click(editable)
  await userEvent.keyboard('{ControlOrMeta>}{a}{/ControlOrMeta}')
  await commands.setClipboard(pastedUrl)
  await pasteNativeClipboard()

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toHaveTextContent(pastedUrl)
  const model = readModel(modelOutput.element())

  expect(JSON.stringify(model)).not.toContain('未选')
  expect(getDocumentText(model)).toBe(pastedUrl)
})

test('round-trips a Data URL image with native copy and paste shortcuts', async () => {
  const screen = render(RichTextEditorHarness)
  await screen.getByTestId('set-image-selection-document').click()
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  const image = editable.getByRole('img', { name: '路径图片' })
  await expect.element(image).toBeVisible()
  await image.click()
  await copyNativeClipboard()
  await userEvent.keyboard('{ArrowRight}')
  await pasteNativeClipboard()

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toHaveTextContent('data:image/png;base64,')
  const imageSources = getImageSources(readModel(modelOutput.element()))

  expect(imageSources).toHaveLength(2)
  expect(imageSources[0]).toMatch(/^data:image\/png;base64,/)
  expect(imageSources[1]).toBe(imageSources[0])
  await expect.element(screen.getByRole('dialog', { name: '图片' })).not.toBeInTheDocument()
})
