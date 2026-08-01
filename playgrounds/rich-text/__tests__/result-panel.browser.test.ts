import { expect, test } from 'vitest'
import { render } from 'vitest-browser-vue'
import { RichTextContentInvalidError } from '@rev30/rich-text/server'
import ResultPanel from '../src/components/ResultPanel.vue'
import { createDefaultDocument } from '../src/playground/defaultDocument'

function createResult() {
  return {
    json: createDefaultDocument(),
    text: '旧结果',
    html: '<p>旧结果</p>',
  }
}

function createErrorPanelProps(
  error: unknown,
  result: ReturnType<typeof createResult> | null = createResult(),
) {
  return {
    result,
    status: 'error' as const,
    error,
    imageError: null,
    isDark: false,
  }
}

test('maps known derivation errors and hides unknown causes without discarding previous results', async () => {
  const screen = render(ResultPanel, {
    props: createErrorPanelProps(new RichTextContentInvalidError()),
  })

  const errorAlert = screen.getByTestId('derivation-error')
  await expect.element(errorAlert).toHaveTextContent('富文本内容无效')
  await expect.element(errorAlert).not.toHaveTextContent('Rich text content is invalid')
  await expect.element(screen.getByTestId('rendered-result')).toHaveTextContent('旧结果')

  for (const error of [new Error('private error'), 'private string', null]) {
    await screen.rerender({ error })
    await expect.element(errorAlert).toHaveTextContent('生成富文本结果失败')
    await expect.element(errorAlert).not.toHaveTextContent('private')
    await expect.element(screen.getByTestId('rendered-result')).toHaveTextContent('旧结果')
  }
})

test('shows an empty error state when the first derivation has no successful result', async () => {
  const screen = render(ResultPanel, {
    props: createErrorPanelProps(null, null),
  })

  await expect
    .element(screen.getByTestId('derivation-error'))
    .toHaveTextContent('生成富文本结果失败')
  await expect
    .element(screen.getByTestId('derivation-error'))
    .not.toHaveTextContent('保留的结果不是当前内容')
  await expect.element(screen.getByTestId('rendered-result')).not.toBeInTheDocument()
})
