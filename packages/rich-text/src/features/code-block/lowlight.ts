import type { LanguageFn } from 'highlight.js'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { createLowlight } from 'lowlight'
import { codeBlockLanguageAliases, type CodeBlockLanguage } from './languages'

const codeBlockGrammars = {
  plaintext,
  typescript,
  javascript,
  json,
  html: xml,
  css,
  bash,
  sql,
  markdown,
  yaml,
} satisfies Record<CodeBlockLanguage, LanguageFn>

export const codeBlockLowlight = createLowlight(codeBlockGrammars)

for (const [alias, language] of Object.entries(codeBlockLanguageAliases)) {
  codeBlockLowlight.registerAlias(language, alias)
}
