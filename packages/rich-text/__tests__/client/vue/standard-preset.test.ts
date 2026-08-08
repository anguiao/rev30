import { DOMWrapper, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { runRichTextAction } from '../../../src/client/editor/action'
import { collectRichTextEditorExtensions } from '../../../src/client/editor/feature'
import { blockquoteAction } from '../../../src/features/blockquote/client/editor'
import { headingActions } from '../../../src/features/heading/client/editor'
import { horizontalRuleAction } from '../../../src/features/horizontal-rule/client/editor'
import { openImagePicker } from '../../../src/features/image/client/editor'
import { listActions } from '../../../src/features/list/client/editor'
import { strikeAction } from '../../../src/features/strike/client/editor'
import { textAlignActions } from '../../../src/features/text-align/client/editor'
import { underlineAction } from '../../../src/features/underline/client/editor'
import { createStandardRichTextEditorPreset } from '../../../src/client/vue/presets/standard'
import { createTestEditor } from '../../helpers/editor'

function createStandardEditor(
  upload: (file: File) => Promise<{ src: string }> = async (file) => ({
    src: `/api/attachments/${file.name}/content`,
  }),
  content = '<p>标准正文</p>',
) {
  const preset = createStandardRichTextEditorPreset({ image: { upload } })

  return createTestEditor({
    extensions: collectRichTextEditorExtensions(preset),
    content,
  })
}

describe('standard rich text editor preset', () => {
  it('binds image picker uploads to the injected image handler', async () => {
    const imageFile = new File(['image'], 'notice.png', { type: 'image/png' })
    const upload = vi.fn(async (file: File) => ({
      src: `/api/attachments/${file.name}/content`,
    }))
    const editor = createStandardEditor(upload)

    openImagePicker(editor, imageFile)
    await flushPromises()

    const dialog = new DOMWrapper(document.body)
    await dialog.get('[data-test="rich-text-image-upload-action"]').trigger('click')
    await flushPromises()

    expect(upload).toHaveBeenCalledWith(imageFile)

    await dialog.get('[data-test="rich-text-image-cancel"]').trigger('click')
  })

  it('runs its enabled formatting and block commands', () => {
    const marksEditor = createStandardEditor()
    marksEditor.commands.setTextSelection({ from: 1, to: 5 })

    expect(runRichTextAction(marksEditor, underlineAction)).toBe(true)
    expect(runRichTextAction(marksEditor, strikeAction)).toBe(true)
    expect(marksEditor.isActive('underline')).toBe(true)
    expect(marksEditor.isActive('strike')).toBe(true)

    const headingEditor = createStandardEditor()
    expect(runRichTextAction(headingEditor, headingActions[2])).toBe(true)
    expect(runRichTextAction(headingEditor, textAlignActions[1])).toBe(true)
    expect(headingEditor.state.doc.firstChild).toMatchObject({
      type: { name: 'heading' },
      attrs: { level: 3, textAlign: 'center' },
    })

    const blockquoteEditor = createStandardEditor()
    expect(runRichTextAction(blockquoteEditor, blockquoteAction)).toBe(true)
    expect(blockquoteEditor.state.doc.firstChild?.type.name).toBe('blockquote')

    const listEditor = createStandardEditor()
    expect(runRichTextAction(listEditor, listActions[0])).toBe(true)
    expect(listEditor.state.doc.firstChild?.type.name).toBe('bulletList')

    const horizontalRuleEditor = createStandardEditor()
    expect(runRichTextAction(horizontalRuleEditor, horizontalRuleAction)).toBe(true)
    expect(
      horizontalRuleEditor.state.doc.content.content.some(
        (node) => node.type.name === 'horizontalRule',
      ),
    ).toBe(true)
  })
})
