import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection } from '@tiptap/pm/state'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageDialog from '../../../../src/features/image/vue/ImageDialog.vue'
import ImageDialogHost from '../../../../src/features/image/vue/ImageDialogHost.vue'
import {
  getRichTextImageDialogController,
  resolveRichTextImageAnchorTarget,
} from '../../../../src/features/image/vue/dialog-controller'
import { createTestEditor } from '../../../helpers/editor'

const imageAttrs = {
  src: '/images/context.png',
  alt: '上下文图片',
  width: 640,
  height: 360,
}

function createEditor(content = '<p>/图片</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...imageFeature.documentExtensions!()],
    content,
  })
}

function mountHost(editor: ReturnType<typeof createEditor>) {
  return mount(ImageDialogHost, {
    global: { stubs: { teleport: true } },
    props: { editor: markRaw(editor) },
  })
}

function deleteSlashQuery(editor: ReturnType<typeof createEditor>) {
  return editor
    .chain()
    .command(({ tr }) => {
      closeHistory(tr)
      return true
    })
    .deleteRange({ from: 1, to: 4 })
    .run()
}

describe('ImageDialogHost', () => {
  it('keeps slash deletion and confirmed insertion as two history events', async () => {
    const editor = createEditor()
    expect(deleteSlashQuery(editor)).toBe(true)
    const target = resolveRichTextImageAnchorTarget(editor, 0)
    expect(target).not.toBeNull()

    const wrapper = mountHost(editor)
    getRichTextImageDialogController(editor).open('slash', target!, {
      upload: vi.fn(),
    })
    await flushPromises()

    wrapper.getComponent(ImageDialog).vm.$emit('confirm', imageAttrs)
    await flushPromises()

    expect(editor.state.selection).toBeInstanceOf(NodeSelection)
    expect(editor.state.doc.firstChild?.type.name).toBe('image')

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('cancels slash insertion without adding a second history event', async () => {
    const editor = createEditor()
    expect(deleteSlashQuery(editor)).toBe(true)
    const target = resolveRichTextImageAnchorTarget(editor, 0)
    const wrapper = mountHost(editor)

    getRichTextImageDialogController(editor).open('slash', target!, {
      upload: vi.fn(),
    })
    await flushPromises()
    wrapper.getComponent(ImageDialog).vm.$emit('update:show', false)
    await flushPromises()

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('invalidates a fixed anchor after an external document change', async () => {
    const editor = createEditor('<p></p>')
    const controller = getRichTextImageDialogController(editor)
    const target = resolveRichTextImageAnchorTarget(editor, 0)
    const wrapper = mountHost(editor)

    controller.open('plus', target!, { upload: vi.fn() })
    await flushPromises()
    expect(wrapper.findComponent(ImageDialog).exists()).toBe(true)

    editor.commands.insertContent('external')
    await flushPromises()

    expect(controller.session.value).toBeNull()
    expect(wrapper.findComponent(ImageDialog).exists()).toBe(false)
    expect(editor.getText()).toBe('external')
  })
})
