import { Node } from '@tiptap/core'
import Bold from '@tiptap/extension-bold'
import Document from '@tiptap/extension-document'
import HardBreak from '@tiptap/extension-hard-break'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { describe, expect, it, vi } from 'vitest'
import {
  clearSearchReplaceAction,
  closeSearchReplaceAction,
  getSearchReplaceState,
  goToNextSearchMatchAction,
  goToPreviousSearchMatchAction,
  openSearchReplaceAction,
  replaceAllSearchMatchesAction,
  replaceCurrentSearchMatchAction,
  searchReplaceCurrentMatchClass,
  searchReplaceEditorFeature,
  searchReplaceMatchClass,
  setSearchReplaceCaseSensitiveAction,
  setSearchReplaceQueryAction,
} from '../../../src/features/search-replace/editor'
import { createTestEditor } from '../../helpers/editor'

const InlineAtom = Node.create({
  name: 'inlineAtom',
  group: 'inline',
  inline: true,
  atom: true,
  parseHTML: () => [{ tag: 'span[data-inline-atom]' }],
  renderHTML: () => ['span', { 'data-inline-atom': '' }],
})

function createEditor(content: string | object = '<p>维护 ABC abc</p>') {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Link.configure({ openOnClick: false }),
      HardBreak,
      InlineAtom,
      UndoRedo,
      ...searchReplaceEditorFeature.extensions!(),
    ],
    content,
  })
}

function openAndSearch(editor: ReturnType<typeof createEditor>, query: string) {
  expect(openSearchReplaceAction.run(editor)).toBe(true)
  expect(setSearchReplaceQueryAction.run(editor, query)).toBe(true)
  return getSearchReplaceState(editor)
}

function dispatchModF(editor: ReturnType<typeof createEditor>) {
  const isMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
  const event = new KeyboardEvent('keydown', {
    key: 'f',
    metaKey: isMac,
    ctrlKey: !isMac,
    bubbles: true,
    cancelable: true,
  })

  editor.view.dom.dispatchEvent(event)
  return event
}

