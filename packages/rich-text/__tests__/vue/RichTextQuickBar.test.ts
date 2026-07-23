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
import { italicActionItem } from '../../src/features/italic/editor'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import {
  defineRichTextQuickBar,
  richTextQuickBarAction,
  type RichTextQuickBarConfig,
} from '../../src/vue/quick-bar'
import RichTextQuickBar from '../../src/vue/quick-bar/RichTextQuickBar.vue'
import { createTestEditor } from '../helpers/editor'

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

    const controls = wrapper.findAll('[data-rich-text-quick-bar-roving]')
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

  it('skips disabled items during roving navigation', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(editor)
    await flushPromises()

    const controls = wrapper.findAll<HTMLElement>('[data-rich-text-quick-bar-roving]')
    const disabledLink = document.createElement('a')
    disabledLink.dataset.richTextQuickBarRoving = ''
    disabledLink.setAttribute('disabled', '')
    disabledLink.tabIndex = 0

    const ariaDisabledItem = document.createElement('div')
    ariaDisabledItem.dataset.richTextQuickBarRoving = ''
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
    const wrapper = mountRealQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: {
          main: [richTextQuickBarAction(boldActionItem)],
          more: [richTextQuickBarAction(italicActionItem)],
        },
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
    expect(quickBar.classList.contains('border-(--rich-text-theme-input-border-color)')).toBe(true)
    expect(quickBar.parentElement?.tabIndex).toBe(-1)

    await wrapper.get('[data-test="rich-text-quick-bar-more"]').trigger('click')
    expect(wrapper.get('[data-test="rich-text-quick-bar-more"]').attributes('aria-expanded')).toBe(
      'true',
    )

    const toolbarTrigger = document.createElement('button')
    document.body.appendChild(toolbarTrigger)
    toolbarTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    toolbarTrigger.focus()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quick-bar"]')).toBeNull()
    })

    editor.view.focus()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quick-bar"]')).not.toBeNull()
    })
    expect(wrapper.get('[data-test="rich-text-quick-bar-more"]').attributes('aria-expanded')).toBe(
      'false',
    )
    toolbarTrigger.remove()
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

  it('opens an inline more menu without moving focus', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickBar(
      editor,
      defineRichTextQuickBar({
        textControls: {
          main: [richTextQuickBarAction(boldActionItem)],
          more: [richTextQuickBarAction(italicActionItem)],
        },
      }),
    )
    await flushPromises()

    await wrapper.get('[data-test="rich-text-quick-bar-more"]').trigger('click')

    const moreAction = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-test="rich-text-quick-bar-more-italic"]',
      )
      expect(element).not.toBeNull()
      expect(document.activeElement).toBe(editor.view.dom)
      return element!
    })
    expect(wrapper.get('[data-test="rich-text-quick-bar"]').element.contains(moreAction)).toBe(true)

    moreAction.click()
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-quick-bar-more"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(editor.isActive('italic')).toBe(true)
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

    const trigger = wrapper.get('[data-test="rich-text-quick-bar-code-block-language"]')
    await trigger.trigger('click')
    await flushPromises()

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(trigger.element)

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(editor.state.selection).toMatchObject({
      from: positions[0],
      to: positions[0],
    })

    wrapper.getComponent(NDropdown).vm.$emit('select', 'typescript')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: 'typescript' })
    expect(editor.getJSON().content?.[1]?.attrs).toEqual({ language: null })
  })
})
