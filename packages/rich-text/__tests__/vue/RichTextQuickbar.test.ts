import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { defineComponent, h, markRaw, type PropType } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextFeature } from '../../src/core/feature'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { boldToolbarItem } from '../../src/features/bold/vue'
import { codeBlockEditorFeature } from '../../src/features/code-block/editor'
import { codeBlockQuickbar } from '../../src/features/code-block/vue'
import { italicToolbarItem } from '../../src/features/italic/vue'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import {
  defineRichTextQuickbar,
  richTextFeatureQuickbar,
  richTextQuickbarAction,
  type RichTextQuickbarConfig,
} from '../../src/vue/quickbar'
import RichTextQuickbar from '../../src/vue/quickbar/RichTextQuickbar.vue'
import { richTextSurfaceTransactionMeta } from '../../src/vue/selection'
import { createTestEditor } from '../helpers/editor'
import { createTestRichTextOverlayState } from '../helpers/overlay'

const BubbleMenuStub = defineComponent({
  props: {
    getReferencedVirtualElement: {
      type: Function as PropType<() => HTMLElement | null>,
      required: true,
    },
    options: {
      type: Object as PropType<Record<string, unknown>>,
      required: true,
    },
    shouldShow: {
      type: Function as PropType<() => boolean>,
      required: true,
    },
  },
  setup(props, { slots }) {
    return () => (props.shouldShow() ? h('div', slots.default?.()) : null)
  },
})

function createEditor() {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(compactRichTextEditorPreset),
    content: '<p>one two</p>',
  })
}

function mountQuickbar(
  editor: ReturnType<typeof createTestEditor>,
  quickbar = compactRichTextEditorPreset.quickbar as RichTextQuickbarConfig,
) {
  const overlay = createTestRichTextOverlayState()
  const wrapper = mount(RichTextQuickbar, {
    attachTo: document.body,
    global: {
      provide: overlay.provide,
      stubs: {
        BubbleMenu: BubbleMenuStub,
      },
    },
    props: {
      editor: markRaw(editor),
      quickbar,
    },
  })

  return Object.assign(wrapper, { overlayState: overlay.state })
}

