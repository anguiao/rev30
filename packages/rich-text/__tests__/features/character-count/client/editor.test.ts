import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { AllSelection, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { describe, expect, it } from 'vitest'
import {
  characterCountEditorFeature,
  countSelectedRichTextGraphemes,
} from '../../../../src/features/character-count/client/editor'
import { baseFeature } from '../../../../src/features/base/core/feature'
import { horizontalRuleFeature } from '../../../../src/features/horizontal-rule/core/feature'
import { imageFeature } from '../../../../src/features/image/core/feature'
import { tableFeature } from '../../../../src/features/table/core/feature'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content: string | object = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [
      ...baseFeature.sharedExtensions!(),
      ...horizontalRuleFeature.sharedExtensions!(),
      ...imageFeature.sharedExtensions!(),
      ...tableFeature.sharedExtensions!(),
      ...characterCountEditorFeature.extensions!(),
    ],
    content,
  })
}

function findNodePosition(editor: ReturnType<typeof createEditor>, type: string) {
  let position: number | null = null

  editor.state.doc.descendants((node, pos) => {
    if (position === null && node.type.name === type) {
      position = pos
    }
  })

  if (position === null) {
    throw new Error(`Node not found: ${type}`)
  }

  return position
}

describe('character count editor feature', () => {
  it.each([
    ['维护通知', 4],
    ['ABC', 3],
    ['👨‍👩‍👧‍👦', 1],
    ['e\u0301', 1],
  ])('counts %s as %i graphemes', (text, count) => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    })

    expect(editor.storage.characterCount.characters()).toBe(count)
  })

  it('provides the configured character count extension', () => {
    const extensions = characterCountEditorFeature.extensions!()

    expect(extensions.map((extension) => extension.name)).toEqual(['characterCount'])
    expect(extensions[0]?.options).toMatchObject({
      limit: null,
      mode: 'textSize',
    })
  })

  it('reads the current document from storage after content changes', () => {
    const editor = createEditor('<p>维护👨‍👩‍👧‍👦</p>')

    expect(editor.storage.characterCount.characters()).toBe(3)

    editor.commands.setContent('<p>ABC e\u0301</p>')

    expect(editor.storage.characterCount.characters()).toBe(5)
  })

  it('counts collapsed, range, and all selections from the selection slice', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '👨‍👩‍👧‍👦 ' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: ' e\u0301' }],
        },
      ],
    })

    expect(countSelectedRichTextGraphemes(editor)).toBe(0)

    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 1, editor.state.doc.content.size - 1),
      ),
    )
    expect(countSelectedRichTextGraphemes(editor)).toBe(4)

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)))
    expect(countSelectedRichTextGraphemes(editor)).toBe(4)
    expect(editor.storage.characterCount.characters()).toBe(4)
  })

  it('preserves textSize counting for hard breaks, rules, and image node selections', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'A' },
            { type: 'hardBreak' },
            { type: 'text', text: 'B' },
          ],
        },
        { type: 'horizontalRule' },
        {
          type: 'image',
          attrs: { src: '/image.png', alt: null, width: null, height: null },
        },
      ],
    })

    expect(editor.storage.characterCount.characters()).toBe(5)

    const hardBreakPosition = findNodePosition(editor, 'hardBreak')
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, hardBreakPosition, hardBreakPosition + 1),
      ),
    )
    expect(countSelectedRichTextGraphemes(editor)).toBe(1)

    for (const type of ['horizontalRule', 'image']) {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, findNodePosition(editor, type)),
        ),
      )
      expect(countSelectedRichTextGraphemes(editor)).toBe(1)
    }
  })

  it('counts cell selections from their slice without adding cell separators', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '甲👨‍👩‍👧‍👦' }],
                    },
                  ],
                },
                {
                  type: 'tableCell',
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: ' e\u0301' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const table = editor.state.doc.firstChild
    if (!table) throw new Error('Expected table')
    const map = TableMap.get(table)
    const tableStart = 1
    const firstCell = editor.state.doc.resolve(tableStart + map.map[0]!)
    const lastCell = editor.state.doc.resolve(tableStart + map.map.at(-1)!)

    editor.view.dispatch(editor.state.tr.setSelection(new CellSelection(firstCell, lastCell)))

    expect(countSelectedRichTextGraphemes(editor)).toBe(4)
    expect(editor.storage.characterCount.characters()).toBe(4)
  })

  it('does not change the document JSON or HTML', () => {
    const editor = createEditor('<p>维护通知</p><p>ABC</p>')

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '维护通知' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'ABC' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<p>维护通知</p><p>ABC</p>')
  })
})
