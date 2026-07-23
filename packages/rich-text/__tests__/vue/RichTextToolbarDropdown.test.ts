import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { paragraphActionItem } from '../../src/features/base/editor'
import { richTextToolbarDropdown } from '../../src/vue/toolbar'
import RichTextToolbarDropdown from '../../src/vue/toolbar/RichTextToolbarDropdown.vue'
import { createTestEditor } from '../helpers/editor'
import { createTestRichTextOverlayState } from '../helpers/overlay'

const control = richTextToolbarDropdown({
  key: 'block-type',
  label: '块类型',
  icon: 'i-[lucide--pilcrow]',
  items: [paragraphActionItem],
})

function createEditor() {
  return createTestEditor({
    extensions: [Document, Paragraph, Text],
    content: '<p>内容</p>',
  })
}

function mountDropdown(editor: Editor) {
  const overlay = createTestRichTextOverlayState()
  const wrapper = mount(RichTextToolbarDropdown, {
    attachTo: document.body,
    global: { provide: overlay.provide },
    props: {
      control,
      editor: markRaw(editor),
    },
  })

  onTestFinished(() => wrapper.unmount())
  return Object.assign(wrapper, { overlayState: overlay.state })
}

async function openDropdown(wrapper: ReturnType<typeof mountDropdown>) {
  wrapper.getComponent(NDropdown).vm.$emit('update:show', true)
  await flushPromises()
}

function getMenuId(wrapper: ReturnType<typeof mountDropdown>) {
  const getMenuProps = wrapper.getComponent(NDropdown).props('menuProps') as () => Record<
    string,
    string
  >

  return getMenuProps()['data-rich-text-toolbar-dropdown-menu']
}

describe('RichTextToolbarDropdown', () => {
  it('exposes menu state and closes only the dropdown owned by the Escape target', async () => {
    const firstEditor = createEditor()
    const secondEditor = createEditor()
    firstEditor.commands.setTextSelection(1)
    secondEditor.commands.setTextSelection(1)
    firstEditor.view.focus()
    const firstWrapper = mountDropdown(firstEditor)
    const secondWrapper = mountDropdown(secondEditor)
    const firstTrigger = firstWrapper.get('[data-test="rich-text-block-type"]')
    const secondTrigger = secondWrapper.get('[data-test="rich-text-block-type"]')

    expect(firstTrigger.attributes('aria-haspopup')).toBe('menu')
    expect(firstTrigger.attributes('aria-expanded')).toBe('false')

    await openDropdown(firstWrapper)
    await openDropdown(secondWrapper)

    expect(firstTrigger.attributes('aria-expanded')).toBe('true')
    expect(secondTrigger.attributes('aria-expanded')).toBe('true')
    expect(firstWrapper.overlayState.toolbarOverlayOpen.value).toBe(true)
    expect(secondWrapper.overlayState.toolbarOverlayOpen.value).toBe(true)

    firstEditor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(firstTrigger.attributes('aria-expanded')).toBe('false')
    expect(secondTrigger.attributes('aria-expanded')).toBe('true')
    expect(firstWrapper.overlayState.toolbarOverlayOpen.value).toBe(false)
    expect(secondWrapper.overlayState.toolbarOverlayOpen.value).toBe(true)
    await vi.waitFor(() => {
      expect(firstEditor.isFocused).toBe(true)
      expect(document.activeElement).toBe(firstEditor.view.dom)
    })
  })

  it('isolates Escape events from teleported menus across editors', async () => {
    const firstEditor = createEditor()
    const secondEditor = createEditor()
    firstEditor.commands.setTextSelection(1)
    secondEditor.commands.setTextSelection(1)
    const firstWrapper = mountDropdown(firstEditor)
    const secondWrapper = mountDropdown(secondEditor)

    await openDropdown(firstWrapper)
    await openDropdown(secondWrapper)

    const firstMenuId = getMenuId(firstWrapper)
    const secondMenuId = getMenuId(secondWrapper)
    expect(firstMenuId).not.toBe(secondMenuId)

    const firstMenu = document.querySelector(
      `[data-rich-text-toolbar-dropdown-menu="${firstMenuId}"]`,
    )
    expect(firstMenu).not.toBeNull()
    firstMenu?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(firstWrapper.get('[data-test="rich-text-block-type"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(
      secondWrapper.get('[data-test="rich-text-block-type"]').attributes('aria-expanded'),
    ).toBe('true')
    expect(firstWrapper.overlayState.toolbarOverlayOpen.value).toBe(false)
    expect(secondWrapper.overlayState.toolbarOverlayOpen.value).toBe(true)
    await vi.waitFor(() => {
      expect(firstEditor.isFocused).toBe(true)
      expect(document.activeElement).toBe(firstEditor.view.dom)
    })
  })
})
