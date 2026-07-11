import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { normalizeLinkHref } from './href'
import { linkFeature } from './shared'

export const setLinkAction = defineRichTextAction(linkFeature, {
  key: 'set-link',
  run(editor, href: string) {
    const normalizedHref = normalizeLinkHref(href)

    if (!normalizedHref) {
      return false
    }

    return editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run()
  },
})

export const unsetLinkAction = defineRichTextAction(linkFeature, {
  key: 'unset-link',
  run: (editor) => editor.chain().focus().extendMarkRange('link').unsetLink().run(),
})

export const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {
  actions: [setLinkAction, unsetLinkAction],
})
