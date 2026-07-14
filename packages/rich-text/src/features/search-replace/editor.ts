import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { defineRichTextAction } from '../../editor/action'
import { defineRichTextEditorFeature } from '../../editor/feature'
import { searchReplaceFeature } from './shared'

export interface RichTextSearchMatch {
  readonly from: number
  readonly to: number
}

export interface RichTextSearchReplaceState {
  readonly active: boolean
  readonly query: string
  readonly caseSensitive: boolean
  readonly matches: readonly RichTextSearchMatch[]
  readonly currentIndex: number
}

type SearchReplaceMeta =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'set-query'; readonly query: string }
  | { readonly type: 'set-case-sensitive'; readonly caseSensitive: boolean }
  | { readonly type: 'next' }
  | { readonly type: 'previous' }
  | { readonly type: 'clear' }
  | { readonly type: 'replace'; readonly anchor: number }
  | { readonly type: 'replace-all'; readonly anchor: number }

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchReplace: {
      openSearchReplace: () => ReturnType
      closeSearchReplace: () => ReturnType
      setSearchQuery: (query: string) => ReturnType
      setSearchCaseSensitive: (caseSensitive: boolean) => ReturnType
      goToNextSearchMatch: () => ReturnType
      goToPreviousSearchMatch: () => ReturnType
      replaceCurrentSearchMatch: (replacement: string) => ReturnType
      replaceAllSearchMatches: (replacement: string) => ReturnType
      clearSearchReplace: () => ReturnType
    }
  }
}

export const searchReplaceMatchClass = 'rich-text-search-match'
export const searchReplaceCurrentMatchClass = 'rich-text-search-match-current'

export const searchReplacePluginKey = new PluginKey<RichTextSearchReplaceState>('searchReplace')

const initialSearchReplaceState: RichTextSearchReplaceState = {
  active: false,
  query: '',
  caseSensitive: false,
  matches: [],
  currentIndex: -1,
}

