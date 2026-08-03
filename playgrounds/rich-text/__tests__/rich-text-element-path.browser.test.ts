import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'
import { getEditable, renderRichTextEditorHarness } from './fixtures/renderRichTextEditorHarness'

test('does not scroll the page when an offscreen element path mounts or updates', async () => {
  const spacer = document.createElement('div')
  spacer.style.height = '1600px'
  document.body.append(spacer)
  window.scrollTo(0, 0)

  try {
    const screen = renderRichTextEditorHarness()
    await expect.element(screen.getByTestId('rich-text-element-path')).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    expect(window.scrollY).toBe(0)

    screen
      .getByTestId('set-element-path-document')
      .element()
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await expect.element(screen.getByRole('button', { name: '选择 p 元素' })).toBeInTheDocument()
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    expect(window.scrollY).toBe(0)
  } finally {
    spacer.remove()
    window.scrollTo(0, 0)
  }
})

test('updates nested model marks and activates the element path without losing it on blur', async () => {
  const screen = renderRichTextEditorHarness()
  await screen.getByTestId('set-element-path-document').click()
  const editable = await getEditable(screen)

  await userEvent.click(editable)
  await userEvent.keyboard('{Home}')
  await userEvent.keyboard('{ArrowRight}{ArrowRight}')

  await expect.element(screen.getByRole('button', { name: '选择 em 元素' })).toBeVisible()
  const strongButton = screen.getByRole('button', { name: '选择 strong 元素' }).element()
  strongButton.focus()
  await userEvent.keyboard('{Space}')
  await expect.element(screen.getByTestId('selection-text')).toHaveTextContent('甲乙丙')
  await expect.element(screen.getByTestId('active-element')).toHaveTextContent('editor')

  await screen.getByTestId('after-editor').click()
  await expect.element(screen.getByTestId('rich-text-element-path')).toBeVisible()
  await expect.element(screen.getByRole('button', { name: '选择 strong 元素' })).toBeVisible()
})

test('selects table cells from td, tr, and table path items without hiding the count', async () => {
  const screen = renderRichTextEditorHarness()
  await screen.getByTestId('set-table-document').click()
  const editable = await getEditable(screen)
  const cell = editable.element().querySelector<HTMLTableCellElement>('tbody tr:nth-child(2) td')
  expect(cell).not.toBeNull()

  await userEvent.click(cell!)
  const path = screen.getByTestId('rich-text-element-path')
  await expect.element(path.getByRole('button', { name: '选择 td 元素' })).toBeVisible()
  expect(path.element().scrollWidth).toBeGreaterThan(path.element().clientWidth)

  await path.getByRole('button', { name: '选择 td 元素' }).click()
  expect(editable.element().querySelectorAll('.selectedCell')).toHaveLength(1)

  await path.getByRole('button', { name: '选择 tr 元素' }).click()
  expect(editable.element().querySelectorAll('.selectedCell')).toHaveLength(5)

  await path.getByRole('button', { name: '选择 table 元素' }).click()
  expect(editable.element().querySelectorAll('.selectedCell')).toHaveLength(10)

  const statusBar = screen.getByTestId('rich-text-status-bar').element()
  const statusEnd = screen.getByTestId('rich-text-status-bar-end').element()
  const characterCount = screen.getByTestId('rich-text-character-count').element()
  expect(characterCount.getBoundingClientRect().right).toBeLessThanOrEqual(
    statusEnd.getBoundingClientRect().right,
  )
  expect(characterCount.getBoundingClientRect().width).toBeGreaterThan(0)
  expect(characterCount.getBoundingClientRect().left).toBeGreaterThanOrEqual(
    path.element().getBoundingClientRect().right,
  )
  expect(statusEnd.getBoundingClientRect().right).toBeLessThanOrEqual(
    statusBar.getBoundingClientRect().right,
  )
})
