import Highlight from '@tiptap/extension-highlight'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { NButton } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HighlightToolbarControl from '../../../../src/features/highlight/vue/HighlightToolbarControl.vue'
import { highlightColors } from '../../../../src/features/highlight/vue'

const editors: Editor[] = []
const wrappers: Array<ReturnType<typeof mount>> = []

function createEditor(content = '<p>维护通知</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)

  const editor = new Editor({
    element,
    extensions: [Document, Paragraph, Text, Highlight.configure({ multicolor: true })],
    content,
  })
  editors.push(editor)

  return editor
}

function mountControl(editor: Editor, disabled = false) {
  const wrapper = mount(HighlightToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled,
      colors: [...highlightColors],
    },
  })
  wrappers.push(wrapper)

  return wrapper
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

async function openPopover(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('[data-test="rich-text-highlight-yellow"]').exists()).toBe(true)
  })
}

function getButtonComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const button = wrapper.findAllComponents(NButton).find((component) => {
    return component.attributes('data-test') === dataTest
  })

  if (!button) {
    throw new Error(`Button not found: ${dataTest}`)
  }

  return button
}

describe('HighlightToolbarControl', () => {
  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount()
    }

    document.body.innerHTML = ''

    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
  })

  it('sets and clears a fixed highlight color', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    getButtonComponent(wrapper, 'rich-text-highlight-yellow').vm.$emit('click')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })

    getButtonComponent(wrapper, 'rich-text-highlight-clear').vm.$emit('click')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
  })

  it('marks the current palette color as selected', async () => {
    const editor = createEditor(
      '<p><mark data-color="#bfdbfe" style="background-color: #bfdbfe; color: inherit">维护通知</mark></p>',
    )
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-highlight-blue"]').attributes('data-active')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-highlight-yellow"]').attributes('data-active')).toBe(
      undefined,
    )
  })

  it('does not run commands while disabled', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor, true)

    expect(wrapper.get('[data-test="rich-text-highlight"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="rich-text-highlight"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-highlight-yellow"]').exists()).toBe(false)
    expect(JSON.stringify(editor.getJSON())).not.toContain('highlight')
  })
})
