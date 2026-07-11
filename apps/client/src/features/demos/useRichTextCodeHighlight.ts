import githubDarkThemeCss from 'highlight.js/styles/github-dark.css?raw'
import githubThemeCss from 'highlight.js/styles/github.css?raw'
import highlightJs from 'highlight.js/lib/core'
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
import { computed, nextTick, type Ref } from 'vue'
import { useStyleTag } from '@vueuse/core'
import { useThemeStore } from '../../stores/theme'

const grammars = {
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
}

for (const [language, grammar] of Object.entries(grammars)) {
  highlightJs.registerLanguage(language, grammar)
}

export function useRichTextCodeHighlight(container: Ref<HTMLElement | null>) {
  const theme = useThemeStore()
  const highlightThemeCss = computed(() => (theme.isDark ? githubDarkThemeCss : githubThemeCss))
  useStyleTag(highlightThemeCss, { id: 'rich-text-demo-highlight-theme' })

  async function highlightCode() {
    await nextTick()

    for (const code of container.value?.querySelectorAll<HTMLElement>('pre code') ?? []) {
      highlightJs.highlightElement(code)
    }
  }

  return { highlightCode }
}
