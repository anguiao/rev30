import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import RichTextTextQuickBar from '../../src/vue/quick-bar/RichTextTextQuickBar.vue'
import { createTestEditor } from '../helpers/editor'

const compactTextControls = compactRichTextEditorPreset.quickBar!.textControls!

function createEditor() {
  const editor = createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p>context</p>',
  })
  editor.commands.setTextSelection({ from: 1, to: 8 })
  return editor
}

function mountControls(editor: ReturnType<typeof createEditor>) {
  return mount(RichTextTextQuickBar, {
    attachTo: document.body,
    props: {
      editor: markRaw(editor),
      controls: compactTextControls,
    },
  })
}

describe('RichTextTextQuickBar', () => {
  it('leaves link form arrows and Tab to the normal form focus order', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor)

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await flushPromises()

    const input = wrapper.get('[data-test="rich-text-link-url"] input')
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    const commandMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })

    input.element.dispatchEvent(arrow)
    input.element.dispatchEvent(tab)
    wrapper.get('[data-test="rich-text-quick-bar-bold"]').element.dispatchEvent(commandMouseDown)

    expect(arrow.defaultPrevented).toBe(false)
    expect(tab.defaultPrevented).toBe(false)
    expect(commandMouseDown.defaultPrevented).toBe(false)
    expect(
      wrapper.get('[data-test="rich-text-link-apply"]').attributes('data-rich-text-toolbar-item'),
    ).toBeUndefined()
  })
})
