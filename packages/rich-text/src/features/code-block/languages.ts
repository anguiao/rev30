export const codeBlockLanguageOptions = [
  { value: 'plaintext', label: '纯文本' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
] as const

export type CodeBlockLanguageOption = (typeof codeBlockLanguageOptions)[number]
export type CodeBlockLanguage = CodeBlockLanguageOption['value']

export const codeBlockLanguageAliases: Readonly<Record<string, CodeBlockLanguage>> = Object.freeze({
  text: 'plaintext',
  txt: 'plaintext',
  ts: 'typescript',
  js: 'javascript',
  xml: 'html',
  sh: 'bash',
  shell: 'bash',
  md: 'markdown',
  yml: 'yaml',
})

interface CodeBlockHtmlElement {
  readonly firstElementChild: {
    readonly classList: Iterable<string>
  } | null
}

const codeBlockLanguageSet = new Set<string>(codeBlockLanguageOptions.map((option) => option.value))

export function normalizeCodeBlockLanguage(value: unknown): CodeBlockLanguage | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()

  if (codeBlockLanguageSet.has(normalized)) {
    return normalized as CodeBlockLanguage
  }

  return codeBlockLanguageAliases[normalized] ?? null
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
