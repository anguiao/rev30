import Bold from '@tiptap/extension-bold'
import CodeBlock from '@tiptap/extension-code-block'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { resolveLinkRange } from '../../../src/features/link/range'
import { linkFeature } from '../../../src/features/link/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string) {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      CodeBlock,
      HardBreak,
      ...linkFeature.sharedExtensions!(),
    ],
    content,
  })
}

describe('rich text link range resolver', () => {
  it('resolves the unique continuous link beside a collapsed caret', () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>普通文字</p>')

    for (const position of [1, 3, 5]) {
      editor.commands.setTextSelection(position)

      expect(resolveLinkRange(editor)).toEqual({
        from: 1,
        to: 5,
        href: 'https://example.com',
      })
    }
  })

  it('keeps a continuous link range across other inline marks', () => {
    const editor = createEditor(
      '<p><a href="https://example.com">链<strong>接</strong>文本</a></p>',
    )
    editor.commands.setTextSelection(3)

    expect(resolveLinkRange(editor)).toEqual({
      from: 1,
      to: 5,
      href: 'https://example.com',
    })
  })

  it('does not guess between adjacent links with different href values', () => {
    const editor = createEditor(
      '<p><a href="https://first.example">甲</a><a href="https://second.example">乙</a></p>',
    )
    editor.commands.setTextSelection(2)

    expect(resolveLinkRange(editor)).toEqual({
      from: 2,
      to: 2,
      href: '',
    })
  })

  it('edits the complete link range for a non-empty selection inside one link', () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>普通文字</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })

    expect(resolveLinkRange(editor)).toEqual({
      from: 1,
      to: 5,
      href: 'https://example.com',
    })
  })

  it('keeps exact ranges for plain and mixed single-block selections', () => {
    const editor = createEditor('<p><a href="https://example.com">链接</a>普通文字</p>')

    editor.commands.setTextSelection({ from: 3, to: 7 })
    expect(resolveLinkRange(editor)).toEqual({
      from: 3,
      to: 7,
      href: '',
    })

    editor.commands.setTextSelection({ from: 2, to: 5 })
    expect(resolveLinkRange(editor)).toEqual({
      from: 2,
      to: 5,
      href: '',
    })
  })

  it('rejects cross-block and atom-containing text selections', () => {
    const editor = createEditor('<p>第一段</p><p>第二段<br>末尾</p>')

    editor.commands.setTextSelection({ from: 2, to: 7 })
    expect(resolveLinkRange(editor)).toBeNull()

    editor.commands.setTextSelection({ from: 6, to: 10 })
    expect(resolveLinkRange(editor)).toBeNull()
  })

  it('uses a collapsed range without prefilled href for stored link marks', () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection(3)
    editor.commands.setLink({ href: 'https://stored.example' })

    expect(resolveLinkRange(editor)).toEqual({
      from: 3,
      to: 3,
      href: '',
    })
  })

  it('does not resolve a link after the caret exits its paragraph-end boundary', () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a></p>')
    editor.commands.setTextSelection(5)
    editor.view.dispatch(editor.state.tr.setStoredMarks([]))

    expect(resolveLinkRange(editor)).toEqual({
      from: 5,
      to: 5,
      href: '',
    })
  })

  it('rejects text blocks that do not allow link marks', () => {
    const editor = createEditor('<pre><code>const value = 1</code></pre>')
    editor.commands.setTextSelection(3)

    expect(resolveLinkRange(editor)).toBeNull()
  })
})
