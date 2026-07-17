import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { characterCountEditorFeature } from '../../../../src/features/character-count/editor'
import CharacterCountStatusBarItem from '../../../../src/features/character-count/vue/CharacterCountStatusBarItem.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(
  content: NonNullable<ConstructorParameters<typeof Editor>[0]>['content'] = '<p></p>',
) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...characterCountEditorFeature.extensions!()],
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
})
