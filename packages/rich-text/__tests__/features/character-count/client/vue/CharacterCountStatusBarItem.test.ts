import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { characterCountEditorFeature } from '../../../../../src/features/character-count/client/editor'
import CharacterCountStatusBarItem from '../../../../../src/features/character-count/client/vue/CharacterCountStatusBarItem.vue'
import { imageFeature } from '../../../../../src/features/image/core/feature'
import { createTestEditor } from '../../../../helpers/editor'

function createEditor(
  content: NonNullable<ConstructorParameters<typeof Editor>[0]>['content'] = '<p></p>',
) {
  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...imageFeature.sharedExtensions!(),
      ...characterCountEditorFeature.extensions!(),
    ],
    content,
  })
}

function mountItem(editor: Editor) {
  return mount(CharacterCountStatusBarItem, {
    props: {
      editor: markRaw(editor),
    },
  })
}

describe('CharacterCountStatusBarItem', () => {
  it('shows the grapheme count for Chinese, ASCII, and emoji text', () => {
    const editor = createEditor('<p>你好A👨‍👩‍👧‍👦</p>')
    const wrapper = mountItem(editor)
    const item = wrapper.get('[data-test="rich-text-character-count"]')

    expect(item.text()).toBe('4 字')
    expect(item.attributes('title')).toBe('字符数：4')
    expect(item.attributes('aria-label')).toBe('字符数：4')
    expect(item.attributes('aria-live')).toBe('polite')
  })

  it('updates after editor transactions', async () => {
    const editor = createEditor('<p>初始</p>')
    const wrapper = mountItem(editor)

    editor.commands.setTextSelection(2)
    await flushPromises()

    editor.commands.setContent('<p>你好世界</p>')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('4 字')
  })

  it('updates for a selection-only transaction and restores the collapsed label', async () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'A👨‍👩‍👧‍👦e\u0301 B' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '下一段' }],
        },
      ],
    })
    const wrapper = mountItem(editor)
    const documentBeforeSelection = editor.getJSON()
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)
    const firstParagraph = editor.state.doc.firstChild
    if (!firstParagraph) throw new Error('Expected first paragraph')

    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, 1, firstParagraph.content.size + 1),
      ),
    )

    expect(onTransaction).toHaveBeenCalledOnce()
    expect(onTransaction.mock.calls[0]?.[0].transaction).toMatchObject({
      docChanged: false,
      selectionSet: true,
    })
    expect(editor.getJSON()).toEqual(documentBeforeSelection)
    await vi.waitFor(() => {
      const item = wrapper.get('[data-test="rich-text-character-count"]')
      expect(item.text()).toBe('已选 5 / 共 8 字')
      expect(item.attributes('title')).toBe('字符数：已选 5，共 8')
      expect(item.attributes('aria-label')).toBe('字符数：已选 5，共 8')
    })

    editor.commands.setTextSelection(1)
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('8 字')
    })
  })

  it('counts an image node selection as one character', async () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: '/image.png', alt: null, width: null, height: null },
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '甲' }],
        },
      ],
    })
    const wrapper = mountItem(editor)

    editor.commands.setNodeSelection(0)

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('已选 1 / 共 2 字')
    })
  })
})
