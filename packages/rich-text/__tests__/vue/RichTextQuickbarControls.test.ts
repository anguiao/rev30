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
  it('uses roving tabindex and arrow navigation for simple controls', async () => {
    const editor = createEditor()
    const wrapper = mountControls(editor)
    await flushPromises()

    const controls = wrapper.findAll('[data-rich-text-quickbar-roving]')
    expect(controls).toHaveLength(3)
    expect(controls.map((control) => (control.element as HTMLElement).tabIndex)).toEqual([
      0, -1, -1,
    ])

    await controls[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[1]!.element)
    expect(controls.map((control) => (control.element as HTMLElement).tabIndex)).toEqual([
      -1, 0, -1,
    ])

    await controls[1]!.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(controls[2]!.element)

    await controls[2]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(controls[0]!.element)
  })

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

    await wrapper.get('[data-test="rich-text-quickbar-more"]').trigger('click')
    await flushPromises()

    const menu = wrapper.get('[data-rich-text-quickbar-menu]')
    expect(menu.attributes('data-rich-text-quickbar-subinterface')).toBe(
      getRichTextQuickbarLayerId(editor),
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-test="rich-text-quickbar-more-italic"]').element,
    )

    await menu.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-quickbar-more"]').attributes('aria-expanded')).toBe(
      'false',
    )
  })
})
