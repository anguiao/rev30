import Link from '@tiptap/extension-link'
import { defineRichTextFeature } from '../../core/feature'

export const linkFeature = defineRichTextFeature({
  key: 'link',
  label: '链接',
  icon: 'i-[lucide--link]',
  extension: () =>
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
    }),
})
