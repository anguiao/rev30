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
import { getRichTextSurfaceCoordinator } from '../../src/vue/surface-coordinator'
import { createTestEditor } from '../helpers/editor'

const BubbleMenuStub = defineComponent({
  props: {
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
  return mount(RichTextQuickbar, {
    attachTo: document.body,
    global: {
      stubs: {
        BubbleMenu: BubbleMenuStub,
      },
    },
    props: {
      editor: markRaw(editor),
      quickbar,
    },
  })
}

function mountRealQuickbar(
  editor: ReturnType<typeof createTestEditor>,
  quickbar = compactRichTextEditorPreset.quickbar as RichTextQuickbarConfig,
) {
  return mount(RichTextQuickbar, {
    attachTo: document.body,
    props: {
      editor: markRaw(editor),
      quickbar,
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

describe('RichTextQuickbar', () => {
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
    expect(quickbar.parentElement?.tabIndex).toBe(-1)

    const coordinator = getRichTextSurfaceCoordinator(editor)
    const owner = Symbol('toolbar-test')
    const toolbarTrigger = document.createElement('button')
    toolbarTrigger.addEventListener('pointerdown', () => {
      coordinator.claimToolbarLayer(owner, () => undefined)
    })
    document.body.appendChild(toolbarTrigger)
    quickbar.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
    toolbarTrigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-quickbar"]')).toBeNull()
    })

    coordinator.releaseToolbarLayer(owner)
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

  it('pins a mouse-opened teleported submenu and closes it when focus leaves the layer', async () => {
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
    const outsideElement = document.createElement('div')
    document.body.appendChild(outsideElement)
    await flushPromises()

    await wrapper.get('[data-test="rich-text-quickbar-more"]').trigger('click')

    const moreAction = await vi.waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '[data-test="rich-text-quickbar-more-italic"]',
      )
      expect(element).not.toBeNull()
      expect(document.activeElement).toBe(element)
      return element!
    })
    expect(moreAction.closest('[data-rich-text-quickbar-subinterface]')).not.toBeNull()

    editor.commands.setTextSelection({ from: 5, to: 8 })
    expect(editor.state.selection).toMatchObject({ from: 1, to: 4 })

    outsideElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(document.querySelector('[data-rich-text-quickbar-menu]')).toBeNull()
    expect(wrapper.find('[data-test="rich-text-quickbar"]').exists()).toBe(false)

    editor.view.focus()
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-quickbar"]').exists()).toBe(true)

    editor.commands.setTextSelection({ from: 5, to: 8 })
    expect(editor.state.selection).toMatchObject({ from: 5, to: 8 })
    outsideElement.remove()
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
