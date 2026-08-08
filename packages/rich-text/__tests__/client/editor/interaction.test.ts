import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/core'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextFeature } from '../../../src/core/feature'
import { defineRichTextPreset } from '../../../src/core/preset'
import {
  collectRichTextEditorExtensions,
  defineRichTextEditorFeature,
} from '../../../src/client/editor/feature'
import { defineRichTextInteraction } from '../../../src/client/editor/interaction'
import { defineRichTextEditorPreset } from '../../../src/client/vue/preset'
import { createTestEditor } from '../../helpers/editor'

const interactionFeature = defineRichTextFeature({
  key: 'interaction-test',
  editorImplementation: true,
  serverImplementation: false,
})

const testInteraction = defineRichTextInteraction<typeof interactionFeature, string>(
  interactionFeature,
  'open',
)

const editorFeature = defineRichTextEditorFeature(interactionFeature, {
  interactions: [testInteraction],
})

const preset = defineRichTextPreset({
  key: 'interaction-preset',
  features: [interactionFeature],
})

describe('rich text interactions', () => {
  it('binds a typed handler through the owning editor feature after applying its transaction', () => {
    const handle = vi.fn((editor: Editor, _payload: string) => {
      expect(editor.getText()).toBe('committed')
    })
    const editorPreset = defineRichTextEditorPreset(preset, {
      editorFeatures: [editorFeature],
      interactionHandlers: [testInteraction.defineHandler(handle)],
    })
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...collectRichTextEditorExtensions(editorPreset)],
      content: '<p></p>',
    })

    expect(
      editor
        .chain()
        .insertContent('committed')
        .command((props) => testInteraction.command(props, 'payload'))
        .run(),
    ).toBe(true)

    expect(handle).toHaveBeenCalledWith(editor, 'payload')
    expect(editor.getText()).toBe('committed')
    expect(editorPreset).not.toHaveProperty('interactionHandlers')
  })

  it('does not invoke a handler while checking whether a request can run', () => {
    const handle = vi.fn()
    const editorPreset = defineRichTextEditorPreset(preset, {
      editorFeatures: [editorFeature],
      interactionHandlers: [testInteraction.defineHandler(handle)],
    })
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...collectRichTextEditorExtensions(editorPreset)],
      content: '<p></p>',
    })

    expect(editor.can().command((props) => testInteraction.command(props, 'payload'))).toBe(true)
    expect(handle).not.toHaveBeenCalled()

    expect(testInteraction.request(editor, 'payload')).toBe(true)
    expect(handle).toHaveBeenCalledWith(editor, 'payload')
  })

  it('validates required handlers without knowing a concrete feature', () => {
    const handler = testInteraction.defineHandler(vi.fn())

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorFeature],
      }),
    ).toThrow(
      'Rich text preset "interaction-preset" is missing the interaction handler: "interaction-test:open"',
    )

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorFeature],
        interactionHandlers: [handler],
      }),
    ).not.toThrow()

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [editorFeature],
        interactionHandlers: [handler, handler],
      }),
    ).toThrow(
      'Rich text preset "interaction-preset" has a duplicate interaction handler: "interaction-test:open"',
    )
  })
})
