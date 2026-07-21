import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { boldToolbarItem } from '../../src/features/bold/vue'
import { italicToolbarItem } from '../../src/features/italic/vue'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { getRichTextQuickbarLayerId, richTextQuickbarAction } from '../../src/vue/quickbar'
import RichTextQuickbarControls from '../../src/vue/quickbar/RichTextQuickbarControls.vue'
import { createTestEditor } from '../helpers/editor'

function createEditor() {
  const editor = createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p>context</p>',
  })
  editor.commands.setTextSelection({ from: 1, to: 8 })
  return editor
}

function mountControls(
  editor: ReturnType<typeof createEditor>,
  controls = compactRichTextEditorPreset.quickbar!.text!,
) {
  return mount(RichTextQuickbarControls, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
    props: {
      editor: markRaw(editor),
      controls,
    },
  })
}

describe('RichTextQuickbarControls', () => {
  it('leaves link form arrows and Tab to the normal form focus order', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor)

    await wrapper.get('[data-test="rich-text-quickbar-link"]').trigger('click')
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
        .attributes('data-rich-text-quickbar-roving'),
    ).toBeUndefined()

    ;(wrapper.vm as unknown as { close: (reason: 'outside') => void }).close('outside')
    await flushPromises()
    expect(wrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
  })

  it('marks the teleported more menu as part of the same quickbar layer', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor, {
      primary: [richTextQuickbarAction(boldToolbarItem)],
      more: [richTextQuickbarAction(italicToolbarItem)],
    })

    const trigger = wrapper.get('[data-test="rich-text-quickbar-more"]')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click')
    await flushPromises()

    const menu = wrapper.get('[data-rich-text-quickbar-menu]')
    expect(menu.attributes('data-rich-text-quickbar-subinterface')).toBe(
      getRichTextQuickbarLayerId(editor),
    )
    expect(document.activeElement).toBe(trigger.element)

    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })
})
