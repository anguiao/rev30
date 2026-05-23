import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { TiptapDocument } from '@rev30/shared'
import RichTextEditor from '../../../src/features/content/RichTextEditor.vue'

const contentJson: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const toolbarDataTests = [
  'rich-text-bold',
  'rich-text-italic',
  'rich-text-underline',
  'rich-text-heading-1',
  'rich-text-heading-2',
  'rich-text-blockquote',
  'rich-text-bullet-list',
  'rich-text-ordered-list',
  'rich-text-horizontal-rule',
  'rich-text-link',
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
  it('renders editor content and toolbar buttons', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    const editable = await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(editable.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    const editable = await getEditable(wrapper)
    editable.element.innerHTML = '<p>新的通知</p>'
    await editable.trigger('input')
    await flushPromises()

    const modelValueEvents = wrapper.emitted('update:modelValue')

    expect(modelValueEvents).toBeTruthy()
    expect(modelValueEvents?.at(-1)?.[0]).toMatchObject({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '新的通知' }],
        },
      ],
    })
  })
})
