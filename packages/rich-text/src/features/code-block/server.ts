import { mergeAttributes } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import { defineRichTextServerFeature } from '../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../server/policy'
import { createCodeBlockLanguageAttribute, normalizeCodeBlockLanguage } from './languages'
import {
  codeBlockFeature,
  richTextCodeBlockClass,
  richTextCodeBlockCodeStyle,
  richTextCodeBlockStyle,
} from './shared'

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
    class: richTextCodeBlockClass,
    style: richTextCodeBlockStyle,
  },
})

const codeBlockBackgroundPattern = /^light-dark\(\s*#f5f5f4\s*,\s*#09090b\s*\)$/i
const codeBlockCodePaddingPattern = /^0$/i
const codeBlockCodeBackgroundPattern = /^transparent$/i

export const codeBlockHtmlPolicy: RichTextHtmlPolicy = {
  allowedTags: ['pre', 'code'],
  allowedAttributes: {
    pre: ['class', 'style'],
    code: ['class', 'style'],
  },
  allowedStyles: {
    pre: {
      'background-color': [codeBlockBackgroundPattern],
    },
    code: {
      padding: [codeBlockCodePaddingPattern],
      background: [codeBlockCodeBackgroundPattern],
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
    class: richTextCodeBlockClass,
    style: richTextCodeBlockStyle,
  },
})

export const codeBlockServerFeature = defineRichTextServerFeature(codeBlockFeature, {
  htmlPolicy: codeBlockHtmlPolicy,
  extensions: () => [RichTextCodeBlock],
})
