import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { defineComponent, h, markRaw, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import {
  useRichTextLinkEditor,
  type RichTextLinkEditor,
  type RichTextLinkEditorCloseReason,
} from '../../../../src/features/link/vue/useLinkEditor'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content: string) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...linkFeature.documentExtensions!()],
    content,
  })
}

async function mountLinkEditor(editor: Editor) {
  const onClose = vi.fn<(reason: RichTextLinkEditorCloseReason) => void>()
  let controller: RichTextLinkEditor | undefined
  const Harness = defineComponent({
    setup() {
      controller = useRichTextLinkEditor({ editor: markRaw(editor), onClose })
      return () => h('div')
    },
  })

  const wrapper = mount(Harness)
  await nextTick()

  if (!controller) {
    throw new Error('Link editor controller was not created')
  }

  return { controller, onClose, wrapper }
}

describe('useRichTextLinkEditor', () => {
  it('edits a complete link and restores the original selection in one transaction', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接文本</a>末尾</p>')
    editor.commands.setTextSelection({ from: 2, to: 4 })
    const { controller, onClose } = await mountLinkEditor(editor)

    expect(controller.open('text-quickbar')).toBe(true)
    expect(controller.target.value).toMatchObject({
      mode: 'edit',
      range: { from: 1, to: 5 },
    })
    expect(controller.draft.value).toBe('https://old.example')

    editor.commands.setTextSelection(6)
    controller.draft.value = 'new.example'
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    expect(controller.apply()).toBe(true)

    expect(onTransaction).toHaveBeenCalledTimes(1)
    expect(onTransaction.mock.calls[0]?.[0].transaction).toMatchObject({
      docChanged: true,
      selectionSet: true,
    })
    expect(editor.state.selection).toMatchObject({ from: 2, to: 4 })
    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      text: '链接文本',
      marks: [{ type: 'link', attrs: { href: 'https://new.example' } }],
    })
    expect(controller.isOpen.value).toBe(false)
    expect(onClose).toHaveBeenLastCalledWith('success')

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
    })
  })

  it('sets and removes links only inside an exact mixed selection', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接</a>普通</p>')
    editor.commands.setTextSelection({ from: 2, to: 5 })
    const { controller } = await mountLinkEditor(editor)

    expect(controller.open('text-quickbar')).toBe(true)
    expect(controller.target.value).toMatchObject({
      mode: 'set',
      range: { from: 2, to: 5 },
      hasLinkMarks: true,
    })

    controller.draft.value = 'https://new.example'
    expect(controller.apply()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      {
        text: '链',
        marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
      },
      {
        text: '接普通',
        marks: [{ type: 'link', attrs: { href: 'https://new.example' } }],
      },
    ])
    expect(editor.state.selection).toMatchObject({ from: 2, to: 5 })

    expect(controller.open('text-quickbar')).toBe(true)
    expect(controller.remove()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      {
        text: '链',
        marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
      },
      { text: '接普通' },
    ])
  })

  it('supports successful empty application for create and stored targets', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const { controller, onClose } = await mountLinkEditor(editor)
    const before = editor.getJSON()

    expect(controller.open('text-quickbar')).toBe(true)
    expect(controller.target.value?.mode).toBe('create')
    expect(controller.apply()).toBe(true)
    expect(editor.getJSON()).toEqual(before)
    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    expect(onClose).toHaveBeenLastCalledWith('success')

    editor.commands.setTextSelection(3)
    editor.commands.setLink({ href: 'https://stored.example' })
    expect(controller.open('toolbar')).toBe(true)
    expect(controller.target.value).toMatchObject({ mode: 'stored', href: '' })
    expect(controller.draft.value).toBe('')

    controller.draft.value = 'https://next.example'
    expect(controller.apply()).toBe(true)
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.state.storedMarks?.find((mark) => mark.type.name === 'link')?.attrs).toEqual({
      href: 'https://next.example',
    })

    expect(controller.open('toolbar')).toBe(true)
    expect(controller.apply()).toBe(true)
    expect(editor.state.storedMarks?.some((mark) => mark.type.name === 'link')).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })

  it('keeps invalid drafts open and opens only normalized non-empty drafts', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const { controller } = await mountLinkEditor(editor)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    expect(controller.open('text-quickbar')).toBe(true)
    controller.draft.value = 'javascript:alert(1)'

    expect(controller.isInvalid.value).toBe(true)
    expect(controller.apply()).toBe(false)
    expect(controller.openDraft()).toBe(false)
    expect(controller.isOpen.value).toBe(true)
    expect(open).not.toHaveBeenCalled()

    controller.draft.value = 'example.com/path'
    expect(controller.openDraft()).toBe(true)
    expect(open).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noopener,noreferrer')
    expect(controller.isOpen.value).toBe(true)
  })

  it('distinguishes cancel, outside, and invalidated close behavior', async () => {
    const editor = createEditor('<p>第一段</p><p>第二段</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const { controller, onClose } = await mountLinkEditor(editor)

    expect(controller.open('text-quickbar')).toBe(true)
    editor.commands.setTextSelection(7)
    expect(controller.cancel()).toBe(true)
    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    await vi.waitFor(() => {
      expect(editor.isFocused).toBe(true)
    })
    expect(onClose).toHaveBeenLastCalledWith('cancel')

    expect(controller.open('text-quickbar')).toBe(true)
    editor.commands.setTextSelection(7)
    controller.closeFromOutside()
    expect(editor.state.selection).toMatchObject({ from: 7, to: 7 })
    expect(onClose).toHaveBeenLastCalledWith('outside')

    editor.commands.setTextSelection({ from: 1, to: 3 })
    expect(controller.open('text-quickbar')).toBe(true)
    controller.draft.value = 'https://draft.example'
    editor.view.dispatch(editor.state.tr.setMeta('selection-only-test', true))
    expect(controller.isOpen.value).toBe(true)

    editor.commands.insertContent('外部更新')
    expect(controller.isOpen.value).toBe(false)
    expect(controller.draft.value).toBe('')
    expect(onClose).toHaveBeenLastCalledWith('invalidated')
    expect(controller.apply()).toBe(false)
    expect(editor.getText()).toContain('外部更新')
  })
})
