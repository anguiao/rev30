import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { TiptapDocument } from '@rev30/shared'
import RichTextEditor from '../../../src/features/content/RichTextEditor.vue'

const contentJson: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

describe('RichTextEditor', () => {
  it('renders editor content and toolbar buttons', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-bold"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mount(RichTextEditor, {
      props: {
        modelValue: contentJson,
      },
    })

    await wrapper.find('[contenteditable="true"]').setValue('新的通知')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
  })
})
