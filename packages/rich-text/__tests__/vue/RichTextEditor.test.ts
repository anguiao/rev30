import { flushPromises, mount } from '@vue/test-utils'
import { NDropdown } from 'naive-ui'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { boldEditorFeature } from '../../src/features/bold/editor'
import { boldFeature } from '../../src/features/bold/shared'
import { historyEditorFeature } from '../../src/features/history/editor'
import { historyFeature } from '../../src/features/history/shared'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import type { RichTextDocument } from '../../src/schema'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'

const contentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const toolbarDataTests = [
  'rich-text-bold',
  'rich-text-italic',
  'rich-text-underline',
  'rich-text-strike',
  'rich-text-inline-code',
  'rich-text-highlight',
  'rich-text-text-color',
  'rich-text-font-family',
  'rich-text-font-size',
  'rich-text-line-height',
  'rich-text-link',
  'rich-text-remove-format',
  'rich-text-heading',
  'rich-text-text-align',
  'rich-text-list',
  'rich-text-blockquote',
  'rich-text-code-block',
  'rich-text-horizontal-rule',
  'rich-text-image',
  'rich-text-undo',
  'rich-text-redo',
]

const allEditorPreset = createAllRichTextEditorPreset({
  image: {
    upload: async (file) => ({
      src: `/api/attachments/${file.name}/content`,
    }),
  },
})

const noHeadingPreset = defineRichTextPreset({
  key: 'no-heading',
  features: [baseFeature, boldFeature, historyFeature],
})
const noHeadingEditorPreset = defineRichTextEditorPreset(noHeadingPreset, {
  editorFeatures: [baseEditorFeature, boldEditorFeature, historyEditorFeature],
})

function mountRichTextEditor(props: InstanceType<typeof RichTextEditor>['$props']) {
  return mount(RichTextEditor, { props })
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
  it('renders editor content and all toolbar buttons', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })

    const editable = await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-toolbar-group"]')).toHaveLength(5)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAllComponents(NDropdown)).toHaveLength(7)
    expect(editable.text()).toContain('维护通知')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
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
      preset: allEditorPreset,
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
      preset: allEditorPreset,
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
      preset: allEditorPreset,
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

  it('creates, configures, and exits code blocks from the language dropdown', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'const ready = true' }],
          },
        ],
      },
      preset: allEditorPreset,
    })

    await getEditable(wrapper)
    await selectDropdownCommand(wrapper, 'code-block-language-typescript')

    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-code-block"]').attributes('data-active')).toBe(
        'true',
      )
      expect(wrapper.get('[data-test="rich-text-code-block"]').attributes('title')).toBe(
        '代码块：TypeScript',
      )
      expect(wrapper.get('.ProseMirror code').classes()).toContain('language-typescript')
      expect(wrapper.get('.ProseMirror .hljs-keyword').text()).toBe('const')
    })

    await selectDropdownCommand(wrapper, 'code-block-auto')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-code-block"]').attributes('title')).toBe(
        '代码块：自动检测',
      )
      expect(wrapper.get('.ProseMirror code').classes()).not.toContain('language-typescript')
    })

    await selectDropdownCommand(wrapper, 'code-block-paragraph')
    await vi.waitFor(() => {
      expect(wrapper.find('.ProseMirror pre').exists()).toBe(false)
      expect(wrapper.get('.ProseMirror p').text()).toBe('const ready = true')
    })
  })

  it('updates toolbar and editor extensions when preset changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
    })

    await getEditable(wrapper)
    expect(wrapper.find('[data-test="rich-text-heading"]').exists()).toBe(false)

    await wrapper.setProps({ preset: allEditorPreset })
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="rich-text-heading"]').exists()).toBe(true)
    })

    await selectDropdownCommand(wrapper, 'heading-1')
    await vi.waitFor(() => {
      expect(wrapper.find('.ProseMirror h1').text()).toContain('维护通知')
    })
  })
})
