import type { Editor } from '@tiptap/core'
import type { BubbleMenuPluginProps } from '@tiptap/extension-bubble-menu'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { PluginKey, type Transaction } from '@tiptap/pm/state'
import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { defineComponent, h, markRaw, onBeforeUnmount, onMounted, ref, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { boldActionItem } from '../../src/features/bold/editor'
import { codeBlockEditorFeature } from '../../src/features/code-block/editor'
import { codeBlockQuickBar } from '../../src/features/code-block/vue'
import { imageQuickBar } from '../../src/features/image/vue'
import { historyActionItems } from '../../src/features/history/editor'
import { italicActionItem } from '../../src/features/italic/editor'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import {
  defineRichTextQuickBar,
  richTextQuickBarAction,
  type RichTextQuickBarConfig,
} from '../../src/vue/quick-bar'
import RichTextQuickBar from '../../src/vue/quick-bar/RichTextQuickBar.vue'
import { appendTestElement, createTestEditor } from '../helpers/editor'
import { createImageTestEditorPreset } from '../helpers/image-editor'

const BubbleMenuStub = defineComponent({
  props: {
    editor: {
      type: Object as PropType<Editor>,
      required: true,
    },
    pluginKey: {
      type: [String, Object] as PropType<string | PluginKey>,
      required: true,
    },
    getReferencedVirtualElement: {
      type: Function as PropType<() => HTMLElement | null>,
      required: true,
    },
    options: {
      type: Object as PropType<NonNullable<BubbleMenuPluginProps['options']>>,
      required: true,
    },
    shouldShow: {
      type: Function as PropType<() => boolean>,
      required: true,
    },
  },
  setup(props, { slots }) {
    const visible = ref(false)

    function hide() {
      if (visible.value) {
        props.options.onHide?.()
        visible.value = false
      }
    }

    function updateVisibility() {
      const nextVisible = props.shouldShow()

      if (!nextVisible) {
        hide()
        return
      }

      visible.value = true
    }

    function handleTransaction({ transaction }: { transaction: Transaction }) {
      const meta = transaction.getMeta(props.pluginKey)

      if (meta === 'hide') {
        hide()
        return
      }

      if (meta === 'show') {
        updateVisibility()
        return
      }

      if (transaction.selectionSet || transaction.docChanged) {
        updateVisibility()
      }
    }

    onMounted(() => {
      props.editor.on('transaction', handleTransaction)
      props.editor.on('focus', updateVisibility)
      updateVisibility()
    })

    onBeforeUnmount(() => {
      props.editor.off('transaction', handleTransaction)
      props.editor.off('focus', updateVisibility)
    })

    return () => (visible.value ? h('div', slots.default?.()) : null)
  },
})

function createEditor() {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p>one two</p>',
  })
}

function mountQuickBar(
  editor: ReturnType<typeof createTestEditor>,
  quickBar = compactRichTextEditorPreset.quickBar as RichTextQuickBarConfig,
) {
  return mount(RichTextQuickBar, {
    attachTo: document.body,
    global: {
      stubs: {
        BubbleMenu: BubbleMenuStub,
      },
    },
    props: {
      appendTo: document.body,
      scrollContainer: document.body,
      editor: markRaw(editor),
      quickBar,
    },
  })
}

function mountRealQuickBar(
  editor: ReturnType<typeof createTestEditor>,
  quickBar = compactRichTextEditorPreset.quickBar as RichTextQuickBarConfig,
) {
  return mount(RichTextQuickBar, {
    attachTo: document.body,
    props: {
      appendTo: document.body,
      scrollContainer: document.body,
      editor: markRaw(editor),
      quickBar,
    },
  })
}

function findCodeBlockTextPositions(editor: ReturnType<typeof createTestEditor>) {
  const positions: number[] = []

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'codeBlock') {
      positions.push(position + 1)
      return false
    }

    return true
  })

  return positions
}

