import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { defineComponent, h, markRaw, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'
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

function mountSwitchableControl() {
  const host = defineComponent({
    props: {
      editor: {
        type: Object as PropType<Editor | null>,
        default: null,
      },
    },
    setup(props) {
      return () => h(CharacterCountToolbarControl, { editor: props.editor })
    },
  })

  return mount(host, {
    props: {
      editor: null,
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
    const characters = vi.spyOn(editor.storage.characterCount, 'characters')
    const wrapper = mountControl(editor)

    editor.commands.setTextSelection(2)
    await flushPromises()
    expect(characters).toHaveBeenCalledTimes(1)

    editor.commands.setContent('<p>你好世界</p>')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('4 字')
    expect(characters).toHaveBeenCalledTimes(2)
  })

  it('rebinds when the editor changes and unbinds when unmounted', async () => {
    const firstEditor = createEditor('<p>一</p>')
    const secondEditor = createEditor('<p>第二个</p>')
    const firstOn = vi.spyOn(firstEditor, 'on')
    const firstOff = vi.spyOn(firstEditor, 'off')
    const secondOn = vi.spyOn(secondEditor, 'on')
    const secondOff = vi.spyOn(secondEditor, 'off')
    const wrapper = mountSwitchableControl()

    await wrapper.setProps({ editor: markRaw(firstEditor) })

    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('1 字')
    const firstHandler = firstOn.mock.calls.find(([event]) => event === 'transaction')?.[1]
    expect(firstHandler).toBeTypeOf('function')

    await wrapper.setProps({ editor: null })

    expect(wrapper.props('editor')).toBeNull()
    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('0 字')
    expect(firstOff).toHaveBeenCalledWith('transaction', firstHandler)

    await wrapper.setProps({ editor: markRaw(secondEditor) })

    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('3 字')
    const secondHandler = secondOn.mock.calls.find(([event]) => event === 'transaction')?.[1]
    expect(secondHandler).toBeTypeOf('function')

    firstEditor.commands.setContent('<p>旧编辑器已经变化</p>')
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('3 字')

    secondEditor.commands.setContent('<p>新编辑器</p>')
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-character-count"]').text()).toBe('4 字')

    wrapper.unmount()
    expect(secondOff).toHaveBeenCalledWith('transaction', secondHandler)
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
