import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextFeature } from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import {
  collectRichTextEditorExtensions,
  defineRichTextEditorFeature,
} from '../../src/editor/feature'
import { defineRichTextInteraction } from '../../src/editor/interaction'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { createTestEditor } from '../helpers/editor'

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
  interactions: [testInteraction.interaction],
})

const preset = defineRichTextPreset({
  key: 'interaction-preset',
  features: [interactionFeature],
})

describe('rich text interactions', () => {
  it('binds a typed handler through the owning editor feature', () => {
    const handle = vi.fn()
    const editorPreset = defineRichTextEditorPreset(preset, {
      editorFeatures: [editorFeature],
      interactionHandlers: [testInteraction.defineHandler(handle)],
    })
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...collectRichTextEditorExtensions(editorPreset)],
      content: '<p></p>',
    })

    testInteraction.request(editor, 'payload')

    expect(handle).toHaveBeenCalledWith(editor, 'payload')
    expect(editorPreset).not.toHaveProperty('interactionHandlers')
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
