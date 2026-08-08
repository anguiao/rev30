import Highlight from '@tiptap/extension-highlight'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { highlightColorOptions } from '../../../../../src/features/highlight/core/colors'
import HighlightControl from '../../../../../src/features/highlight/client/vue/HighlightControl.vue'
import { createTestEditor } from '../../../../helpers/editor'
const yellow = highlightColorOptions[0]
const blue = highlightColorOptions[2]

function createEditor(content = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, Highlight.configure({ multicolor: true })],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  return mount(HighlightControl, {
    props: {
      editor: markRaw(editor),
      disabled,
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

describe('HighlightControl', () => {
  it('sets and clears a palette highlight color', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await wrapper.get('[data-test="rich-text-highlight-yellow"]').trigger('click')
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
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('aria-expanded')).toBe(
      'false',
    )
    await openPopover(wrapper)
    await wrapper.get('[data-test="rich-text-highlight-clear"]').trigger('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('updates the selected palette color when the editor selection changes', async () => {
    const editor = createEditor(
      `<p><mark data-color="${yellow.value}" style="background-color: ${yellow.value}; color: inherit">黄</mark><mark data-color="${blue.value}" style="background-color: ${blue.value}; color: inherit">蓝</mark></p>`,
    )
    editor.commands.setTextSelection({ from: 1, to: 2 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'true',
    )

    editor.commands.setTextSelection({ from: 2, to: 3 })
    await flushPromises()

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('aria-pressed')).toBe(
        'true',
      )
    })
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('marks the current palette color as selected', async () => {
    const editor = createEditor(
      `<p><mark data-color="${blue.value}" style="background-color: ${blue.value}; color: inherit">维护通知</mark></p>`,
    )
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('aria-pressed')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('navigates the palette with arrows, Home, and End', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mount(HighlightControl, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
      },
    })

    await openPopover(wrapper)
    const items = wrapper.findAll<HTMLElement>('[data-rich-text-grid-item]')
    expect(document.activeElement).toBe(items[0]!.element)

    await items[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[1]!.element)

    await items[1]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items.at(-1)!.element)

    await items.at(-1)!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0]!.element)

    await items[0]!.trigger('keydown', { key: 'Escape' })
    const trigger = wrapper.get('[data-test="rich-text-highlight"]')
    await trigger.trigger('keydown', { key: 'ArrowUp' })
    await flushPromises()
    expect(document.activeElement).toBe(items.at(-1)!.element)
  })

  it('distinguishes mixed and partially highlighted selections', async () => {
    const editor = createEditor(
      `<p><mark data-color="${yellow.value}" style="background-color: ${yellow.value}; color: inherit">黄</mark><mark data-color="${blue.value}" style="background-color: ${blue.value}; color: inherit">蓝</mark>无</p>`,
    )
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('aria-pressed')).toBe(
      'false',
    )

    editor.commands.setTextSelection({ from: 1, to: 4 })
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('aria-pressed')).toBe(
      'false',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('aria-pressed')).toBe(
      'false',
    )
  })

  it('preserves stored highlight marks for a collapsed caret', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(2)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await wrapper.get('[data-test="rich-text-highlight-yellow"]').trigger('click')
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
    await wrapper.get('[data-test="rich-text-highlight-clear"]').trigger('click')
    await flushPromises()

    expect(editor.state.storedMarks?.some(({ type }) => type.name === 'highlight')).toBe(false)
  })

  it('closes only its color menu on Escape', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 3 })
    editor.view.focus()
    const wrapper = mount(HighlightControl, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
      },
    })

    await openPopover(wrapper)
    const color = wrapper.get('[data-test="rich-text-highlight-yellow"]')
    color.element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    expect(document.activeElement).toBe(wrapper.get('[data-test="rich-text-highlight"]').element)
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
