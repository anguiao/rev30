import type { Editor } from '@tiptap/core'
import type { RichTextImageAttrs } from './shared'
import { richTextToolbarComponent } from '../../vue/toolbar'
import ImageToolbarControl from './vue/ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

export function insertRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().insertContent({ type: 'image', attrs }).run()
}

export function updateRichTextImage(editor: Editor, attrs: RichTextImageAttrs) {
  return editor.chain().focus().updateAttributes('image', attrs).run()
}

export function imageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    key: 'image',
    component: ImageToolbarControl,
    props: options,
  })
}
