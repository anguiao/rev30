import { afterEach, expect, test } from 'vitest'
import { commands, userEvent } from 'vitest/browser'
import type { RichTextJsonNode } from '@rev30/rich-text/schema'
import {
  getEditable,
  readEditorModel,
  renderRichTextEditorHarness,
} from './fixtures/renderRichTextEditorHarness'

const pastedUrl = 'https://example.com/pasted'
const editorSelector = '[data-test="editor-container"] .ProseMirror'

function getDocumentText(node: RichTextJsonNode): string {
  return node.text ?? node.content?.map(getDocumentText).join('') ?? ''
}

function getImageSources(node: RichTextJsonNode): string[] {
  const source: unknown = node.type === 'image' ? node.attrs?.src : undefined
  const nestedSources = node.content?.flatMap(getImageSources) ?? []

  return typeof source === 'string' ? [source, ...nestedSources] : nestedSources
}

afterEach(async () => {
  await commands.setClipboard('')
})

test('adds a link only to a locally selected text range through the native clipboard shortcut', async () => {
  const screen = await renderRichTextEditorHarness()
  await screen.getByTestId('set-paste-document').click()
  const editable = await getEditable(screen)
  await expect.element(editable).toMatchTextContent('未选已选')
  await userEvent.click(editable)
  await expect.element(editable).toHaveFocus()
  await expect.poll(() => window.getSelection()?.focusOffset).toBe(4)
  await commands.pressKey(editorSelector, 'Shift+ArrowLeft')
  await expect.poll(() => window.getSelection()?.toString()).toBe('选')
  await commands.pressKey(editorSelector, 'Shift+ArrowLeft')
  await expect.poll(() => window.getSelection()?.toString()).toBe('已选')
  await commands.setClipboard(pastedUrl)
  await userEvent.keyboard('{ControlOrMeta>}{v}{/ControlOrMeta}')

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toMatchTextContent('"link"')

  expect(readEditorModel(screen)).toEqual({
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
  const screen = await renderRichTextEditorHarness()
  await screen.getByTestId('set-paste-document').click()
  const editable = await getEditable(screen)
  await userEvent.click(editable)
  await userEvent.keyboard('{ControlOrMeta>}{a}{/ControlOrMeta}')
  await commands.setClipboard(pastedUrl)
  await userEvent.keyboard('{ControlOrMeta>}{v}{/ControlOrMeta}')

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toMatchTextContent(pastedUrl)
  const model = readEditorModel(screen)

  expect(JSON.stringify(model)).not.toContain('未选')
  expect(getDocumentText(model)).toBe(pastedUrl)
})

test('round-trips a Data URL image with native copy and paste shortcuts', async () => {
  const screen = await renderRichTextEditorHarness()
  await screen.getByTestId('set-image-selection-document').click()
  const editable = await getEditable(screen)
  const image = editable.getByRole('img', { name: '路径图片' })
  await expect.element(image).toBeVisible()
  await image.click()
  await userEvent.keyboard('{ControlOrMeta>}{c}{/ControlOrMeta}')
  await userEvent.keyboard('{ArrowRight}')
  await userEvent.keyboard('{ControlOrMeta>}{v}{/ControlOrMeta}')

  const modelOutput = screen.getByTestId('model-json')
  await expect.element(modelOutput).toMatchTextContent('data:image/png;base64,')
  await expect.poll(() => getImageSources(readEditorModel(screen))).toHaveLength(2)
  const imageSources = getImageSources(readEditorModel(screen))

  expect(imageSources).toHaveLength(2)
  expect(imageSources[0]).toMatch(/^data:image\/png;base64,/)
  expect(imageSources[1]).toBe(imageSources[0])
  await expect.element(screen.getByRole('dialog', { name: '插入图片' })).not.toBeInTheDocument()
})
