import Highlight from '@tiptap/extension-highlight'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NButton } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { highlightColorOptions } from '../../../../src/features/highlight/colors'
import HighlightToolbarControl from '../../../../src/features/highlight/vue/HighlightToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'
const yellow = highlightColorOptions[0]
const blue = highlightColorOptions[2]

function createEditor(content = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, Highlight.configure({ multicolor: true })],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  return mount(HighlightToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled,
      colors: [...highlightColorOptions],
    },
  })
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

async function openPopover(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('[data-test="rich-text-highlight-yellow"]').exists()).toBe(true)
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

describe('HighlightToolbarControl', () => {
  it('sets and clears a palette highlight color', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    getButtonComponent(wrapper, 'rich-text-highlight-yellow').vm.$emit('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'highlight', attrs: { color: yellow.value } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      'true',
    )
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('type')).toBe('primary')
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('secondary')).toBe(true)
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('quaternary')).toBe(
      false,
    )

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('aria-expanded')).toBe(
      'false',
    )
    await openPopover(wrapper)
    getButtonComponent(wrapper, 'rich-text-highlight-clear').vm.$emit('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      undefined,
    )
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('type')).toBe('default')
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('secondary')).toBe(false)
    expect(getButtonComponent(wrapper, 'rich-text-highlight-yellow').props('quaternary')).toBe(true)
  })

  it('updates the selected palette color when the editor selection changes', async () => {
    const editor = createEditor(
      `<p><mark data-color="${yellow.value}" style="background-color: ${yellow.value}; color: inherit">黄</mark><mark data-color="${blue.value}" style="background-color: ${blue.value}; color: inherit">蓝</mark></p>`,
    )
    editor.commands.setTextSelection({ from: 1, to: 2 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      'true',
    )

    editor.commands.setTextSelection({ from: 2, to: 3 })
    await flushPromises()

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('data-active')).toBe(
        'true',
      )
    })
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      undefined,
    )
    expect(getButtonComponent(wrapper, 'rich-text-highlight-blue').props('type')).toBe('primary')
  })

  it('marks the current palette color as selected', async () => {
    const editor = createEditor(
      `<p><mark data-color="${blue.value}" style="background-color: ${blue.value}; color: inherit">维护通知</mark></p>`,
    )
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('data-active')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      undefined,
    )
  })

  it('preserves stored highlight marks for a collapsed caret', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(2)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    getButtonComponent(wrapper, 'rich-text-highlight-yellow').vm.$emit('click')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 2, to: 2 })
    expect(editor.state.storedMarks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: editor.schema.marks.highlight,
          attrs: { color: yellow.value },
        }),
      ]),
    )

    await openPopover(wrapper)
    getButtonComponent(wrapper, 'rich-text-highlight-clear').vm.$emit('click')
    await flushPromises()

    expect(editor.state.storedMarks?.some(({ type }) => type.name === 'highlight')).toBe(false)
  })

  it('does not run commands while disabled', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor, true)

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-highlight-yellow"]').exists()).toBe(false)
    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
  })
})
