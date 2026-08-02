import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import ElementPathStatusBarItem from '../../../src/features/element-path/vue/ElementPathStatusBarItem.vue'
import { compactRichTextEditorPreset } from '../../../src/vue/presets/compact'
import { createTestEditor } from '../../helpers/editor'

function createEditor(editable = true) {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p><strong>甲</strong><a href="https://private.example">乙</a></p>',
    editable,
  })
}

function mountPath(editor: ReturnType<typeof createEditor>) {
  return mount(ElementPathStatusBarItem, {
    attachTo: document.body,
    props: { editor: markRaw(editor) },
  })
}

describe('ElementPathStatusBarItem', () => {
  it('renders model tags with accessible labels and excludes attributes', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(2)
    const wrapper = mountPath(editor)
    await flushPromises()

    const root = wrapper.get('[data-test="rich-text-element-path"]')
    const items = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')

    expect(items.map((item) => item.text())).toEqual(['p', 'strong'])
    expect(items.map((item) => item.attributes('aria-label'))).toEqual([
      '选择 p 元素',
      '选择 strong 元素',
    ])
    expect(wrapper.html()).not.toContain('https://private.example')
    expect(wrapper.html()).not.toContain('href')
    expect(root.findAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(items.filter((item) => item.element.tabIndex === 0)).toHaveLength(1)
    expect(items.at(-1)?.element.tabIndex).toBe(0)
  })

  it('updates after a selection transaction and keeps a single roving tab stop', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(6)
    const wrapper = mountPath(editor)
    await flushPromises()

    const initialItems = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
    expect(initialItems.at(-1)?.text()).toBe('a')

    editor.commands.setTextSelection(2)
    await flushPromises()

    const items = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
    expect(items.map((item) => item.text())).toEqual(['p', 'strong'])
    expect(items.filter((item) => item.element.tabIndex === 0)).toHaveLength(1)
    expect(items.at(-1)?.element.tabIndex).toBe(0)
  })

  it('supports roving focus and returns focus to the editor with Escape', async () => {
    const editor = createEditor()
    const wrapper = mountPath(editor)
    await flushPromises()

    const items = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
    items[0]!.element.focus()

    await items[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[1]!.element)

    await items[1]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(items[0]!.element)

    await items[0]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items.at(-1)!.element)

    await items.at(-1)!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(items[0]!.element)

    const selection = editor.state.selection
    await items[0]!.trigger('keydown', { key: 'Escape' })
    expect(document.activeElement).toBe(editor.view.dom)
    expect(editor.state.selection.eq(selection)).toBe(true)
    expect(wrapper.find('[data-test="rich-text-element-path"]').exists()).toBe(true)
  })

  it('selects the clicked model item and focuses the editor', async () => {
    const editor = createEditor()
    const wrapper = mountPath(editor)
    await flushPromises()
    const before = editor.state.doc.toJSON()

    const paragraph = wrapper
      .findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      .find((item) => item.text() === 'p')!
    await paragraph.trigger('click')
    await flushPromises()

    expect(editor.state.doc.toJSON()).toEqual(before)
    expect(editor.state.selection.from).toBe(1)
    expect(editor.state.selection.to).toBe(editor.state.doc.content.size - 1)
    expect(editor.view.hasFocus()).toBe(true)
  })

  it('disables every item without a tab stop when the editor becomes read-only', async () => {
    const editor = createEditor()
    const wrapper = mountPath(editor)
    await flushPromises()

    const item = wrapper.find<HTMLButtonElement>('[data-rich-text-toolbar-item]')
    const before = editor.state.selection

    editor.setEditable(false, false)
    await vi.waitFor(() => {
      const items = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      expect(items.every((candidate) => candidate.element.disabled)).toBe(true)
      expect(items.every((candidate) => candidate.element.tabIndex === -1)).toBe(true)
    })

    await item.trigger('click')
    expect(editor.state.selection.eq(before)).toBe(true)

    editor.setEditable(true, false)
    await vi.waitFor(() => {
      const items = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      expect(items.every((candidate) => !candidate.element.disabled)).toBe(true)
      expect(items.filter((candidate) => candidate.element.tabIndex === 0)).toHaveLength(1)
    })
  })

  it('scrolls the focused item first and otherwise the innermost item into view', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection(6)
    const wrapper = mountPath(editor)
    await flushPromises()

    const scrollTargets: HTMLElement[] = []
    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(function (this: HTMLElement) {
        scrollTargets.push(this)
      })

    try {
      const initialItems = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      initialItems[0]!.element.focus()
      await initialItems[0]!.trigger('focusin')

      scrollTargets.length = 0
      editor.commands.setTextSelection(2)
      await flushPromises()
      const focusedPathItems = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      expect(scrollTargets).toContain(focusedPathItems[0]!.element)

      editor.view.focus()
      scrollTargets.length = 0
      editor.commands.setTextSelection(6)
      await flushPromises()
      const unfocusedPathItems = wrapper.findAll<HTMLButtonElement>('[data-rich-text-toolbar-item]')
      expect(scrollTargets.at(-1)).toBe(unfocusedPathItems.at(-1)!.element)
    } finally {
      scrollSpy.mockRestore()
    }
  })
})
