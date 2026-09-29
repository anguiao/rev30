import { expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import App from '../src/App.vue'
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
  await dialog.getByRole('button', { name: '图片库', exact: true }).click()

  const library = dialog.getByRole('listbox', { name: '图片库' })
  const firstOption = library.getByRole('option', { name: 'Library Image 01' })
  await expect.element(firstOption).toBeVisible()
  const firstImage = firstOption.element().querySelector('img')!
  await expect.poll(() => firstImage.naturalWidth).toBe(32)
  const firstSrc = firstImage.src

  await dialog.getByRole('button', { name: '下一页' }).click()
  const lastOption = library.getByRole('option', { name: 'Library Image 21' })
  await expect.element(lastOption).toBeVisible()
  const lastImage = lastOption.element().querySelector('img')!
  await expect.poll(() => lastImage.naturalWidth).toBe(32)
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
  await expect
    .element(dialog.getByTestId('rich-text-image-count'))
    .toHaveTextContent('已选择 2 / 20 张')

  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  await userEvent.upload(
    dialog.getByTestId('rich-text-image-file-input').element(),
    new File([imageBytes], 'local.png', { type: 'image/png' }),
  )
  await expect
    .element(dialog.getByTestId('rich-text-image-count'))
    .toHaveTextContent('已选择 3 / 20 张')
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

test('returns editor focus when Escape cancels the image dialog', async () => {
  const screen = await renderRichTextEditorHarness(undefined, { realTransitions: true })
  const editable = await getEditable(screen)
  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })
    .click()

  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  await expect.element(dialog.getByRole('button', { name: '点击选择或拖入图片' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await expect.element(dialog).not.toBeInTheDocument()
  await expect.element(editable).toHaveFocus()
})

test('keeps library selection and the insert action accessible in a narrow viewport', async ({
  onTestFinished,
}) => {
  await page.viewport(390, 640)
  onTestFinished(() => page.viewport(1280, 900))
  const screen = await renderRichTextEditorHarness(undefined, { realTransitions: true })
  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })
    .click()

  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  await dialog.getByRole('button', { name: '图片库', exact: true }).click()
  const library = dialog.getByRole('listbox', { name: '图片库' })
  const firstCard = library.getByRole('option', { name: 'Library Image 01' }).element()
  await expect.element(firstCard).toBeVisible()
  expect(firstCard.getBoundingClientRect().height).toBeGreaterThan(
    firstCard.querySelector('img')!.getBoundingClientRect().height,
  )
  await library.getByRole('option', { name: 'Library Image 01' }).click()
  await library.getByRole('option', { name: 'Library Image 02' }).click()

  const selected = dialog.getByRole('listbox', { name: '已选图片' })
  const insert = dialog.getByRole('button', { name: '插入 2 张' })
  await expect.element(library).toBeVisible()
  await expect.element(selected).toBeVisible()
  await expect.element(insert).toBeEnabled()
  expect(window.innerWidth).toBeLessThanOrEqual(390)
  for (const element of [
    dialog.element(),
    library.element(),
    selected.element(),
    insert.element(),
  ]) {
    const bounds = element.getBoundingClientRect()
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(window.innerWidth)
    expect(bounds.top).toBeLessThan(window.innerHeight)
    expect(bounds.bottom).toBeGreaterThan(0)
  }
  expect(insert.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight)
  await selected.getByRole('option', { name: /Library Image 01/ }).click()
  await insert.click()
  await expect
    .poll(() => readEditorModel(screen).content?.filter((node) => node.type === 'image').length)
    .toBe(2)
})

test('uses the dark theme in the image dialog and can insert from the library', async () => {
  const screen = await render(App, { global: { stubs: { transition: false } } })
  const themeSelect = screen.getByTestId('theme-mode')
  const imageButton = screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })

  await themeSelect.click()
  await screen.getByText('亮色', { exact: true }).click()
  await imageButton.click()
  const lightDialog = screen.getByRole('dialog', { name: '插入图片' })
  const lightBackground = getComputedStyle(lightDialog.element()).backgroundColor
  await lightDialog.getByRole('button', { name: '取消' }).click()

  await themeSelect.click()
  await screen.getByText('暗色', { exact: true }).click()
  await expect.poll(() => document.documentElement.classList.contains('dark')).toBe(true)
  await imageButton.click()
  const darkDialog = screen.getByRole('dialog', { name: '插入图片' })
  const darkBackground = getComputedStyle(darkDialog.element()).backgroundColor
  expect(darkBackground).not.toBe(lightBackground)

  const imagesBefore = screen
    .getByTestId('rendered-result')
    .element()
    .querySelectorAll('img').length
  await darkDialog.getByRole('button', { name: '图片库', exact: true }).click()
  await darkDialog
    .getByRole('listbox', { name: '图片库' })
    .getByRole('option', { name: 'Library Image 01' })
    .click()
  await expect.element(darkDialog.getByRole('button', { name: '插入 1 张' })).toBeEnabled()
  await darkDialog.getByRole('button', { name: '插入 1 张' }).click()
  await expect
    .poll(() => screen.getByTestId('rendered-result').element().querySelectorAll('img').length)
    .toBe(imagesBefore + 1)
})
