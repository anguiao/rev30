import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { normalizeLinkHref } from './href'
import { linkFeature } from './shared'

export const setLinkAction = defineRichTextAction(linkFeature, {
  key: 'set-link',
  command(href: string) {
    const normalizedHref = normalizeLinkHref(href)

    return ({ chain }) =>
      normalizedHref ? chain().focus().setLink({ href: normalizedHref }).run() : false
  },
})

export const unsetLinkAction = defineRichTextAction(linkFeature, {
  key: 'unset-link',
  command:
    () =>
    ({ chain }) =>
      chain().focus().unsetLink().run(),
})

export const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {})
