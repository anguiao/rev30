import { expect } from 'vitest'
import { render } from 'vitest-browser-vue'
import type { RichTextDocument, RichTextJsonNode } from '@rev30/rich-text/schema'
import RichTextEditorHarness from './RichTextEditorHarness.vue'

export interface RichTextEditorHarnessOptions {
  readonly initialDisabled?: boolean
  readonly realTransitions?: boolean
}

export function renderRichTextEditorHarness(
  initialDocument?: RichTextDocument,
  options: RichTextEditorHarnessOptions = {},
) {
  return render(RichTextEditorHarness, {
    ...(options.realTransitions ? { global: { stubs: { transition: false } } } : {}),
    props: {
      ...(options.initialDisabled === undefined
        ? {}
        : { initialDisabled: options.initialDisabled }),
      ...(initialDocument === undefined ? {} : { initialDocument }),
    },
  })
}

export type RichTextEditorHarnessScreen = Awaited<ReturnType<typeof renderRichTextEditorHarness>>

export function readEditorModel(screen: RichTextEditorHarnessScreen): RichTextJsonNode {
  return JSON.parse(screen.getByTestId('model-json').element().textContent!)
}

export async function getEditable(screen: RichTextEditorHarnessScreen) {
  const editable = screen.getByTestId('editor-container').getByRole('textbox')
  await expect.element(editable).toBeVisible()
  return editable
}

export function findEditorRoot(screen: RichTextEditorHarnessScreen) {
  const editor = screen
    .getByTestId('editor-container')
    .element()
    .querySelector<HTMLElement>('.ProseMirror')

  if (editor === null) {
    throw new Error('Expected a ProseMirror editor')
  }

  return editor
}

export async function getEditorRoot(screen: RichTextEditorHarnessScreen) {
  const editor = findEditorRoot(screen)
  await expect.element(editor).toBeVisible()
  return editor
}
