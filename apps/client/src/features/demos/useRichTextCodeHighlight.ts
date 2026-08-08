import hljs from 'highlight.js/lib/core'
import { common } from 'lowlight'
import { nextTick, type Ref } from 'vue'

for (const [name, language] of Object.entries(common)) {
  hljs.registerLanguage(name, language)
}

export function useRichTextCodeHighlight(container: Readonly<Ref<HTMLElement | null>>) {
  async function highlightCode() {
    await nextTick()

    for (const code of container.value?.querySelectorAll<HTMLElement>('pre code') ?? []) {
      const languageClass = [...code.classList].find((className) =>
        className.startsWith('language-'),
      )
      const language = languageClass?.slice('language-'.length)

      if (!language || !hljs.getLanguage(language)) {
        continue
      }

      hljs.highlightElement(code)
    }
  }

  return { highlightCode }
}
