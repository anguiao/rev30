import { mergeAttributes } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { createCodeBlockLanguageAttribute, normalizeCodeBlockLanguage } from './languages'
import { codeBlockFeature, richTextCodeBlockCodeStyle, richTextCodeBlockStyle } from './shared'

const transformCode: RichTextTagTransform = ({ tagName, attribs }) => {
  const languageClass = attribs.class
    ?.split(/\s+/)
    .find((className) => className.startsWith('language-'))
  const language = normalizeCodeBlockLanguage(languageClass?.slice('language-'.length))

  return {
    tagName,
    attribs: {
      ...(language ? { class: `language-${language}` } : {}),
      ...(attribs.style ? { style: attribs.style } : {}),
    },
  }
}

const transformCodeBlock: RichTextTagTransform = ({ tagName }) => ({
  tagName,
  attribs: {
    style: richTextCodeBlockStyle,
  },
})

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre', 'code'],
  allowedAttributes: {
    pre: ['style'],
    code: ['class', 'style'],
  },
  allowedStyles: {
    pre: {
      'background-color': [/^.+$/],
    },
    code: {
      padding: [/^0$/i],
      background: [/^transparent$/i],
    },
  },
  transformTags: {
    pre: [transformCodeBlock],
    code: [transformCode],
  },
}

const RichTextCodeBlock = CodeBlock.extend({
  addAttributes() {
    return { language: createCodeBlockLanguageAttribute() }
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'pre',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      [
        'code',
        {
          class: node.attrs.language
            ? this.options.languageClassPrefix + node.attrs.language
            : null,
          style: richTextCodeBlockCodeStyle,
        },
        0,
      ],
    ]
  },
}).configure({
  HTMLAttributes: {
    style: richTextCodeBlockStyle,
  },
})

export const codeBlockServerFeature = defineRichTextServerFeature(codeBlockFeature, {
  htmlPolicy: codeBlockHtmlPolicy,
  extensions: () => [RichTextCodeBlock],
})
