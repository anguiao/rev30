import { Editor } from '@tiptap/vue-3'
import { onTestFinished } from 'vitest'

type TestEditorOptions = NonNullable<ConstructorParameters<typeof Editor>[0]>

export function createTestEditor(options: TestEditorOptions) {
  const element = document.createElement('div')
  document.body.appendChild(element)

  const editor = new Editor({
    ...options,
    element,
  })

  onTestFinished(() => {
    editor.destroy()
    element.remove()
  })

  return editor
}
