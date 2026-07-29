import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { markRaw, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import RichTextToolbar from '../../src/vue/toolbar/RichTextToolbar.vue'
import { createTestEditor } from '../helpers/editor'

function createEditor() {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p>toolbar</p>',
  })
}

function mountToolbar(editor: ReturnType<typeof createEditor>, disabled = false) {
  return mount(RichTextToolbar, {
    attachTo: document.body,
    props: {
      editor: markRaw(editor),
      toolbar: compactRichTextEditorPreset.toolbar!,
      disabled,
    },
  })
}

describe('RichTextToolbar', () => {
  it('exposes a labelled toolbar with one roving tab stop across groups', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()

    const toolbar = wrapper.get('[role="toolbar"]')
    const items = wrapper.findAll<HTMLElement>('[data-rich-text-toolbar-item]')

    expect(toolbar.attributes('aria-label')).toBe('格式工具栏')
    expect(toolbar.attributes('aria-orientation')).toBe('horizontal')
    expect(toolbar.attributes('aria-keyshortcuts')).toBe('Alt+F10')
    expect(items.length).toBeGreaterThan(3)
    expect(items.filter((item) => item.element.tabIndex === 0)).toHaveLength(1)
    const firstEnabled = items.find((item) => !item.element.hasAttribute('disabled'))!
    expect(firstEnabled.element.tabIndex).toBe(0)

    items[2]!.element.focus()
    editor.view.focus()
    expect(items[2]!.element.tabIndex).toBe(0)

    await items[2]!.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(items[3]!.element)

    await items[3]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(items[2]!.element)

    await items[2]!.trigger('keydown', { key: 'Home' })
    expect(document.activeElement).toBe(firstEnabled.element)

    await firstEnabled.trigger('keydown', { key: 'End' })
    expect(document.activeElement).toBe(items.at(-1)!.element)

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    items.at(-1)!.element.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)

    const shiftTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    items.at(-1)!.element.dispatchEvent(shiftTab)
    expect(shiftTab.defaultPrevented).toBe(false)
  })

  it('returns to the editor with Escape without hiding the toolbar', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()

    const item = wrapper
      .findAll<HTMLElement>('[data-rich-text-toolbar-item]')
      .find((candidate) => !candidate.element.hasAttribute('disabled'))!
    item.element.focus()
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    item.element.dispatchEvent(escape)

    expect(escape.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(editor.view.dom)
    expect(wrapper.find('[role="toolbar"]').exists()).toBe(true)
  })

  it('uses dropdown keyboard state without moving focus into toolbar menus', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()
    const trigger = wrapper.get<HTMLElement>('[data-test="rich-text-heading"]')

    const dropdown = wrapper.findAllComponents(NDropdown).find((candidate) => {
      const options = candidate.props('options') as Array<{ key: string | number }>
      return options.some((option) => option.key === 'heading-1')
    })

    expect(dropdown).toBeDefined()
    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()

    const menu = document.querySelector<HTMLElement>('[role="menu"]')
    const firstOption = wrapper.get<HTMLElement>('[data-test="rich-text-heading-heading-1"]')
    expect(menu).not.toBeNull()
    expect(menu?.querySelector('[data-rich-text-toolbar-item]')).toBeNull()
    expect(document.activeElement).toBe(trigger.element)

    const arrowDown = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    })
    trigger.element.dispatchEvent(arrowDown)
    await flushPromises()

    expect(arrowDown.defaultPrevented).toBe(true)
    expect(firstOption.classes()).toContain('n-dropdown-option-body--pending')
    expect(document.activeElement).toBe(trigger.element)

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    trigger.element.dispatchEvent(escape)
    await flushPromises()

    expect(escape.defaultPrevented).toBe(true)
    expect(dropdown!.props('show')).toBe(false)
    expect(document.activeElement).toBe(trigger.element)
  })

  it('restores a replaced item by its stable toolbar item id', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()

    const toolbar = wrapper.get<HTMLElement>('[role="toolbar"]')
    const original = wrapper
      .findAll<HTMLElement>('[data-rich-text-toolbar-item]')
      .find((candidate) => !candidate.element.matches(':disabled'))!.element
    const itemId = original.dataset.richTextToolbarItem!
    original.focus()

    const replacement = document.createElement('button')
    replacement.dataset.richTextToolbarItem = itemId
    replacement.setAttribute('aria-label', 'Replacement item')
    original.replaceWith(replacement)
    await nextTick()
    await flushPromises()

    expect(replacement.tabIndex).toBe(0)
    expect(
      Array.from(
        toolbar.element.querySelectorAll<HTMLElement>('[data-rich-text-toolbar-item]'),
      ).filter((item) => item.tabIndex === 0),
    ).toEqual([replacement])
  })

  it('does not adopt controls owned by a nested composite root', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()

    const toolbar = wrapper.get<HTMLElement>('[role="toolbar"]')
    const nestedRoot = document.createElement('div')
    nestedRoot.dataset.richTextToolbarRoot = ''
    nestedRoot.setAttribute('role', 'toolbar')
    const nestedItem = document.createElement('button')
    nestedItem.dataset.richTextToolbarItem = 'nested'
    nestedItem.tabIndex = 0
    nestedRoot.append(nestedItem)
    toolbar.element.append(nestedRoot)
    await flushPromises()

    const ownedItems = Array.from(
      toolbar.element.querySelectorAll<HTMLElement>('[data-rich-text-toolbar-item]'),
    ).filter((item) => item.closest('[data-rich-text-toolbar-root]') === toolbar.element)
    const firstEnabled = ownedItems.find((item) => !item.matches(':disabled'))!
    firstEnabled.focus()
    firstEnabled.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    )

    expect(document.activeElement).toBe(ownedItems.at(-1))
    expect(nestedItem.tabIndex).toBe(0)
  })

  it('enters with Alt+F10, ignores it when disabled, and reselects after disabling the tab stop', async () => {
    const editor = createEditor()
    const wrapper = mountToolbar(editor)
    await flushPromises()

    const items = wrapper.findAll<HTMLElement>('[data-rich-text-toolbar-item]')
    const enabledItems = items.filter((item) => !item.element.hasAttribute('disabled'))
    const entered = new KeyboardEvent('keydown', {
      key: 'F10',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    editor.view.dom.dispatchEvent(entered)

    expect(entered.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(enabledItems[0]!.element)

    enabledItems[0]!.element.setAttribute('aria-disabled', 'true')
    await nextTick()
    await flushPromises()
    expect(enabledItems[0]!.element.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(enabledItems[1]!.element)
    expect(items.find((item) => item.element.tabIndex === 0)?.element).toBe(
      enabledItems[1]!.element,
    )

    await wrapper.setProps({ disabled: true })
    await nextTick()
    await flushPromises()
    expect(items.every((item) => item.element.tabIndex === -1)).toBe(true)

    const ignored = new KeyboardEvent('keydown', {
      key: 'F10',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    editor.view.dom.dispatchEvent(ignored)
    expect(ignored.defaultPrevented).toBe(false)
  })

  it('requires the exact Alt+F10 shortcut and preserves existing shortcut metadata', async () => {
    const editor = createEditor()
    editor.view.dom.setAttribute('aria-keyshortcuts', 'Control+B')
    const wrapper = mountToolbar(editor)
    await flushPromises()

    expect(editor.view.dom.getAttribute('aria-keyshortcuts')).toBe('Control+B Alt+F10')

    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }]) {
      editor.view.focus()
      const event = new KeyboardEvent('keydown', {
        key: 'F10',
        altKey: true,
        ...modifiers,
        bubbles: true,
        cancelable: true,
      })
      editor.view.dom.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(editor.view.dom)
    }

    await wrapper.setProps({ disabled: true })
    expect(editor.view.dom.getAttribute('aria-keyshortcuts')).toBe('Control+B')

    wrapper.unmount()
    expect(editor.view.dom.getAttribute('aria-keyshortcuts')).toBe('Control+B')
  })
})
