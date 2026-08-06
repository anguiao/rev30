import { expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import RichTextEditorHarness from './RichTextEditorHarness.vue'

export interface RichTextEditorHarnessOptions {
  readonly initialDisabled?: boolean
}

export function renderRichTextEditorHarness(
  initialDocument?: RichTextDocument,
  options: RichTextEditorHarnessOptions = {},
) {
  return render(RichTextEditorHarness, {
    props: {
      ...(options.initialDisabled === undefined
        ? {}
        : { initialDisabled: options.initialDisabled }),
      ...(initialDocument === undefined ? {} : { initialDocument }),
    },
  })
}

export type RichTextEditorHarnessScreen = ReturnType<typeof renderRichTextEditorHarness>

export async function getEditable(screen: RichTextEditorHarnessScreen) {
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toBeVisible()
  return editable
}

export async function getEditorRoot(screen: RichTextEditorHarnessScreen) {
  const editor = screen
    .getByTestId('editor-container')
    .element()
    .querySelector<HTMLElement>('.ProseMirror')

  if (editor === null) {
    throw new Error('Expected a ProseMirror editor')
  }

  await expect.element(editor).toBeVisible()
  return editor
}
