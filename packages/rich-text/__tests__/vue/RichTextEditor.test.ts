import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseFeature } from '../../src/features/base/shared'
import { boldFeature } from '../../src/features/bold/shared'
import { historyFeature } from '../../src/features/history/shared'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import type { RichTextDocument } from '../../src/schema'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { compactRichTextEditorPreset } from '../../src/vue/presets'

const contentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const toolbarDataTests = [
  'rich-text-bold',
  'rich-text-italic',
  'rich-text-underline',
  'rich-text-highlight',
  'rich-text-link',
  'rich-text-heading',
  'rich-text-list',
  'rich-text-blockquote',
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

async function selectDropdownCommand(wrapper: ReturnType<typeof mount>, commandKey: string) {
  const dropdown = wrapper.findAllComponents(NDropdown).find((component) => {
    const options = component.props('options') as Array<{ key: string | number }>

    return options.some((option) => option.key === commandKey)
  })

  if (!dropdown) {
    throw new Error(`Dropdown command not found: ${commandKey}`)
  }

  dropdown.vm.$emit('select', commandKey)
  await flushPromises()
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
    expect(wrapper.findAll('[data-test="rich-text-toolbar-group"]')).toHaveLength(4)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAllComponents(NDropdown)).toHaveLength(2)
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

  it('does not render a toolbar when the preset has no toolbar', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
    })

    await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-toolbar-group"]').exists()).toBe(false)
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

  it('reflects active formatting states in toolbar buttons', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: compactRichTextEditorPreset,
    })

    await getEditable(wrapper)

    await selectDropdownCommand(wrapper, 'heading-2')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-heading"]').attributes('data-active')).toBe('true')
      expect(wrapper.get('[data-test="rich-text-heading"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-test="rich-text-heading"]').attributes('title')).toBe('二级标题')
    })
    expect(wrapper.get('[data-test="rich-text-list"]').attributes('data-active')).toBe(undefined)

    await wrapper.get('[data-test="rich-text-bold"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-bold"]').attributes('data-active')).toBe('true')
      expect(wrapper.get('[data-test="rich-text-bold"]').attributes('aria-pressed')).toBe('true')
    })

    await selectDropdownCommand(wrapper, 'bullet-list')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-list"]').attributes('data-active')).toBe('true')
      expect(wrapper.get('[data-test="rich-text-list"]').attributes('title')).toBe('无序列表')
    })
  })

  it('updates toolbar and editor extensions when preset changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
    })

    await getEditable(wrapper)
    expect(wrapper.find('[data-test="rich-text-heading"]').exists()).toBe(false)

    await wrapper.setProps({ preset: compactRichTextEditorPreset })
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="rich-text-heading"]').exists()).toBe(true)
    })

    await selectDropdownCommand(wrapper, 'heading-1')
    await vi.waitFor(() => {
      expect(wrapper.find('.ProseMirror h1').text()).toContain('维护通知')
    })
  })
})
