import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import {
  codeBlockAction,
  codeBlockEditorFeature,
  setCodeBlockLanguageAction,
} from '../../../src/features/code-block/editor'
import { codeBlockLanguageOptions } from '../../../src/features/code-block/languages'
import { codeBlockFeature } from '../../../src/features/code-block/shared'
import { codeBlockToolbarControl } from '../../../src/features/code-block/vue'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>const ready = true</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
    content,
  })
}

describe('code block feature', () => {
  it('toggles a basic code block and exposes its action state', () => {
    const editor = createEditor()

    expect(codeBlockAction.canRun?.(editor)).toBe(true)
    expect(codeBlockAction.run(editor)).toBe(true)
    expect(codeBlockAction.isActive?.(editor)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<pre class="hljs"><code>const ready = true</code></pre>')
  })

  it('keeps the native Mod-Alt-c shortcut', () => {
    const editor = createEditor()

    expect(editor.commands.keyboardShortcut('Mod-Alt-c')).toBe(true)
    expect(editor.isActive('codeBlock')).toBe(true)
  })

  it('stores the selected language and highlights the editable code', () => {
    const editor = createEditor()

    expect(setCodeBlockLanguageAction.run(editor, 'typescript')).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe(
      '<pre class="hljs"><code class="language-typescript">const ready = true</code></pre>',
    )
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const')

    expect(setCodeBlockLanguageAction.run(editor, null)).toBe(true)
    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: null })
    expect(editor.getHTML()).toBe('<pre class="hljs"><code>const ready = true</code></pre>')
  })

  it('normalizes language aliases imported from HTML', () => {
    const editor = createEditor('<pre><code class="language-ts">const ready = true</code></pre>')

    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'codeBlock', attrs: { language: 'typescript' } }],
    })
    expect(editor.getHTML()).toBe(
      '<pre class="hljs"><code class="language-typescript">const ready = true</code></pre>',
    )
    expect(editor.view.dom.querySelector('.hljs-keyword')?.textContent).toBe('const')
  })

  it('removes unsupported languages imported from HTML', () => {
    const editor = createEditor(
      '<pre><code class="language-unknown">const ready = true</code></pre>',
    )

    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'codeBlock', attrs: { language: null } }],
    })
    expect(editor.getHTML()).toBe('<pre class="hljs"><code>const ready = true</code></pre>')
  })

  it('provides the language toolbar control', () => {
    expect(codeBlockToolbarControl).toMatchObject({
      type: 'component',
      feature: codeBlockFeature,
      key: 'code-block',
      props: {
        languages: codeBlockLanguageOptions,
      },
    })
  })
})
