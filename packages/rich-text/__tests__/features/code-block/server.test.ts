import { describe, expect, it } from 'vitest'
import { codeBlockHtmlPolicy } from '../../../src/features/code-block/server'
import { sanitizeRichTextHtml } from '../../../src/server/sanitize'

describe('code block html policy', () => {
  it('keeps pre and code while removing unsupported attributes', () => {
    expect(
      sanitizeRichTextHtml(
        '<pre class="code-block"><code class="language-typescript" data-x="1">const ready = true</code></pre>',
        [codeBlockHtmlPolicy],
      ),
    ).toBe('<pre><code>const ready = true</code></pre>')
  })
})
