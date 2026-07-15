import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { characterCountEditorFeature } from '../../../../src/features/character-count/editor'
import CharacterCountToolbarControl from '../../../../src/features/character-count/vue/CharacterCountToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(
  content: NonNullable<ConstructorParameters<typeof Editor>[0]>['content'] = '<p></p>',
) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...characterCountEditorFeature.extensions!()],
    content,
  })
}

function mountControl(editor: Editor | null, disabled = false) {
  return mount(CharacterCountToolbarControl, {
    props: {
      editor: editor ? markRaw(editor) : null,
      disabled,
    },
  })
}

describe('CharacterCountToolbarControl', () => {
  it('shows the grapheme count for Chinese, ASCII, and emoji text', () => {
    const editor = createEditor('<p>你好A👨‍👩‍👧‍👦</p>')
    const wrapper = mountControl(editor)
    const control = wrapper.get('[data-test="rich-text-character-count"]')

    expect(control.text()).toBe('4 字')
    expect(control.attributes('title')).toBe('字符数：4')
    expect(control.attributes('aria-label')).toBe('字符数：4')
    expect(control.attributes('aria-live')).toBe('polite')
  })

  it('updates after editor transactions', async () => {
    const editor = createEditor('<p>初始</p>')
    const wrapper = mountControl(editor)

    editor.commands.setTextSelection(2)
    await flushPromises()

    editor.commands.setContent('<p>你好世界</p>')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('4 字')
  })

  it('shows zero without an editor and remains visible when disabled', () => {
    const wrapperWithoutEditor = mountControl(null)
    const disabledWrapper = mountControl(createEditor('<p>仍然显示</p>'), true)
    const emptyControl = wrapperWithoutEditor.get('[data-test="rich-text-character-count"]')
    const disabledControl = disabledWrapper.get('[data-test="rich-text-character-count"]')

    expect(emptyControl.text()).toBe('0 字')
    expect(emptyControl.attributes('aria-disabled')).toBe('true')
    expect(emptyControl.classes()).toContain('opacity-50')
    expect(disabledControl.text()).toBe('4 字')
    expect(disabledControl.attributes('aria-disabled')).toBe('true')
    expect(disabledControl.classes()).toContain('opacity-50')
  })
})