describe('RichTextQuickBar', () => {
  it('owns roving tabindex and arrow navigation for simple controls', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const quickBar = wrapper.get('[data-test="rich-text-quick-bar"]')
    expect(quickBar.attributes('role')).toBe('toolbar')
    expect(quickBar.attributes('aria-orientation')).toBe('horizontal')

    const controls = wrapper.findAll('[data-rich-text-toolbar-item]')
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

  it('includes native link controls in roving navigation', async () => {
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
      content: '<p><a href="https://example.com">link</a> text</p>',
    })
    editor.commands.setTextSelection(2)
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const open = wrapper.get('[data-test="rich-text-quick-bar-link-open"]')
    const edit = wrapper.get('[data-test="rich-text-quick-bar-link-edit"]')
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })

    editor.view.dom.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(open.element)

    await open.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(edit.element)

    await edit.trigger('keydown', { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(open.element)
  })

  it('skips disabled items during roving navigation', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const controls = wrapper.findAll<HTMLElement>('[data-rich-text-toolbar-item]')
    const disabledLink = document.createElement('a')
    disabledLink.dataset.richTextToolbarItem = ''
    disabledLink.setAttribute('disabled', '')
    disabledLink.tabIndex = 0

    const ariaDisabledItem = document.createElement('div')
    ariaDisabledItem.dataset.richTextToolbarItem = ''
    ariaDisabledItem.setAttribute('aria-disabled', 'true')
    ariaDisabledItem.tabIndex = 0

    wrapper.get('[data-test="rich-text-quick-bar"]').element.append(disabledLink, ariaDisabledItem)

    disabledLink.focus()
    expect(controls.map((control) => control.element.tabIndex)).toEqual([0, -1, -1])

    controls[2]!.element.focus()
    await controls[2]!.trigger('keydown', { key: 'ArrowRight' })

    expect(document.activeElement).toBe(controls[0]!.element)
  })

  it('drives the real BubbleMenu visibility and removes its wrapper from tab order', async () => {
    const editor = createEditor()
    mountRealQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: [richTextQuickBarAction(boldActionItem)],
      }),
    )
    await flushPromises()

    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()

    const quickBar = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-test="rich-text-quick-bar"]')
      expect(element).not.toBeNull()
      return element!
    })
    expect(quickBar.classList.contains('bg-(--rich-text-theme-popover-color)')).toBe(true)
    expect(quickBar.classList.contains('border')).toBe(true)
    expect(quickBar.classList.contains('border-(--rich-text-theme-input-border-color)')).toBe(true)
    expect(quickBar.parentElement?.tabIndex).toBe(-1)

    const toolbarTrigger = appendTestElement('button')
    toolbarTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    toolbarTrigger.focus()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quick-bar"]')).toBeNull()
    })

    editor.view.focus()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quick-bar"]')).not.toBeNull()
    })
  })

  it('moves Tab focus from the editor into the Quick Bar', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(tab)
    await flushPromises()

    const firstControl = wrapper.get('[data-test="rich-text-quick-bar-bold"]')
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(firstControl.element)

    expect(editor.state.selection).toMatchObject({ from: 1, to: 4 })
    expect(document.activeElement).toBe(firstControl.element)

    editor.view.focus()
    const reverseTab = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    editor.view.dom.dispatchEvent(reverseTab)
    expect(reverseTab.defaultPrevented).toBe(false)
  })

  it('does not intercept editor Tab when every command item is unavailable', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    mountQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: [richTextQuickBarAction(historyActionItems[0])],
      }),
    )
    await flushPromises()

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('prefers an active command initially, then remembers focus across entries', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.commands.toggleItalic()
    editor.view.focus()
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: [
          richTextQuickBarAction(boldActionItem),
          richTextQuickBarAction(italicActionItem),
        ],
      }),
    )
    await flushPromises()

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(tab)
    const italic = wrapper.get('[data-test="rich-text-quick-bar-italic"]')
    expect(document.activeElement).toBe(italic.element)

    const bold = wrapper.get('[data-test="rich-text-quick-bar-bold"]')
    await italic.trigger('keydown', { key: 'ArrowLeft' })
    editor.view.focus()
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(bold.element)
  })

  it('keeps the remembered command when the selection moves', async () => {
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
      content: '<p><strong>one</strong> <em>two</em></p>',
    })
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: [
          richTextQuickBarAction(boldActionItem),
          richTextQuickBarAction(italicActionItem),
        ],
      }),
    )

    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    await flushPromises()
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-test="rich-text-quick-bar-bold"]').element,
    )

    editor.view.focus()
    editor.commands.setTextSelection({ from: 5, to: 8 })
    await flushPromises()
    editor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    )
    expect(document.activeElement).toBe(
      wrapper.get('[data-test="rich-text-quick-bar-bold"]').element,
    )
  })

  it('dismisses with Escape until the editor context changes', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const firstControl = wrapper.get<HTMLElement>('[data-test="rich-text-quick-bar-bold"]')
    firstControl.element.focus()
    await firstControl.trigger('keydown', { key: 'Escape' })

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(editor.view.dom)
      expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(false)
    })

    editor.commands.setTextSelection({ from: 5, to: 7 })

    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(true)
    })
  })

  it('anchors the code block Quick Bar to the block end instead of the cursor', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const value = 1</code></pre>',
    })
    const position = findCodeBlockTextPositions(editor)[0]!
    editor.commands.setTextSelection(position)
    editor.view.focus()
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({ featureBars: [codeBlockQuickBar] }),
    )
    await flushPromises()

    const bubbleMenu = wrapper.getComponent(BubbleMenuStub)
    const getReference = bubbleMenu.props('getReferencedVirtualElement')
    const reference = getReference()
    const offset = bubbleMenu.props('options').offset as (state: {
      rects: { reference: { width: number }; floating: { width: number } }
    }) => unknown

    expect(reference).toBe(editor.view.nodeDOM(position - 1))
    expect(offset({ rects: { reference: { width: 240 }, floating: { width: 80 } } })).toEqual({
      mainAxis: 4,
      crossAxis: 80,
    })

    editor.commands.setTextSelection(position + 8)
    expect(getReference()).toBe(reference)
  })

  it('applies a mouse-opened code language option to the current block', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const first = 1</code></pre><pre><code>const second = 2</code></pre>',
    })
    const positions = findCodeBlockTextPositions(editor)
    editor.commands.setTextSelection(positions[0]!)
    editor.view.focus()
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({ featureBars: [codeBlockQuickBar] }),
    )
    await flushPromises()

    const trigger = wrapper.get<HTMLElement>('[data-test="rich-text-code-block-language"]')
    trigger.element.focus()
    await trigger.trigger('click')
    await flushPromises()

    expect(wrapper.getComponent(NDropdown).props('show')).toBe(true)
    expect(document.activeElement).toBe(trigger.element)

    expect(editor.state.selection).toMatchObject({
      from: positions[0],
      to: positions[0],
    })

    const languageOption = wrapper.get('[data-test="rich-text-code-block-language-typescript"]')
    expect(languageOption.attributes('aria-disabled')).toBeUndefined()

    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    languageOption.element.dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)

    await languageOption.trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: 'typescript' })
    expect(editor.getJSON().content?.[1]?.attrs).toEqual({ language: null })
    expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(true)
  })

  it('hides when an image dialog takes focus', async () => {
    const preset = createImageTestEditorPreset({
      upload: async () => ({ src: '/uploads/image.png' }),
    })
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions(preset),
      content: '<img src="/uploads/image.png">',
    })
    editor.commands.setNodeSelection(0)
    editor.view.focus()
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({
        featureBars: [imageQuickBar],
      }),
    )
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(true)

    const download = wrapper.get('[data-test="rich-text-quick-bar-image-download"]')
    const edit = wrapper.get('[data-test="rich-text-quick-bar-image"]')
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })

    editor.view.dom.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(download.element)

    await download.trigger('keydown', { key: 'ArrowRight' })
    expect(document.activeElement).toBe(edit.element)

    await edit.trigger('click')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-image-cancel"]')).not.toBeNull()
      expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(false)
    })
  })
})
