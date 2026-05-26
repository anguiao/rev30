import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import { compactRichTextPreset, compactRichTextToolbarLayout } from '../../src/presets'
import type { RichTextDocument } from '../../src/schema'

const contentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const toolbarDataTests = [
  'rich-text-bold',
  'rich-text-italic',
  'rich-text-underline',
  'rich-text-heading-1',
  'rich-text-heading-2',
  'rich-text-heading-3',
  'rich-text-blockquote',
  'rich-text-bullet-list',
  'rich-text-ordered-list',
  'rich-text-horizontal-rule',
  'rich-text-undo',
  'rich-text-redo',
]

async function getEditable(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('.ProseMirror[contenteditable="true"]').exists()).toBe(true)
  })

  return wrapper.get('.ProseMirror[contenteditable="true"]')
}

describe('RichTextEditor', () => {
  it('renders editor content and compact toolbar buttons', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
        toolbarLayout: compactRichTextToolbarLayout,
      },
    })

    const editable = await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-toolbar-group"]')).toHaveLength(5)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(editable.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    const editable = await getEditable(wrapper)
    editable.element.innerHTML = '<p>新的通知</p>'
    await editable.trigger('input')
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '新的通知' }] }],
    })
  })

  it('syncs external modelValue changes into the editor DOM', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    await getEditable(wrapper)
    await wrapper.setProps({
      modelValue: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '新的外部内容' }] }],
      },
    })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').text()).toContain('新的外部内容')
    })
  })

  it('toggles editor editability when disabled changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
        preset: compactRichTextPreset,
      },
    })

    await getEditable(wrapper)
    await wrapper.setProps({ disabled: true })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('false')
    })

    await wrapper.setProps({ disabled: false })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('true')
    })
  })
})
