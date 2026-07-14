interface CodeBlockHtmlElement {
  readonly firstElementChild: {
    readonly classList: Iterable<string>
  } | null
}

const codeBlockLanguagePattern = /^[a-z0-9][a-z0-9+#._-]*$/

export function normalizeCodeBlockLanguage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  return codeBlockLanguagePattern.test(normalized) ? normalized : null
}

export function createCodeBlockLanguageAttribute() {
  return {
    default: null,
    parseHTML(element: CodeBlockHtmlElement) {
      const languageClass = [...(element.firstElementChild?.classList ?? [])].find((className) =>
        className.startsWith('language-'),
      )

      return normalizeCodeBlockLanguage(languageClass?.slice('language-'.length))
    },
    rendered: false,
    validate(value: unknown) {
      if (value !== null && normalizeCodeBlockLanguage(value) !== value) {
        throw new RangeError('Code block language must be canonical')
      }
    },
  }
}
