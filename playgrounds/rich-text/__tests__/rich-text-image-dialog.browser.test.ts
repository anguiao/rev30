import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { RichTextEditor } from '@rev30/rich-text/vue'
import {
  createAllRichTextEditorPreset,
  type AllRichTextEditorPresetOptions,
} from '@rev30/rich-text/vue/presets/all'
import App from '../src/App.vue'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

const FIXTURE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAYCAYAAACbU/80AAAAK0lEQVR4nO3OIQEAAAgDMBqRkdRIiHEzMb+qnr0kAQEBAQEBAQEBAYF04AHpJ/FrJbf1awAAAABJRU5ErkJggg=='

test('keeps the dialog and sidebar stable across selection, library and error states', async () => {
  type LibraryResult = Awaited<
    ReturnType<NonNullable<AllRichTextEditorPresetOptions['image']['listLibraryImages']>>
  >
  let rejectLibrary!: (error: Error) => void
  const pendingLibrary = new Promise<LibraryResult>((_resolve, reject) => {
    rejectLibrary = reject
  })
  const listLibraryImages = vi
    .fn()
    .mockReturnValueOnce(pendingLibrary)
    .mockResolvedValueOnce({ list: [], total: 0, page: 1, pageSize: 20 })
    .mockResolvedValueOnce({
      list: [{ src: `data:image/png;base64,${FIXTURE_PNG}`, name: 'library.png' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
  const screen = await render(RichTextEditor, {
    global: { stubs: { transition: false } },
    props: {
      modelValue: { type: 'doc', content: [{ type: 'paragraph' }] },
      preset: createAllRichTextEditorPreset({
        image: { upload: vi.fn(), listLibraryImages, onError: vi.fn() },
      }),
    },
  })
  await screen
    .getByRole('toolbar', { name: '格式工具栏', exact: true })
    .getByRole('button', { name: '图片', exact: true })
    .click()

  const dialog = screen.getByRole('dialog', { name: '插入图片' })
  const candidates = dialog.getByRole('listbox', { name: '已选图片' })
  await expect.element(candidates).toBeVisible()
  const layout = () => ({
    dialog: dialog.element().getBoundingClientRect().toJSON(),
    candidates: candidates.element().getBoundingClientRect().toJSON(),
    source: dialog
      .getByRole('button', { name: '添加图片', exact: true })
      .element()
      .getBoundingClientRect()
      .toJSON(),
    confirmTop: dialog.getByTestId('rich-text-image-confirm').element().getBoundingClientRect().top,
  })
  const initialLayout = layout()
  const uploadArea = dialog.getByRole('button', { name: '点击选择或拖入图片' }).element()
  expect(uploadArea.getBoundingClientRect().height).toBeLessThan(
    dialog.getByTestId('rich-text-image-drop-zone').element().getBoundingClientRect().height / 2,
  )

  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
  await expect.element(dialog.getByText('正在加载图片', { exact: true })).toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '返回', exact: true }).click()
  await expect.element(dialog.getByRole('button', { name: '点击选择或拖入图片' })).toHaveFocus()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
  rejectLibrary(new Error('offline'))
  await expect.element(dialog.getByText('图片库加载失败', { exact: true })).toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '返回', exact: true }).click()
  await expect.element(dialog.getByRole('button', { name: '点击选择或拖入图片' })).toBeVisible()
  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect.element(dialog.getByText('暂无可用图片', { exact: true })).toBeVisible()
  expect(layout()).toEqual(initialLayout)

  await dialog.getByRole('textbox', { name: '搜索图片名称' }).fill('library')
  await dialog.getByRole('button', { name: '搜索', exact: true }).click()
  const libraryOption = dialog
    .getByRole('listbox', { name: '图片库' })
    .getByRole('option', { name: 'library.png' })
  await expect.element(libraryOption).toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await libraryOption.click()
  await expect.element(dialog.getByRole('button', { name: '插入 1 张' })).toBeEnabled()
  expect(layout()).toEqual(initialLayout)
  await libraryOption.click()
  await expect.element(dialog.getByRole('button', { name: '插入', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '返回', exact: true }).click()
  await expect.element(dialog.getByRole('button', { name: '点击选择或拖入图片' })).toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
  await expect.element(dialog.getByRole('textbox', { name: '搜索图片名称' })).toHaveValue('library')
  await expect.element(dialog.getByRole('textbox', { name: '搜索图片名称' })).toHaveFocus()
  expect(listLibraryImages).toHaveBeenCalledTimes(3)
  await libraryOption.click()
  await expect.element(dialog.getByRole('button', { name: '插入 1 张' })).toBeEnabled()
  await dialog.getByRole('button', { name: '返回', exact: true }).click()
  await expect.element(dialog.getByRole('button', { name: '恢复原尺寸' })).toBeVisible()
  expect(layout()).toEqual(initialLayout)

  const widthInput = dialog.getByTestId('rich-text-image-width').getByRole('textbox')
  await widthInput.fill('')
  await dialog.getByTestId('rich-text-image-alt').getByRole('textbox').click()
  await expect
    .element(candidates.getByRole('option', { name: /library.png/ }))
    .toMatchTextContent('尺寸无效')
  await expect.element(dialog.getByText('请输入大于 0 的整数', { exact: true })).toBeVisible()
  await expect.element(dialog.getByRole('button', { name: '插入 1 张' })).toBeDisabled()
  expect(widthInput.element().getBoundingClientRect().top).toBe(
    dialog
      .getByTestId('rich-text-image-height')
      .getByRole('textbox')
      .element()
      .getBoundingClientRect().top,
  )
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '恢复原尺寸' }).click()
  await expect
    .element(candidates.getByRole('option', { name: /library.png/ }))
    .not.toMatchTextContent('尺寸无效')
  await expect
    .element(dialog.getByText('请输入大于 0 的整数', { exact: true }))
    .not.toBeInTheDocument()
  await expect.element(dialog.getByRole('button', { name: '插入 1 张' })).toBeEnabled()
  expect(layout()).toEqual(initialLayout)

  const fileInput = dialog.getByTestId('rich-text-image-file-input').element()
  await userEvent.upload(
    fileInput,
    new File(['invalid image'], 'broken.png', { type: 'image/png' }),
  )
  await expect
    .element(dialog.getByTestId('rich-text-image-error'))
    .toHaveTextContent('图片读取失败，请重试或移除')
  await expect.element(dialog.getByRole('button', { name: '重试读取' })).toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '移除图片' }).click()
  await expect.element(dialog.getByRole('button', { name: '插入 1 张' })).toBeEnabled()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '移除图片' }).click()
  await expect.element(dialog.getByRole('button', { name: '点击选择或拖入图片' })).toBeVisible()
  expect(layout()).toEqual(initialLayout)

  const imageBytes = Uint8Array.from(atob(FIXTURE_PNG), (character) => character.charCodeAt(0))
  await userEvent.upload(
    fileInput,
    Array.from(
      { length: 20 },
      (_, index) => new File([imageBytes], `local-${index}.png`, { type: 'image/png' }),
    ),
  )
  await expect.element(dialog.getByRole('button', { name: '上传并插入 20 张' })).toBeEnabled()
  expect(candidates.element().scrollHeight).toBeGreaterThan(candidates.element().clientHeight)
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await dialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
  await expect
    .element(dialog.getByText('已选择 20 张图片，请先移除再添加', { exact: true }))
    .toBeVisible()
  expect(layout()).toEqual(initialLayout)
  await dialog.getByRole('button', { name: '取消' }).click()
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
  const source = dialog.getByRole('button', { name: '添加图片', exact: true })
  await source.click()
  await expect.element(dialog.getByRole('menu', { name: '添加图片' })).toBeVisible()
  await userEvent.keyboard('{Escape}')
  await expect.element(dialog.getByRole('menu', { name: '添加图片' })).not.toBeInTheDocument()
  await expect.element(dialog).toBeVisible()
  await expect.element(source).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}')
  await expect.element(dialog.getByRole('textbox', { name: '搜索图片名称' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  await expect.element(dialog).not.toBeInTheDocument()
  await expect.element(editable).toHaveFocus()
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
  await darkDialog.getByRole('button', { name: '添加图片', exact: true }).click()
  await darkDialog.getByRole('menuitem', { name: '从图片库选择', exact: true }).click()
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