describe('search replace editor feature', () => {
  it('exposes the direct surface-neutral actions and extension', () => {
    expect(searchReplaceEditorFeature.actions).toEqual([
      openSearchReplaceAction,
      closeSearchReplaceAction,
      setSearchReplaceQueryAction,
      setSearchReplaceCaseSensitiveAction,
      goToNextSearchMatchAction,
      goToPreviousSearchMatchAction,
      replaceCurrentSearchMatchAction,
      replaceAllSearchMatchesAction,
      clearSearchReplaceAction,
    ])
    expect(searchReplaceEditorFeature.extensions!().map((extension) => extension.name)).toEqual([
      'searchReplace',
    ])
  })

  it('finds literal Chinese and ASCII text case-insensitively by default', () => {
    const editor = createEditor('<p>维护 ABC abc a.c</p>')

    expect(openAndSearch(editor, '维护').matches).toHaveLength(1)
    expect(setSearchReplaceQueryAction.run(editor, 'abc')).toBe(true)
    expect(getSearchReplaceState(editor)).toMatchObject({
      active: true,
      query: 'abc',
      caseSensitive: false,
      currentIndex: 0,
    })
    expect(getSearchReplaceState(editor).matches).toHaveLength(2)

    expect(setSearchReplaceQueryAction.run(editor, 'a.c')).toBe(true)
    expect(getSearchReplaceState(editor).matches).toHaveLength(1)
  })

  it('supports case-sensitive search without changing the document', () => {
    const editor = createEditor('<p>ABC abc</p>')
    const before = editor.getJSON()

    openAndSearch(editor, 'abc')
    expect(setSearchReplaceCaseSensitiveAction.run(editor, true)).toBe(true)

    expect(getSearchReplaceState(editor)).toMatchObject({
      caseSensitive: true,
      currentIndex: 0,
    })
    expect(getSearchReplaceState(editor).matches).toHaveLength(1)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.undo()).toBe(false)
  })

  it('matches across adjacent marked text nodes in one textblock', () => {
    const editor = createEditor('<p><strong>维</strong><em>护</em>通知</p>')

    expect(openAndSearch(editor, '维护通知').matches).toEqual([{ from: 1, to: 5 }])
  })

  it('does not match across textblocks, hard breaks, or inline atoms', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '甲' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '乙' },
            { type: 'hardBreak' },
            { type: 'text', text: '丙' },
            { type: 'inlineAtom' },
            { type: 'text', text: '丁' },
          ],
        },
      ],
    })

    openAndSearch(editor, '甲乙')
    expect(getSearchReplaceState(editor).matches).toEqual([])
    setSearchReplaceQueryAction.run(editor, '乙丙')
    expect(getSearchReplaceState(editor).matches).toEqual([])
    setSearchReplaceQueryAction.run(editor, '丙丁')
    expect(getSearchReplaceState(editor).matches).toEqual([])
  })

  it('wraps next and previous navigation and updates decorations only', () => {
    const editor = createEditor('<p>abc abc</p>')
    const before = editor.getJSON()
    const onUpdate = vi.fn()
    editor.on('update', onUpdate)

    openAndSearch(editor, 'abc')
    expect(editor.view.dom.querySelectorAll(`.${searchReplaceMatchClass}`)).toHaveLength(2)
    expect(editor.view.dom.querySelectorAll(`.${searchReplaceCurrentMatchClass}`)).toHaveLength(1)

    expect(goToPreviousSearchMatchAction.run(editor)).toBe(true)
    expect(getSearchReplaceState(editor).currentIndex).toBe(1)
    expect(editor.state.selection).toMatchObject(getSearchReplaceState(editor).matches[1]!)
    expect(goToNextSearchMatchAction.run(editor)).toBe(true)
    expect(getSearchReplaceState(editor).currentIndex).toBe(0)
    expect(editor.state.selection).toMatchObject(getSearchReplaceState(editor).matches[0]!)
    expect(goToNextSearchMatchAction.run(editor)).toBe(true)
    expect(goToNextSearchMatchAction.run(editor)).toBe(true)
    expect(getSearchReplaceState(editor).currentIndex).toBe(0)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.commands.undo()).toBe(false)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('keeps marks when replacing the current marked match and supports undo', () => {
    const editor = createEditor('<p><strong>abc</strong> abc</p>')

    openAndSearch(editor, 'abc')
    expect(replaceCurrentSearchMatchAction.run(editor, '维护')).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>维护</strong> abc</p>')
    expect(getSearchReplaceState(editor).matches).toHaveLength(1)

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe('<p><strong>abc</strong> abc</p>')
  })

  it('preserves a non-inclusive mark when replacing the current match', () => {
    const editor = createEditor('<p><a href="https://example.com">abc</a> abc</p>')

    openAndSearch(editor, 'abc')
    expect(replaceCurrentSearchMatchAction.run(editor, 'X')).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              type: 'text',
              text: 'X',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'text', text: ' abc' },
          ],
        },
      ],
    })
  })

  it('replaces all matches in one transaction and one undo step', () => {
    const editor = createEditor('<p>abc ABC</p><p>abc</p>')

    openAndSearch(editor, 'abc')
    expect(replaceAllSearchMatchesAction.run(editor, 'X')).toBe(true)
    expect(editor.getHTML()).toBe('<p>X X</p><p>X</p>')
    expect(getSearchReplaceState(editor)).toMatchObject({ matches: [], currentIndex: -1 })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe('<p>abc ABC</p><p>abc</p>')
    expect(editor.commands.undo()).toBe(false)
  })

  it('uses each match marks instead of unrelated stored marks when replacing all', () => {
    const editor = createEditor('<p><a href="https://example.com">abc</a> abc</p>')

    openAndSearch(editor, 'abc')
    editor.view.dispatch(editor.state.tr.setStoredMarks([editor.schema.marks.italic!.create()]))
    expect(replaceAllSearchMatchesAction.run(editor, 'X')).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              type: 'text',
              text: 'X',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
            { type: 'text', text: ' X' },
          ],
        },
      ],
    })
    expect(editor.getHTML()).not.toContain('<em>')
  })

  it('returns false for navigation and replacement without a match', () => {
    const editor = createEditor('<p>维护</p>')

    openAndSearch(editor, '不存在')
    expect(goToNextSearchMatchAction.run(editor)).toBe(false)
    expect(goToPreviousSearchMatchAction.run(editor)).toBe(false)
    expect(replaceCurrentSearchMatchAction.run(editor, 'X')).toBe(false)
    expect(replaceAllSearchMatchesAction.run(editor, 'X')).toBe(false)
    expect(editor.getHTML()).toBe('<p>维护</p>')
  })

  it('clears search state and closes while retaining query preferences', () => {
    const editor = createEditor('<p>ABC abc</p>')

    openAndSearch(editor, 'abc')
    setSearchReplaceCaseSensitiveAction.run(editor, true)
    expect(closeSearchReplaceAction.run(editor)).toBe(true)
    expect(getSearchReplaceState(editor)).toMatchObject({
      active: false,
      query: 'abc',
      caseSensitive: true,
      currentIndex: -1,
    })
    expect(editor.view.dom.querySelector(`.${searchReplaceMatchClass}`)).toBeNull()

    expect(openSearchReplaceAction.run(editor)).toBe(true)
    expect(clearSearchReplaceAction.run(editor)).toBe(true)
    expect(getSearchReplaceState(editor)).toMatchObject({
      active: true,
      query: '',
      caseSensitive: true,
      matches: [],
      currentIndex: -1,
    })
  })

  it('opens with Mod-f only while the editor is focused and editable', () => {
    const editor = createEditor()

    editor.view.dom.blur()
    expect(dispatchModF(editor).defaultPrevented).toBe(false)
    expect(getSearchReplaceState(editor).active).toBe(false)

    editor.view.focus()
    const focusedEvent = dispatchModF(editor)
    expect(getSearchReplaceState(editor).active).toBe(true)
    expect(focusedEvent.defaultPrevented).toBe(true)

    editor.commands.closeSearchReplace()
    editor.setEditable(false)
    expect(dispatchModF(editor).defaultPrevented).toBe(false)
    expect(getSearchReplaceState(editor).active).toBe(false)
  })
})
