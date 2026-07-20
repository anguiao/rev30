let nextCodeBlockLanguageMenuId = 0

export function createCodeBlockLanguageMenuId() {
  nextCodeBlockLanguageMenuId += 1
  return `rich-text-code-block-language-${nextCodeBlockLanguageMenuId}`
}
