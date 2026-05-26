import { Editor } from '@tiptap/vue-3'
import { onBeforeUnmount, shallowRef, watch, type Ref } from 'vue'
import { collectRichTextExtensions, type RichTextPreset } from '../core/preset'
import type { RichTextDocument } from '../schema'

interface UseRichTextEditorOptions {
  modelValue: Ref<RichTextDocument>
  disabled: Ref<boolean>
  preset: Ref<RichTextPreset>
  onUpdate: (value: RichTextDocument) => void
  onBlur: () => void
}

export function useRichTextEditor(options: UseRichTextEditorOptions) {
  const editor = shallowRef(
    new Editor({
      content: options.modelValue.value,
      editable: !options.disabled.value,
      extensions: collectRichTextExtensions(options.preset.value),
      onBlur() {
        options.onBlur()
      },
      onUpdate({ editor: currentEditor }) {
        options.onUpdate(currentEditor.getJSON() as RichTextDocument)
      },
    }),
  )

  watch(options.disabled, (disabled) => {
    editor.value?.setEditable(!disabled)
  })

  watch(
    options.modelValue,
    (value) => {
      const currentValue = editor.value?.getJSON()
      if (JSON.stringify(currentValue) === JSON.stringify(value)) {
        return
      }

      editor.value?.commands.setContent(value, { emitUpdate: false })
    },
    { deep: true },
  )

  onBeforeUnmount(() => {
    editor.value?.destroy()
  })

  return {
    editor,
  }
}
