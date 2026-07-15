import { Editor } from '@tiptap/vue-3'
import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { collectRichTextEditorExtensions } from '../editor/feature'
import type { RichTextDocument } from '../schema'
import type { RichTextEditorPreset } from './presets/types'

interface UseRichTextEditorOptions {
  modelValue: Ref<RichTextDocument>
  disabled: Ref<boolean>
  preset: RichTextEditorPreset
  onUpdate: (value: RichTextDocument) => void
  onBlur: () => void
}

export function useRichTextEditor(options: UseRichTextEditorOptions) {
  function isSameContent(a: unknown, b: unknown) {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function createEditor(content: RichTextDocument, editable: boolean) {
    return new Editor({
      content,
      editable,
      extensions: collectRichTextEditorExtensions(options.preset),
      onBlur() {
        options.onBlur()
      },
      onUpdate({ editor: currentEditor }) {
        const nextValue = currentEditor.getJSON() as RichTextDocument
        if (isSameContent(nextValue, options.modelValue.value)) {
          return
        }

        options.onUpdate(nextValue)
      },
    })
  }

  const editor = shallowRef(createEditor(options.modelValue.value, !options.disabled.value))

  watch(options.disabled, (disabled) => {
    editor.value.setEditable(!disabled)
  })

  watch(
    options.modelValue,
    (value) => {
      const currentValue = editor.value.getJSON()
      if (isSameContent(currentValue, value)) {
        return
      }

      editor.value.commands.setContent(value, { emitUpdate: false })
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    editor.value.destroy()
  })

  return {
    editor,
  }
}
