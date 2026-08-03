import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

const FIXTURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAK0lEQVR4nO3OIQEAAAgDMBqRkdRIiHEzMb+qnr0kAQEBAQEBAQEBAYF04AHpJ/FrJbf1awAAAABJRU5ErkJggg=='

test('uploads a local image, derives sanitized HTML, and deletes the selected node', async () => {
  const screen = renderRichTextEditorHarness()
  const editable = await getEditable(screen)
  const toolbar = screen.getByRole('toolbar', { name: '格式工具栏', exact: true })
  await toolbar.getByRole('button', { name: '图片', exact: true }).click()

  const dialog = screen.getByRole('dialog', { name: '图片' })
  await expect.element(dialog).toBeVisible()
  const fileInput = dialog.getByTestId('rich-text-image-file-input').element()
  expect(fileInput).toBeInstanceOf(HTMLInputElement)

  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  const imageFile = new File([imageBytes], 'fixture.png', { type: 'image/png' })
  await userEvent.upload(fileInput, imageFile)
  await expect.element(dialog.getByTestId('rich-text-image-upload-action')).toBeEnabled()
  await dialog.getByTestId('rich-text-image-upload-action').click()
  await expect.element(dialog.getByTestId('rich-text-image-confirm')).toBeEnabled()
  await dialog.getByTestId('rich-text-image-confirm').click()

  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"type":"image"')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('data:image/png;base64,')
  await expect.element(screen.getByTestId('derivation-status')).toHaveTextContent('ready')

  const renderedResult = screen.getByTestId('rendered-result').element()
  const renderedImage = renderedResult.querySelector<HTMLImageElement>('img')
  expect(renderedImage).not.toBeNull()
  expect(renderedImage!.src).toContain('data:image/png;base64,')
  expect(renderedImage!.getAttribute('onerror')).toBeNull()

  const editorImage = editable.element().querySelector<HTMLImageElement>('img')
  expect(editorImage).not.toBeNull()
  await expect.element(dialog).not.toBeInTheDocument()
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(true)
  await userEvent.keyboard('{ArrowRight}')
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(false)
  await userEvent.click(editorImage!)
  expect(editorImage!.classList.contains('ProseMirror-selectednode')).toBe(true)
  await userEvent.keyboard('{Backspace}')
  await expect.element(screen.getByTestId('model-json')).not.toHaveTextContent('"type":"image"')
  await userEvent.keyboard('after')
  await expect.element(screen.getByTestId('model-json')).toHaveTextContent('"text":"after"')
})