function escapeRegularExpression(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findTextMatches(
  document: ProseMirrorNode,
  query: string,
  caseSensitive: boolean,
): RichTextSearchMatch[] {
  if (!query) {
    return []
  }

  const expression = new RegExp(escapeRegularExpression(query), caseSensitive ? 'gu' : 'giu')
  const matches: RichTextSearchMatch[] = []

  document.descendants((node, position) => {
    if (!node.isTextblock) {
      return
    }

    let runText = ''
    let runPosition = position + 1

    const collectRunMatches = () => {
      for (const match of runText.matchAll(expression)) {
        matches.push({
          from: runPosition + match.index,
          to: runPosition + match.index + match[0].length,
        })
      }
    }

    node.forEach((child, offset) => {
      if (child.isText) {
        if (!runText) {
          runPosition = position + 1 + offset
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

function findCurrentIndex(matches: readonly RichTextSearchMatch[], anchor: number) {
  const containingIndex = matches.findIndex((match) => match.from <= anchor && anchor < match.to)

  if (containingIndex >= 0) {
    return containingIndex
  }

  const followingIndex = matches.findIndex((match) => match.from >= anchor)
  return followingIndex >= 0 ? followingIndex : matches.length ? 0 : -1
}

function replaceTextMatch(
  transaction: Transaction,
  match: RichTextSearchMatch,
  replacement: string,
) {
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
  previous: RichTextSearchReplaceState,
  newDocument: ProseMirrorNode,
  selectionAnchor: number,
) {
  const meta = transaction.getMeta(searchReplacePluginKey) as SearchReplaceMeta | undefined

  if (!meta && !transaction.docChanged) {
    return previous
  }

  if (meta?.type === 'close') {
    return {
      ...previous,
      active: false,
      currentIndex: -1,
    }
  }

  if (meta?.type === 'clear') {
    return {
      ...previous,
      query: '',
      matches: [],
      currentIndex: -1,
    }
  }

  if (meta?.type === 'next' || meta?.type === 'previous') {
    if (!previous.active || !previous.matches.length) {
      return previous
    }

    const offset = meta.type === 'next' ? 1 : -1
    const currentIndex =
      (previous.currentIndex + offset + previous.matches.length) % previous.matches.length

    return { ...previous, currentIndex }
  }

  const active = meta?.type === 'open' ? true : previous.active
  const query = meta?.type === 'set-query' ? meta.query : previous.query
  const caseSensitive =
    meta?.type === 'set-case-sensitive' ? meta.caseSensitive : previous.caseSensitive
  const shouldRefresh =
    transaction.docChanged ||
    meta?.type === 'open' ||
    meta?.type === 'set-query' ||
    meta?.type === 'set-case-sensitive' ||
    meta?.type === 'replace' ||
    meta?.type === 'replace-all'

  if (!shouldRefresh) {
    return { ...previous, active, query, caseSensitive }
  }

  if (!active && transaction.docChanged && !meta) {
    return previous
  }

  const matches = findTextMatches(newDocument, query, caseSensitive)
  const previousMatch = previous.matches[previous.currentIndex]
  const anchor =
    meta?.type === 'replace' || meta?.type === 'replace-all'
      ? meta.anchor
      : transaction.docChanged && previousMatch
        ? transaction.mapping.map(previousMatch.from)
        : selectionAnchor

  return {
    active,
    query,
    caseSensitive,
    matches,
    currentIndex: findCurrentIndex(matches, anchor),
  }
}

export function getSearchReplaceState(editor: Editor): RichTextSearchReplaceState {
  const state = searchReplacePluginKey.getState(editor.state)

  if (!state) {
    throw new Error('The search-replace editor feature is not registered')
  }

  return state
}

const SearchReplace = Extension.create({
  name: 'searchReplace',

  addCommands() {
    const setMeta = (transaction: Transaction, meta: SearchReplaceMeta) => {
      transaction.setMeta(searchReplacePluginKey, meta).setMeta('addToHistory', false)
    }

    return {
      openSearchReplace:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            setMeta(tr, { type: 'open' })
          }

          return true
        },
      closeSearchReplace:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            setMeta(tr, { type: 'close' })
          }

          return true
        },
      setSearchQuery:
        (query) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            setMeta(tr, { type: 'set-query', query })
          }

          return true
        },
      setSearchCaseSensitive:
        (caseSensitive) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            setMeta(tr, { type: 'set-case-sensitive', caseSensitive })
          }

          return true
        },
      goToNextSearchMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const searchState = searchReplacePluginKey.getState(state)

          if (!searchState?.active || !searchState.matches.length) {
            return false
          }

          if (dispatch) {
            const nextIndex = (searchState.currentIndex + 1) % searchState.matches.length
            const match = searchState.matches[nextIndex]!
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
            setMeta(tr, { type: 'next' })
          }

          return true
        },
      goToPreviousSearchMatch:
        () =>
        ({ state, tr, dispatch }) => {
          const searchState = searchReplacePluginKey.getState(state)

          if (!searchState?.active || !searchState.matches.length) {
            return false
          }

          if (dispatch) {
            const previousIndex =
              (searchState.currentIndex - 1 + searchState.matches.length) %
              searchState.matches.length
            const match = searchState.matches[previousIndex]!
            tr.setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView()
            setMeta(tr, { type: 'previous' })
          }

          return true
        },
      replaceCurrentSearchMatch:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const searchState = searchReplacePluginKey.getState(state)
          const match = searchState?.matches[searchState.currentIndex]

          if (!searchState?.active || !match) {
            return false
          }

          if (dispatch) {
            replaceTextMatch(tr, match, replacement)
            tr.setMeta(searchReplacePluginKey, {
              type: 'replace',
              anchor: match.from + replacement.length,
            } satisfies SearchReplaceMeta)
          }

          return true
        },
      replaceAllSearchMatches:
        (replacement) =>
        ({ state, tr, dispatch }) => {
          const searchState = searchReplacePluginKey.getState(state)

          if (!searchState?.active || !searchState.matches.length) {
            return false
          }

          if (dispatch) {
            for (let index = searchState.matches.length - 1; index >= 0; index--) {
              const match = searchState.matches[index]!
              replaceTextMatch(tr, match, replacement)
            }

            const firstMatch = searchState.matches[0]!
            tr.setMeta(searchReplacePluginKey, {
              type: 'replace-all',
              anchor: firstMatch.from + replacement.length,
            } satisfies SearchReplaceMeta)
          }

          return true
        },
      clearSearchReplace:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            setMeta(tr, { type: 'clear' })
          }

          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () =>
        this.editor.isEditable && this.editor.isFocused && this.editor.commands.openSearchReplace(),
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<RichTextSearchReplaceState>({
        key: searchReplacePluginKey,
        state: {
          init: () => initialSearchReplaceState,
          apply: (transaction, previous, _oldState, newState) =>
            applySearchReplaceState(transaction, previous, newState.doc, newState.selection.from),
        },
        props: {
          decorations: (state) => {
            const searchState = searchReplacePluginKey.getState(state)

            if (!searchState?.active || !searchState.matches.length) {
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
  run: (editor) => editor.commands.openSearchReplace(),
  isActive: (editor) => getSearchReplaceState(editor).active,
  canRun: (editor) => editor.isEditable,
})

export const closeSearchReplaceAction = defineRichTextAction(searchReplaceFeature, {
  key: 'close-search-replace',
  run: (editor) => editor.commands.closeSearchReplace(),
  canRun: (editor) => getSearchReplaceState(editor).active,
})

export const setSearchReplaceQueryAction = defineRichTextAction(searchReplaceFeature, {
  key: 'set-search-replace-query',
  run: (editor, query: string) => editor.commands.setSearchQuery(query),
})

export const setSearchReplaceCaseSensitiveAction = defineRichTextAction(searchReplaceFeature, {
  key: 'set-search-replace-case-sensitive',
  run: (editor, caseSensitive: boolean) => editor.commands.setSearchCaseSensitive(caseSensitive),
})

export const goToNextSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'next-search-match',
  run: (editor) => editor.commands.goToNextSearchMatch(),
  canRun: (editor) => editor.can().goToNextSearchMatch(),
})

export const goToPreviousSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'previous-search-match',
  run: (editor) => editor.commands.goToPreviousSearchMatch(),
  canRun: (editor) => editor.can().goToPreviousSearchMatch(),
})

export const replaceCurrentSearchMatchAction = defineRichTextAction(searchReplaceFeature, {
  key: 'replace-current-search-match',
  run: (editor, replacement: string) => editor.commands.replaceCurrentSearchMatch(replacement),
  canRun: (editor) => editor.can().replaceCurrentSearchMatch(''),
})

export const replaceAllSearchMatchesAction = defineRichTextAction(searchReplaceFeature, {
  key: 'replace-all-search-matches',
  run: (editor, replacement: string) => editor.commands.replaceAllSearchMatches(replacement),
  canRun: (editor) => editor.can().replaceAllSearchMatches(''),
})

export const clearSearchReplaceAction = defineRichTextAction(searchReplaceFeature, {
  key: 'clear-search-replace',
  run: (editor) => editor.commands.clearSearchReplace(),
  canRun: (editor) => Boolean(getSearchReplaceState(editor).query),
})

export const searchReplaceEditorFeature = defineRichTextEditorFeature(searchReplaceFeature, {
  extensions: () => [SearchReplace],
})
