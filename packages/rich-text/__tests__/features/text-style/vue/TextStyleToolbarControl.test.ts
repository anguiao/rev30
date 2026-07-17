import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NButton, NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  textStyleColorOptions,
  textStyleFontFamilyOptions,
  textStyleFontSizeOptions,
  textStyleLineHeightOptions,
} from '../../../../src/features/text-style/options'
import { textStyleFeature } from '../../../../src/features/text-style/shared'
import TextStyleToolbarControl from '../../../../src/features/text-style/vue/TextStyleToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

const red = textStyleColorOptions.find((option) => option.key === 'red')!
const blue = textStyleColorOptions.find((option) => option.key === 'blue')!
const serif = textStyleFontFamilyOptions.find((option) => option.key === 'serif')!
const large = textStyleFontSizeOptions.find((option) => option.key === '18pt')!
const spacious = textStyleLineHeightOptions.find((option) => option.key === '1.5')!

function createEditor(
  content: NonNullable<ConstructorParameters<typeof Editor>[0]>['content'] = '<p>维护通知</p>',
) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...textStyleFeature.documentExtensions!()],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  return mount(TextStyleToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled,
      colors: [...textStyleColorOptions],
      fontFamilies: [...textStyleFontFamilyOptions],
      fontSizes: [...textStyleFontSizeOptions],
      lineHeights: [...textStyleLineHeightOptions],
    },
  })
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

function getButtonComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const button = wrapper.findAllComponents(NButton).find((component) => {
    return component.attributes('data-test') === dataTest
  })

  if (!button) {
    throw new Error(`Button not found: ${dataTest}`)
  }

  return button
}

function getDropdownComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const dropdown = wrapper.findAllComponents(NDropdown).find((component) => {
    return component.find(`[data-test="${dataTest}"]`).exists()
  })

  if (!dropdown) {
    throw new Error(`Dropdown not found: ${dataTest}`)
  }

  return dropdown
}

async function openColorPopover(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-text-color"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('[data-test="rich-text-text-color-red"]').exists()).toBe(true)
  })
}

describe('TextStyleToolbarControl', () => {
  it('combines text styles and clears every style with the default options', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openColorPopover(wrapper)
    getButtonComponent(wrapper, `rich-text-text-color-${red.key}`).vm.$emit('click')
    getDropdownComponent(wrapper, 'rich-text-font-family').vm.$emit('select', serif.key)
    getDropdownComponent(wrapper, 'rich-text-font-size').vm.$emit('select', large.key)
    getDropdownComponent(wrapper, 'rich-text-line-height').vm.$emit('select', spacious.key)
    await flushPromises()

    expect(editor.getAttributes('textStyle')).toEqual({
      color: red.value,
      fontFamily: serif.value,
      fontSize: large.value,
      lineHeight: spacious.value,
    })
    expect(wrapper.get('[data-test="rich-text-text-color"]').attributes('title')).toBe(
      `文字颜色：${red.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-font-family"]').attributes('title')).toBe(
      `字体：${serif.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-font-size"]').attributes('title')).toBe(
      `字号：${large.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-line-height"]').attributes('title')).toBe(
      `行高：${spacious.label}`,
    )

    getButtonComponent(wrapper, 'rich-text-text-color-default').vm.$emit('click')
    getDropdownComponent(wrapper, 'rich-text-font-family').vm.$emit('select', 'font-family-default')
    getDropdownComponent(wrapper, 'rich-text-font-size').vm.$emit('select', 'font-size-default')
    getDropdownComponent(wrapper, 'rich-text-line-height').vm.$emit('select', 'line-height-default')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('textStyle')
  })

  it('updates every current style when the editor selection changes', async () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '红',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: red.value,
                    fontFamily: serif.value,
                    fontSize: large.value,
                    lineHeight: spacious.value,
                  },
                },
              ],
            },
            { type: 'text', text: '常' },
          ],
        },
      ],
    })
    editor.commands.setTextSelection({ from: 1, to: 2 })
    const wrapper = mountControl(editor)

    expect(wrapper.get('[data-test="rich-text-text-color"]').attributes('data-active')).toBe('true')
    expect(wrapper.get('[data-test="rich-text-font-family"]').text()).toContain(serif.label)
    expect(wrapper.get('[data-test="rich-text-font-size"]').text()).toContain(large.label)
    expect(wrapper.get('[data-test="rich-text-line-height"]').text()).toContain(spacious.label)

    editor.commands.setTextSelection({ from: 2, to: 3 })
    await flushPromises()

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-text-color"]').attributes('data-active')).toBe(
        undefined,
      )
    })
    expect(wrapper.get('[data-test="rich-text-font-family"]').text()).toContain('字体')
    expect(wrapper.get('[data-test="rich-text-font-size"]').text()).toContain('字号')
    expect(wrapper.get('[data-test="rich-text-line-height"]').text()).toContain('行高')
  })

  it('uses the current text style for a range selection', () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '甲',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: red.value,
                    fontFamily: serif.value,
                    fontSize: large.value,
                    lineHeight: spacious.value,
                  },
                },
              ],
            },
            {
              type: 'text',
              text: '乙',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: blue.value,
                    fontSize: large.value,
                    lineHeight: spacious.value,
                  },
                },
              ],
            },
            { type: 'text', text: '丙' },
          ],
        },
      ],
    })
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    expect(wrapper.get('[data-test="rich-text-text-color"]').attributes('title')).toBe(
      `文字颜色：${red.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-font-family"]').attributes('title')).toBe(
      `字体：${serif.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-font-size"]').attributes('title')).toBe(
      `字号：${large.label}`,
    )
    expect(wrapper.get('[data-test="rich-text-line-height"]').attributes('title')).toBe(
      `行高：${spacious.label}`,
    )
  })

  it('disables all entries when explicitly disabled', () => {
    const wrapperDisabled = mountControl(createEditor(), true)

    for (const dataTest of [
      'rich-text-text-color',
      'rich-text-font-family',
      'rich-text-font-size',
      'rich-text-line-height',
    ]) {
      expect(wrapperDisabled.get(`[data-test="${dataTest}"]`).attributes('disabled')).toBeDefined()
    }
  })
})
