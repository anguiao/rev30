import { richTextToolbarComponent } from '../../vue/toolbar'
import ImageToolbarControl from './vue/ImageToolbarControl.vue'

export interface RichTextImageUploadOptions {
  upload: (file: File) => Promise<{ src: string }>
  onError?: (error: unknown) => void
}

export function createImageToolbarControl(options: RichTextImageUploadOptions) {
  return richTextToolbarComponent({
    key: 'image',
    component: ImageToolbarControl,
    props: options,
  })
}
