import { describe, expect, it } from 'vitest'
import { inlineCodeHtmlPolicy } from '../../../src/features/inline-code/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('inline code html policy', () => {
  it('keeps code text and removes unsupported attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<code class="language-ts" style="position: fixed" data-x="1">pnpm check</code>',
        [inlineCodeHtmlPolicy],
      ),
    ).toBe('<code>pnpm check</code>')
  })
})
