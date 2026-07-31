import { Editor } from '@tiptap/vue-3'
import { onTestFinished } from 'vitest'

type TestEditorOptions = NonNullable<ConstructorParameters<typeof Editor>[0]>

export function appendTestElement<K extends keyof HTMLElementTagNameMap>(tagName: K) {
  const element = document.createElement(tagName)
  document.body.appendChild(element)

  onTestFinished(() => element.remove())

  return element
}

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
