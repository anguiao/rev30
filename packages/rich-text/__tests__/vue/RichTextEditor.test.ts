import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseFeature } from '../../src/features/base/shared'
import { boldFeature } from '../../src/features/bold/shared'
import { historyFeature } from '../../src/features/history/shared'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import type { RichTextDocument } from '../../src/schema'
import { defineRichTextEditorPreset } from '../../src/vue/preset'
import { compactRichTextEditorPreset, compactRichTextToolbarLayout } from '../../src/vue/presets'

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

const noHeadingPreset = defineRichTextPreset({
  key: 'no-heading',
  features: [baseFeature, boldFeature, historyFeature],
})
const noHeadingEditorPreset = defineRichTextEditorPreset({
  preset: noHeadingPreset,
})

const wrappers: Array<ReturnType<typeof mount>> = []

function mountRichTextEditor(props: InstanceType<typeof RichTextEditor>['$props']) {
  const wrapper = mount(RichTextEditor, { props })
  wrappers.push(wrapper)
  return wrapper
}

async function getEditable(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('.ProseMirror[contenteditable="true"]').exists()).toBe(true)
  })

  return wrapper.get('.ProseMirror[contenteditable="true"]')
}

describe('RichTextEditor', () => {
  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount()
    }
  })

  it('renders editor content and compact toolbar buttons', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: compactRichTextEditorPreset,
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
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: compactRichTextEditorPreset,
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
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: compactRichTextEditorPreset,
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
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: compactRichTextEditorPreset,
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

  it('updates toolbar and editor extensions when preset changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
      toolbarLayout: compactRichTextToolbarLayout,
    })

    await getEditable(wrapper)
    expect(wrapper.find('[data-test="rich-text-heading-1"]').exists()).toBe(false)

    await wrapper.setProps({ preset: compactRichTextEditorPreset })
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="rich-text-heading-1"]').exists()).toBe(true)
    })

    await wrapper.get('[data-test="rich-text-heading-1"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('.ProseMirror h1').text()).toContain('维护通知')
    })
  })
})
