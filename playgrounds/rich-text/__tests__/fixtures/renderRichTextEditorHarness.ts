import { expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import RichTextEditorHarness from './RichTextEditorHarness.vue'

export function renderRichTextEditorHarness(initialDocument?: RichTextDocument) {
  return initialDocument === undefined
    ? render(RichTextEditorHarness)
    : render(RichTextEditorHarness, { props: { initialDocument } })
}

export type RichTextEditorHarnessScreen = ReturnType<typeof renderRichTextEditorHarness>

export async function getEditable(screen: RichTextEditorHarnessScreen) {
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toBeVisible()
  return editable
}
