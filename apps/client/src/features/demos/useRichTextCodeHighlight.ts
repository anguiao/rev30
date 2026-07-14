import githubDarkThemeCss from 'highlight.js/styles/github-dark.css?raw'
import githubThemeCss from 'highlight.js/styles/github.css?raw'
import hljs from 'highlight.js/lib/common'
import { computed, nextTick, type Ref } from 'vue'
import { useStyleTag } from '@vueuse/core'
import { useThemeStore } from '../../stores/theme'

export function useRichTextCodeHighlight(container: Ref<HTMLElement | null>) {
  const theme = useThemeStore()
  const highlightThemeCss = computed(() => (theme.isDark ? githubDarkThemeCss : githubThemeCss))
  useStyleTag(highlightThemeCss, { id: 'rich-text-demo-highlight-theme' })

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
