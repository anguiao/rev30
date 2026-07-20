import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { defineRichTextAction, runRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { searchReplaceFeature } from './shared'

export interface RichTextSearchMatch {
  readonly from: number
  readonly to: number
}

export interface RichTextSearchReplaceState {
  readonly isOpen: boolean
  readonly query: string
  readonly caseSensitive: boolean
  readonly matches: readonly RichTextSearchMatch[]
  readonly currentIndex: number
}

type SearchReplaceUpdate =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'set-query'; readonly query: string }
  | { readonly type: 'set-case-sensitive'; readonly caseSensitive: boolean }
  | { readonly type: 'set-current-index'; readonly currentIndex: number }
  | { readonly type: 'refresh-matches'; readonly position: number }

const searchReplaceMatchClass = 'rich-text-search-match'
const searchReplaceCurrentMatchClass = 'rich-text-search-match-current'

const searchReplacePluginKey = new PluginKey<RichTextSearchReplaceState>('searchReplace')

function escapeRegularExpression(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findSearchMatches(
  document: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): RichTextSearchMatch[] {
  if (!query) {
    return []
  }

  const matcher = new RegExp(escapeRegularExpression(query), caseSensitive ? 'gu' : 'giu')
  const matches: RichTextSearchMatch[] = []

  document.descendants((node, position) => {
    if (!node.isTextblock) {
      return
    }

    let runText = ''
    let runStart = position + 1

    const collectRunMatches = () => {
      for (const match of runText.matchAll(matcher)) {
        matches.push({
          from: runStart + match.index,
          to: runStart + match.index + match[0].length,
        })
      }
    }

    node.forEach((child, offset) => {
      if (child.isText) {
        if (!runText) {
          runStart = position + 1 + offset
        }

        runText += child.text!
        return
      }

      collectRunMatches()
      runText = ''
    })

    collectRunMatches()
    return false
  })

  return matches
}

function findCurrentMatchIndex(matches: readonly RichTextSearchMatch[], position: number) {
  const containingIndex = matches.findIndex(
    (match) => match.from <= position && position < match.to,
  )

  if (containingIndex >= 0) {
    return containingIndex
  }

  const followingIndex = matches.findIndex((match) => match.from >= position)
  return followingIndex >= 0 ? followingIndex : matches.length ? 0 : -1
}

function replaceSearchMatch(
  transaction: Transaction,
  match: RichTextSearchMatch,
  replacement: string,
) {
  if (transaction.doc.textBetween(match.from, match.to) === replacement) {
    return
  }

  if (!replacement) {
    transaction.deleteRange(match.from, match.to)
    return
  }

  const marks = transaction.doc.resolve(match.from).nodeAfter?.marks ?? []
  const replacementNode = transaction.doc.type.schema.text(replacement, marks)
  transaction.replaceWith(match.from, match.to, replacementNode)
}

function applySearchReplaceState(
  transaction: Transaction,
  previousState: RichTextSearchReplaceState,
  document: ProseMirrorNode,
  selectionFrom: number,
) {
  const update = transaction.getMeta(searchReplacePluginKey) as SearchReplaceUpdate | undefined

  if (!update && (!transaction.docChanged || !previousState.isOpen)) {
    return previousState
  }

  if (update?.type === 'set-current-index') {
    return { ...previousState, currentIndex: update.currentIndex }
  }

  const isOpen =
    update?.type === 'open' ? true : update?.type === 'close' ? false : previousState.isOpen
  const query = update?.type === 'set-query' ? update.query : previousState.query
  const caseSensitive =
    update?.type === 'set-case-sensitive' ? update.caseSensitive : previousState.caseSensitive

  if (!isOpen) {
    return {
      ...previousState,
      isOpen,
      query,
      caseSensitive,
      matches: [],
      currentIndex: -1,
    }
  }

  const matches = findSearchMatches(document, query, caseSensitive)
  const previousMatch = previousState.matches[previousState.currentIndex]
  const position =
    update?.type === 'refresh-matches'
      ? update.position
      : transaction.docChanged && previousMatch
        ? transaction.mapping.map(previousMatch.from)
        : selectionFrom

  return {
    isOpen,
    query,
    caseSensitive,
    matches,
    currentIndex: findCurrentMatchIndex(matches, position),
  }
}

export function getSearchReplaceState(editor: Editor): RichTextSearchReplaceState {
  return getSearchReplaceStateFromEditorState(editor.state)
}

function getSearchReplaceStateFromEditorState(state: EditorState) {
  const searchState = searchReplacePluginKey.getState(state)

  if (!searchState) {
    throw new Error('The search-replace editor feature is not registered')
  }

  return searchState
}

function setSearchReplaceUpdate(
  transaction: Transaction,
  update: SearchReplaceUpdate,
  addToHistory = false,
) {
  transaction.setMeta(searchReplacePluginKey, update)

  if (!addToHistory) {
    transaction.setMeta('addToHistory', false)
  }
}

function goToSearchMatch(
  state: EditorState,
  transaction: Transaction,
  dispatch: ((args?: unknown) => unknown) | undefined,
  direction: 'next' | 'previous',
) {
  const searchState = getSearchReplaceStateFromEditorState(state)

  if (!searchState.matches.length) {
    return false
  }

  if (dispatch) {
    const offset = direction === 'next' ? 1 : -1
    const index =
      (searchState.currentIndex + offset + searchState.matches.length) % searchState.matches.length
    const match = searchState.matches[index]!
    transaction
      .setSelection(TextSelection.create(transaction.doc, match.from, match.to))
      .scrollIntoView()
    setSearchReplaceUpdate(transaction, {
      type: 'set-current-index',
      currentIndex: index,
    })
  }

  return true
}

function replaceCurrentSearchMatch(
  editor: Editor,
  state: EditorState,
  transaction: Transaction,
  dispatch: ((args?: unknown) => unknown) | undefined,
  replacement: string,
) {
  if (!editor.isEditable) {
    return false
  }

  const searchState = getSearchReplaceStateFromEditorState(state)
  const match = searchState.matches[searchState.currentIndex]

  if (!match) {
    return false
  }

  if (dispatch) {
    replaceSearchMatch(transaction, match, replacement)
    setSearchReplaceUpdate(
      transaction,
      {
        type: 'refresh-matches',
        position: match.from + replacement.length,
      },
      true,
    )
  }

  return true
}

function replaceAllSearchMatches(
  editor: Editor,
  state: EditorState,
  transaction: Transaction,
  dispatch: ((args?: unknown) => unknown) | undefined,
  replacement: string,
) {
  if (!editor.isEditable) {
    return false
  }

  const searchState = getSearchReplaceStateFromEditorState(state)

  if (!searchState.matches.length) {
    return false
  }

  if (dispatch) {
    for (let index = searchState.matches.length - 1; index >= 0; index--) {
      replaceSearchMatch(transaction, searchState.matches[index]!, replacement)
    }

    setSearchReplaceUpdate(
      transaction,
      {
        type: 'refresh-matches',
        position: searchState.matches[0]!.from + replacement.length,
      },
      true,
    )
  }

  return true
}

const SearchReplace = Extension.create({
  name: 'searchReplace',

  addKeyboardShortcuts() {
    return {
      'Mod-f': () =>
        this.editor.isFocused && runRichTextAction(this.editor, openSearchReplaceAction),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<RichTextSearchReplaceState>({
        key: searchReplacePluginKey,
        state: {
          init: () => ({
            isOpen: false,
            query: '',
            caseSensitive: false,
            matches: [],
            currentIndex: -1,
          }),
          apply: (transaction, previous, _oldState, newState) =>
            applySearchReplaceState(transaction, previous, newState.doc, newState.selection.from),
        },
        props: {
          decorations: (state) => {
            const searchState = searchReplacePluginKey.getState(state)

            if (!searchState?.isOpen || !searchState.matches.length) {
              return DecorationSet.empty
            }

            return DecorationSet.create(
              state.doc,
              searchState.matches.map((match, index) =>
                Decoration.inline(match.from, match.to, {
                  class:
                    index === searchState.currentIndex
                      ? `${searchReplaceMatchClass} ${searchReplaceCurrentMatchClass}`
                      : searchReplaceMatchClass,
                  'data-search-replace-match': '',
                  ...(index === searchState.currentIndex
                    ? { 'data-search-replace-current': '' }
                    : {}),
                }),
              ),
            )
          },
        },
      }),
    ]
  },
})

export const openSearchReplaceAction = defineRichTextAction(searchReplaceFeature, {
  key: 'open-search-replace',
  command:
    () =>
    ({ editor, tr, dispatch }) => {
      if (!editor.isEditable) {
        return false
      }

      if (dispatch) {
        setSearchReplaceUpdate(tr, { type: 'open' })
      }

      return true
    },
  isActive: (editor) => getSearchReplaceState(editor).isOpen,
})

export const closeSearchReplaceAction = defineRichTextAction(searchReplaceFeature, {
  key: 'close-search-replace',
  command:
    () =>
    ({ state, tr, dispatch }) => {
      if (!getSearchReplaceStateFromEditorState(state).isOpen) {
        return false
      }

      if (dispatch) {
        setSearchReplaceUpdate(tr, { type: 'close' })
      }

      return true
    },
})

export const setSearchQueryAction = defineRichTextAction(searchReplaceFeature, {
  key: 'set-search-query',
  command:
    (query: string) =>
    ({ tr, dispatch }) => {
      if (dispatch) {
        setSearchReplaceUpdate(tr, { type: 'set-query', query })
      }

      return true
    },
})

export const setSearchCaseSensitiveAction = defineRichTextAction(searchReplaceFeature, {
  key: 'set-search-case-sensitive',
  command:
    (caseSensitive: boolean) =>
    ({ tr, dispatch }) => {
      if (dispatch) {
        setSearchReplaceUpdate(tr, { type: 'set-case-sensitive', caseSensitive })
      }

      return true
    },
})

export const goToNextSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'next-search-match',
  command:
    () =>
    ({ state, tr, dispatch }) =>
      goToSearchMatch(state, tr, dispatch, 'next'),
})

export const goToPreviousSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'previous-search-match',
  command:
    () =>
    ({ state, tr, dispatch }) =>
      goToSearchMatch(state, tr, dispatch, 'previous'),
})

export const replaceCurrentSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'replace-current-search-match',
  command:
    (replacement: string) =>
    ({ editor, state, tr, dispatch }) =>
      replaceCurrentSearchMatch(editor, state, tr, dispatch, replacement),
})

export const replaceAllSearchMatchesAction = defineRichTextAction(searchReplaceFeature, {
  key: 'replace-all-search-matches',
  command:
    (replacement: string) =>
    ({ editor, state, tr, dispatch }) =>
      replaceAllSearchMatches(editor, state, tr, dispatch, replacement),
})

export const searchReplaceEditorFeature = defineRichTextEditorFeature(searchReplaceFeature, {
  extensions: () => [SearchReplace],
})