function mountRealQuickbar(
  editor: ReturnType<typeof createTestEditor>,
  quickbar = compactRichTextEditorPreset.quickbar as RichTextQuickbarConfig,
) {
  const overlay = createTestRichTextOverlayState()
  const wrapper = mount(RichTextQuickbar, {
    attachTo: document.body,
    global: { provide: overlay.provide },
    props: {
      editor: markRaw(editor),
      quickbar,
    },
  })

  return Object.assign(wrapper, { overlayState: overlay.state })
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

describe('RichTextQuickbar', () => {
  it('owns roving tabindex and arrow navigation for simple controls', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickbar(editor)
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

  it('drives the real BubbleMenu visibility and removes its wrapper from tab order', async () => {
    const editor = createEditor()
    const wrapper = mountRealQuickbar(editor)
    await flushPromises()

    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()

    const quickbar = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>('[data-test="rich-text-quickbar"]')
      expect(element).not.toBeNull()
      return element!
    })
    expect(quickbar.classList.contains('bg-popover')).toBe(true)
    expect(quickbar.parentElement?.tabIndex).toBe(-1)

    const toolbarOverlay = { close: () => undefined }
    const toolbarTrigger = document.createElement('button')
    toolbarTrigger.addEventListener('pointerdown', () => {
      wrapper.overlayState.openToolbarOverlay(toolbarOverlay)
    })
    document.body.appendChild(toolbarTrigger)
    quickbar.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    toolbarTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quickbar"]')).toBeNull()
    })

    wrapper.overlayState.closeToolbarOverlay(toolbarOverlay)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quickbar"]')).not.toBeNull()
    })
    toolbarTrigger.remove()

    await wrapper.setProps({ disabled: true })
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quickbar"]')).toBeNull()
    })

    await wrapper.setProps({ disabled: false })
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quickbar"]')).not.toBeNull()
    })
  })

  it('keeps the pinned target across selection-only transactions until focus returns to the editor', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickbar(editor)
    await flushPromises()

    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    editor.view.dom.dispatchEvent(tab)
    await flushPromises()

    const firstControl = wrapper.get('[data-test="rich-text-quickbar-bold"]')
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(firstControl.element)

    editor.commands.setTextSelection({ from: 5, to: 8 })
    expect(editor.state.selection).toMatchObject({ from: 1, to: 4 })
    expect(document.activeElement).toBe(firstControl.element)

    editor.view.focus()
    editor.commands.setTextSelection({ from: 5, to: 8 })
    expect(editor.state.selection).toMatchObject({ from: 5, to: 8 })
  })

  it('opens a teleported more menu without moving focus', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 4 })
    editor.view.focus()
    const wrapper = mountQuickbar(
      editor,
      defineRichTextQuickbar({
        text: {
          primary: [richTextQuickbarAction(boldToolbarItem)],
          more: [richTextQuickbarAction(italicToolbarItem)],
        },
      }),
    )
    await flushPromises()

    await wrapper.get('[data-test="rich-text-quickbar-more"]').trigger('click')

    const moreAction = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-test="rich-text-quickbar-more-italic"]',
      )
      expect(element).not.toBeNull()
      expect(document.activeElement).toBe(editor.view.dom)
      return element!
    })
    expect(moreAction.closest('[data-rich-text-quickbar-subinterface]')).not.toBeNull()

    moreAction.click()
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-quickbar-more"]').attributes('aria-expanded')).toBe(
      'false',
    )
    expect(editor.isActive('italic')).toBe(true)
  })

  it('anchors the code block Quickbar to the block end instead of the cursor', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const value = 1</code></pre>',
    })
    const position = findCodeBlockTextPositions(editor)[0]!
    editor.commands.setTextSelection(position)
    editor.view.focus()
    const wrapper = mountQuickbar(editor, defineRichTextQuickbar({ features: [codeBlockQuickbar] }))
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

  it('pins a mouse-opened code language menu to its original block', async () => {
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
      content: '<pre><code>const first = 1</code></pre><pre><code>const second = 2</code></pre>',
    })
    const positions = findCodeBlockTextPositions(editor)
    editor.commands.setTextSelection(positions[0]!)
    editor.view.focus()
    const wrapper = mountQuickbar(
      editor,
      defineRichTextQuickbar({
        features: [codeBlockQuickbar],
      }),
    )
    await flushPromises()

    const trigger = wrapper.get('[data-test="rich-text-quickbar-code-block-language"]')
    await trigger.trigger('click')
    await flushPromises()

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(trigger.element)

    editor.commands.setTextSelection(positions[1]!)
    await flushPromises()

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

  it('does not invalidate a pinned surface for its own document transaction', async () => {
    const close = vi.fn()
    const feature = defineRichTextFeature({
      key: 'transaction-test',
      editorImplementation: true,
      serverImplementation: false,
    })
    const Surface = defineComponent({
      props: {
        editor: {
          type: Object as PropType<ReturnType<typeof createTestEditor>>,
          required: true,
        },
      },
      setup(props, { expose }) {
        expose({ close })

        return () =>
          h(
            'button',
            {
              'data-test': 'rich-text-transaction-surface',
              onClick: () => {
                props.editor.view.dispatch(
                  props.editor.state.tr
                    .insertText('x')
                    .setMeta(richTextSurfaceTransactionMeta, Symbol('transaction-test')),
                )
              },
            },
            'Run',
          )
      },
    })
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text],
      content: '<p>one</p>',
    })
    editor.commands.setTextSelection(1)
    editor.view.focus()
    const wrapper = mountQuickbar(
      editor,
      defineRichTextQuickbar({
        features: [
          richTextFeatureQuickbar({
            feature,
            key: feature.key,
            isActive: () => true,
            component: Surface,
            props: {},
          }),
        ],
      }),
    )
    await flushPromises()

    const button = wrapper.get('[data-test="rich-text-transaction-surface"]')
    ;(button.element as HTMLElement).focus()
    await button.trigger('click')
    await flushPromises()

    expect(editor.getText()).toBe('xone')
    expect(close).not.toHaveBeenCalledWith('invalidated')
    expect(wrapper.find('[data-test="rich-text-quickbar"]').exists()).toBe(true)
  })
})
