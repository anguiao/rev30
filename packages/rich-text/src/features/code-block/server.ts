import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { createCodeBlockLanguageAttribute, normalizeCodeBlockLanguage } from './languages'
import { codeBlockFeature } from './shared'

const transformCode: RichTextTagTransform = ({ tagName, attribs }) => {
  const languageClass = attribs.class
    ?.split(/\s+/)
    .find((className) => className.startsWith('language-'))
  const language = normalizeCodeBlockLanguage(languageClass?.slice('language-'.length))

  return {
    tagName,
    attribs: language ? { class: `language-${language}` } : {},
  }
}

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre', 'code'],
  allowedAttributes: {
    code: ['class'],
  },
  transformTags: {
    code: [transformCode],
  },
}

const RichTextCodeBlock = CodeBlock.extend({
  addAttributes() {
    return { language: createCodeBlockLanguageAttribute() }
  },
})

export const codeBlockServerFeature = defineRichTextServerFeature(codeBlockFeature, {
  htmlPolicy: codeBlockHtmlPolicy,
  extensions: () => [RichTextCodeBlock],
})
