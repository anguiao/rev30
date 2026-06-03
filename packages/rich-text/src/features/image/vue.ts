import type { RichTextImageAttrs } from './shared'
import { richTextToolbarComponent } from '../../vue/toolbar'
import ImageToolbarControl from './vue/ImageToolbarControl.vue'
export { insertRichTextImage, updateRichTextImage } from './commands'

export interface RichTextImageUploadOptions {
  accept?: string
  upload: (file: File) => Promise<Pick<RichTextImageAttrs, 'src' | 'alt'>>
  onError?: (error: unknown) => void
}

export function imageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    key: 'image',
    component: ImageToolbarControl,
    props: options,
  })
}
