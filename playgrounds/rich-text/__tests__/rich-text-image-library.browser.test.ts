import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  getEditable,
  readEditorModel,
  renderRichTextEditorHarness,
} from './fixtures/renderRichTextEditorHarness'

const FIXTURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAK0lEQVR4nO3OIQEAAAgDMBqRkdRIiHEzMb+qnr0kAQEBAQEBAQEBAYF04AHpJ/FrJbf1awAAAABJRU5ErkJggg=='

test('pages and searches the library, then inserts a mixed selection in order', async () => {
  const screen = await renderRichTextEditorHarness(undefined, { realTransitions: true })
  const editable = await getEditable(screen)
  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })
    .click()

  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()

  const library = dialog.getByRole('listbox', { name: '图片库' })
  const firstOption = library.getByRole('option', { name: 'Library Image 01' })
  await expect.element(firstOption).toBeVisible()
  const firstImage = firstOption.element().querySelector('img')!
  await expect.poll(() => firstImage.naturalWidth).toBe(32)
  expect(firstOption.element().getBoundingClientRect().height).toBeGreaterThan(
    firstImage.getBoundingClientRect().height,
  )
  const libraryHeight = dialog.element().getBoundingClientRect().height
  const confirmTop = dialog
    .getByTestId('rich-text-image-confirm')
    .element()
    .getBoundingClientRect().top
  const firstSrc = firstImage.src

  await dialog.getByRole('button', { name: '下一页' }).click()
  const lastOption = library.getByRole('option', { name: 'Library Image 21' })
  await expect.element(lastOption).toBeVisible()
  const lastImage = lastOption.element().querySelector('img')!
  await expect.poll(() => lastImage.naturalWidth).toBe(32)
  expect(dialog.element().getBoundingClientRect().height).toBe(libraryHeight)
  expect(dialog.getByTestId('rich-text-image-confirm').element().getBoundingClientRect().top).toBe(
    confirmTop,
  )
  expect(lastImage.src).not.toBe(firstSrc)
  await lastOption.click()

  const search = dialog.getByRole('textbox', { name: '搜索图片名称' })
  expect(search.element().tagName).toBe('INPUT')
  await search.click()
  await expect.element(search).toHaveFocus()
  await userEvent.keyboard('  lIbRaRy ImAgE 05  ')
  expect((search.element() as HTMLInputElement).value).toBe('  lIbRaRy ImAgE 05  ')
  await userEvent.keyboard('{Enter}')
  const searchedOption = library.getByRole('option', { name: 'Library Image 05' })
  await expect.element(searchedOption).toBeVisible()
  await expect.element(dialog.getByRole('button', { name: '下一页' })).toBeDisabled()
  await searchedOption.click()
  await expect.element(dialog.getByRole('button', { name: '插入 2 张' })).toBeEnabled()

  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  await userEvent.upload(
    dialog.getByTestId('rich-text-image-file-input').element(),
    new File([imageBytes], 'local.png', { type: 'image/png' }),
  )
  expect(readEditorModel(screen).content?.some((node) => node.type === 'image')).toBe(false)
  await expect.element(dialog.getByRole('button', { name: '上传并插入 3 张' })).toBeEnabled()
  await dialog.getByTestId('rich-text-image-confirm').click()

  await expect.element(dialog).not.toBeInTheDocument()
  await expect.element(editable).toHaveFocus()
  const imageAlts = () =>
    readEditorModel(screen)
      .content?.filter((node) => node.type === 'image')
      .map((node) => node.attrs?.alt)
  await expect.poll(imageAlts).toEqual(['Library Image 21', 'Library Image 05', 'local.png'])
  await expect
    .poll(() => screen.getByTestId('rendered-result').element().querySelectorAll('img').length)
    .toBe(3)

  await userEvent.keyboard('{ControlOrMeta>}{z}{/ControlOrMeta}')
  await expect.poll(imageAlts).toEqual([])
  await userEvent.keyboard('{ControlOrMeta>}{Shift>}{z}{/Shift}{/ControlOrMeta}')
  await expect.poll(imageAlts).toEqual(['Library Image 21', 'Library Image 05', 'local.png'])
})
