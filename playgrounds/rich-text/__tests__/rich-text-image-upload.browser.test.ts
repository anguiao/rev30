import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  getEditable,
  readEditorModel,
  renderRichTextEditorHarness,
} from './fixtures/renderRichTextEditorHarness'

const FIXTURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAK0lEQVR4nO3OIQEAAAgDMBqRkdRIiHEzMb+qnr0kAQEBAQEBAQEBAYF04AHpJ/FrJbf1awAAAABJRU5ErkJggg=='

function fixtureImageFile(name: string) {
  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  return new File([imageBytes], name, { type: 'image/png' })
}

test('uploads a local image, derives sanitized HTML, and deletes the selected node', async () => {
  const screen = await renderRichTextEditorHarness(undefined, { realTransitions: true })
  const editable = await getEditable(screen)
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })
  await toolbar.getByRole('button', { name: '图片', exact: true }).click()

  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  await expect.element(dialog).toBeVisible()
  const fileInput = dialog.getByTestId('rich-text-image-file-input').element()
  expect(fileInput).toBeInstanceOf(HTMLInputElement)

  await userEvent.upload(fileInput, fixtureImageFile('fixture.png'))
  await expect.element(dialog.getByRole('button', { name: '上传并插入 1 张' })).toBeEnabled()
  await dialog.getByTestId('rich-text-image-confirm').click()

  await expect.element(screen.getByTestId('model-json')).toMatchTextContent('"type":"image"')
  await expect
    .element(screen.getByTestId('model-json'))
    .toMatchTextContent('data:image/png;base64,')
  await expect.element(screen.getByTestId('derivation-status')).toMatchTextContent('ready')

  const renderedResult = screen.getByTestId('rendered-result').element()
  const renderedImage = renderedResult.querySelector<HTMLImageElement>('img')
  expect(renderedImage).not.toBeNull()
  expect(renderedImage!.src).toContain('data:image/png;base64,')
  expect(renderedImage!.getAttribute('onerror')).toBeNull()

  const editorImage = editable.element().querySelector<HTMLImageElement>('img')
  expect(editorImage).not.toBeNull()
  await expect.element(dialog).not.toBeInTheDocument()
  await expect.element(editorImage!).toHaveClass('ProseMirror-selectednode')
  await userEvent.keyboard('{ArrowRight}')
  await expect.element(editorImage!).not.toHaveClass('ProseMirror-selectednode')
  await userEvent.click(editorImage!)
  await expect.element(editorImage!).toHaveClass('ProseMirror-selectednode')
  await userEvent.keyboard('{Backspace}')
  await expect.element(screen.getByTestId('model-json')).not.toMatchTextContent('"type":"image"')
  await userEvent.keyboard('after')
  await expect.element(screen.getByTestId('model-json')).toMatchTextContent('"text":"after"')
})

test('replaces selected text with reordered local images in one undo step', async () => {
  const screen = await renderRichTextEditorHarness(
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'replace this' }] }],
    },
    { realTransitions: true },
  )
  const editable = await getEditable(screen)
  await editable.click()
  await userEvent.keyboard('{ControlOrMeta>}{a}{/ControlOrMeta}')
  await expect.poll(() => window.getSelection()?.toString()).toBe('replace this')

  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })
    .click()
  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  await userEvent.upload(dialog.getByTestId('rich-text-image-file-input').element(), [
    fixtureImageFile('first.png'),
    fixtureImageFile('second.png'),
  ])
  await dialog
    .getByRole('listbox', { name: '已选图片' })
    .getByRole('option', { name: /second.png/ })
    .click()
  await dialog.getByRole('button', { name: '前移图片' }).click()
  expect(readEditorModel(screen).content?.[0]?.content?.[0]?.text).toBe('replace this')

  await expect.element(dialog.getByRole('button', { name: '上传并插入 2 张' })).toBeEnabled()
  await dialog.getByTestId('rich-text-image-confirm').click()
  const imageAlts = () =>
    readEditorModel(screen)
      .content?.filter((node) => node.type === 'image')
      .map((node) => node.attrs?.alt)
  await expect.poll(imageAlts).toEqual(['second.png', 'first.png'])
  expect(JSON.stringify(readEditorModel(screen))).not.toContain('replace this')

  await userEvent.keyboard('{ControlOrMeta>}{z}{/ControlOrMeta}')
  await expect
    .poll(() => readEditorModel(screen).content?.[0]?.content?.[0]?.text)
    .toBe('replace this')
  await expect.poll(imageAlts).toEqual([])
  await userEvent.keyboard('{ControlOrMeta>}{Shift>}{z}{/Shift}{/ControlOrMeta}')
  await expect.poll(imageAlts).toEqual(['second.png', 'first.png'])
})
