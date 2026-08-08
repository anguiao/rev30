import { Extension, type AnyExtension } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/vue-3'
import { describe, expect, it } from 'vitest'
import { defineRichTextFeature } from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import type { RichTextPasteRule } from '../../src/editor/paste'
import {
  collectRichTextEditorExtensions,
  defineRichTextEditorFeature,
} from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/core/feature'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { createTestEditor } from '../helpers/editor'

interface ClipboardContents {
  readonly text?: string
  readonly html?: string
  readonly files?: readonly File[]
}

function createFileList(files: readonly File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as FileList
}

function createClipboardEvent(contents: ClipboardContents = {}): ClipboardEvent {
  return {
    clipboardData: {
      files: createFileList(contents.files ?? []),
      getData(type: string) {
        if (type === 'text/plain') {
          return contents.text ?? ''
        }

        return type === 'text/html' ? (contents.html ?? '') : ''
      },
    } as DataTransfer,
  } as ClipboardEvent
}

function callPasteHandler(editor: Editor, event: ClipboardEvent) {
  const slice = new Slice(Fragment.from(editor.schema.text('剪贴板内容')), 0, 0)

  return editor.view.someProp('handlePaste', (handler) => handler(editor.view, event, slice))
}

function dispatchTextPaste(editor: Editor, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: createClipboardEvent({ text }).clipboardData,
  })

  editor.view.dom.dispatchEvent(event)
}

function createEditor(
  rules: readonly [
    RichTextPasteRule | undefined,
    RichTextPasteRule | undefined,
    RichTextPasteRule | undefined,
  ],
  editorExtensions: readonly AnyExtension[] = [],
) {
  const firstFeature = defineRichTextFeature({
    key: 'first-paste-rule',
    editorImplementation: true,
    serverImplementation: false,
  })
  const secondFeature = defineRichTextFeature({
    key: 'second-paste-rule',
    editorImplementation: true,
    serverImplementation: false,
  })
  const thirdFeature = defineRichTextFeature({
    key: 'third-paste-rule',
    editorImplementation: true,
    serverImplementation: false,
  })
  const preset = defineRichTextPreset({
    key: 'paste-rules',
    features: [baseFeature, firstFeature, secondFeature, thirdFeature],
  })
  const firstEditorFeature = defineRichTextEditorFeature(firstFeature, {
    ...(rules[0] ? { pasteRule: rules[0] } : {}),
  })
  const secondEditorFeature = defineRichTextEditorFeature(secondFeature, {
    ...(rules[1] ? { pasteRule: rules[1] } : {}),
  })
  const thirdEditorFeature = defineRichTextEditorFeature(thirdFeature, {
    ...(rules[2] ? { pasteRule: rules[2] } : {}),
  })
  const editorPreset = defineRichTextEditorPreset(preset, {
    // Deliberately not in feature order: the collector must use preset.features.
    editorFeatures: [
      baseEditorFeature,
      thirdEditorFeature,
      firstEditorFeature,
      secondEditorFeature,
    ],
  })

  return createTestEditor({
    extensions: [...editorExtensions, ...collectRichTextEditorExtensions(editorPreset)],
    content: '<p>旧内容</p>',
  })
}

describe('rich text paste feature integration', () => {
  it('composes HTML transforms in preset feature order', () => {
    const editor = createEditor([
      { transformHTML: (html) => html.replace('初始', '第一') },
      { transformHTML: (html) => `${html}<!--第二-->` },
      undefined,
    ])

    expect(editor.view.props.transformPastedHTML?.('<p>初始</p>', editor.view)).toBe(
      '<p>第一</p><!--第二-->',
    )
  })

  it('stops handlers at the first rule that consumes the paste', () => {
    const calls: string[] = []
    const editor = createEditor([
      {
        handlePaste() {
          calls.push('first')
          return false
        },
      },
      {
        handlePaste() {
          calls.push('second')
          return true
        },
      },
      {
        handlePaste() {
          calls.push('third')
          return true
        },
      },
    ])

    expect(callPasteHandler(editor, createClipboardEvent({ text: 'https://example.com' }))).toBe(
      true,
    )
    expect(calls).toEqual(['first', 'second'])
  })

  it('queries collected rules before another default-priority paste consumer', () => {
    const calls: string[] = []
    const editor = createEditor(
      [
        {
          handlePaste() {
            calls.push('collector')
            return false
          },
        },
        undefined,
        undefined,
      ],
      [
        Extension.create({
          name: 'testPasteConsumer',
          addProseMirrorPlugins() {
            return [
              new Plugin({
                props: {
                  handlePaste() {
                    calls.push('consumer')
                    return true
                  },
                },
              }),
            ]
          },
        }),
      ],
    )

    expect(callPasteHandler(editor, createClipboardEvent({ text: 'https://example.com' }))).toBe(
      true,
    )
    expect(calls).toEqual(['collector', 'consumer'])
  })

  it('leaves a paste to ProseMirror when all enabled rules return false', () => {
    const editor = createEditor([
      { handlePaste: () => false },
      { handlePaste: () => false },
      undefined,
    ])
    editor.commands.setTextSelection({ from: 1, to: 4 })

    dispatchTextPaste(editor, '新内容')

    expect(editor.getText()).toBe('新内容')
  })

  it('does not add paste behavior when no enabled editor feature declares a rule', () => {
    const editor = createEditor([undefined, undefined, undefined])
    editor.commands.setTextSelection({ from: 1, to: 4 })

    dispatchTextPaste(editor, '默认内容')

    expect(editor.getText()).toBe('默认内容')
  })
})
