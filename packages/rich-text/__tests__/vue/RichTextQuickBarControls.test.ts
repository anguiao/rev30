import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { boldActionItem } from '../../src/features/bold/editor'
import { italicActionItem } from '../../src/features/italic/editor'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { richTextQuickBarAction } from '../../src/vue/quick-bar'
import RichTextQuickBarControls from '../../src/vue/quick-bar/RichTextQuickBarControls.vue'
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

function mountControls(editor: ReturnType<typeof createEditor>, controls = compactTextControls) {
  return mount(RichTextQuickBarControls, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
    props: {
      editor: markRaw(editor),
      controls,
    },
  })
}

describe('RichTextQuickBarControls', () => {
  it('leaves link form arrows and Tab to the normal form focus order', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor)

    await wrapper.get('[data-test="rich-text-quick-bar-link"]').trigger('click')
    await flushPromises()

    const input = wrapper.get('[data-test="rich-text-link-url"] input')
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowLeft', cancelable: true })
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })

    input.element.dispatchEvent(arrow)
    input.element.dispatchEvent(tab)

    expect(arrow.defaultPrevented).toBe(false)
    expect(tab.defaultPrevented).toBe(false)
    expect(
      wrapper
        .get('[data-test="rich-text-link-apply"]')
        .attributes('data-rich-text-quick-bar-roving'),
    ).toBeUndefined()
  })

  it('closes the inline more menu with Escape while preserving trigger focus', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor, {
      main: [richTextQuickBarAction(boldActionItem)],
      more: [richTextQuickBarAction(italicActionItem)],
    })

    const trigger = wrapper.get('[data-test="rich-text-quick-bar-more"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()

    const menu = wrapper.get('[role="menu"]')
    const menuItem = wrapper.get('[data-test="rich-text-quick-bar-more-italic"]')
    ;(menuItem.element as HTMLElement).focus()
    expect(document.activeElement).toBe(menuItem.element)

    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger.element)
  })
})
