import { flushPromises, mount } from '@vue/test-utils'
import { NConfigProvider, NDropdown, NPopover } from 'naive-ui'
import { defineComponent, h } from 'vue'
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
import { defineRichTextStatusBar, richTextStatusBarComponent } from '../../src/vue/status-bar'

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
  'rich-text-code-block-language',
  'rich-text-horizontal-rule',
  'rich-text-image',
  'rich-text-undo',
  'rich-text-redo',
  'rich-text-search-replace',
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

function createStatusBarItem(key: string, label: string) {
  return richTextStatusBarComponent({
    feature: baseFeature,
    key,
    component: defineComponent({
      props: {
        editor: {
          type: Object,
          required: true,
        },
      },
      setup: () => () => h('span', { 'data-test': `rich-text-${key}` }, label),
    }),
    props: {},
  })
}

const statusBarStartItem = createStatusBarItem('status-start-item', '段落')
const statusBarEndItem = createStatusBarItem('status-end-item', '状态')
const statusBarPreset = defineRichTextPreset({
  key: 'status-bar-layout',
  features: [baseFeature],
})
const statusBarEditorPreset = defineRichTextEditorPreset(statusBarPreset, {
  editorFeatures: [baseEditorFeature],
  statusBar: defineRichTextStatusBar({
    start: [statusBarStartItem],
    end: [statusBarEndItem],
  }),
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
  it('maps Naive UI theme vars to package-scoped theme defaults', async () => {
    const wrapper = mount(NConfigProvider, {
      props: {
        themeOverrides: {
          common: {
            borderRadius: '7px',
            primaryColor: '#123456',
            primaryColorHover: '#234567',
            popoverColor: '#345678',
            inputColor: '#456789',
            borderColor: '#56789a',
            dividerColor: '#6789ab',
            textColor3: '#789abc',
          },
        },
      },
      slots: {
        default: () =>
          h(RichTextEditor, {
            modelValue: contentJson,
            preset: noHeadingEditorPreset,
          }),
      },
    })

    await getEditable(wrapper)
    const editor = wrapper.get<HTMLElement>('[data-test="rich-text-editor"]')

    expect(editor.classes()).toContain('rich-text-theme')
    expect(editor.element.style.getPropertyValue('--rich-text-default-border-radius')).toBe('7px')
    expect(editor.element.style.getPropertyValue('--rich-text-default-primary-color')).toBe(
      '#123456',
    )
    expect(editor.element.style.getPropertyValue('--rich-text-default-popover-color')).toBe(
      '#345678',
    )
    expect(editor.element.style.getPropertyValue('--rich-text-default-input-color')).toBe('#456789')
    expect(editor.element.style.getPropertyValue('--rich-text-default-muted-text-color')).toBe(
      '#789abc',
    )
  })

  it('renders editor content, toolbar controls, and status bar items', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })

    const editable = await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-editor"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-toolbar"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rich-text-toolbar-group"]')).toHaveLength(5)
    for (const dataTest of toolbarDataTests) {
      expect(wrapper.find(`[data-test="${dataTest}"]`).exists()).toBe(true)
    }
    expect(wrapper.findAllComponents(NDropdown)).toHaveLength(7)
    const overlayHost = wrapper.get('[data-test="rich-text-overlay-host"]').element
    const nonModalOverlays = [
      ...wrapper.findAllComponents(NDropdown),
      ...wrapper.findAllComponents(NPopover),
    ]
    expect(nonModalOverlays.length).toBeGreaterThan(0)
    expect(nonModalOverlays.every((overlay) => overlay.props().to === overlayHost)).toBe(true)
    expect(wrapper.get('[data-test="rich-text-status-bar"]').text()).toBe('4 字')
    expect(wrapper.find('[data-test="rich-text-status-bar-start"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-status-bar-end"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-character-count"]').exists()).toBe(true)
    expect(editable.text()).toContain('维护通知')
  })

  it('renders status bar items in their configured regions', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: statusBarEditorPreset,
    })

    await getEditable(wrapper)

    const start = wrapper.get('[data-test="rich-text-status-bar-start"]')
    const end = wrapper.get('[data-test="rich-text-status-bar-end"]')

    expect(start.get('[data-test="rich-text-status-start-item"]').text()).toBe('段落')
    expect(end.get('[data-test="rich-text-status-end-item"]').text()).toBe('状态')
  })

  it('rejects duplicate status bar item keys across regions', () => {
    expect(() =>
      defineRichTextStatusBar({
        start: [statusBarStartItem],
        end: [statusBarStartItem],
      }),
    ).toThrow('Rich text status bar has a duplicate item: "status-start-item"')
  })

  it('emits updated Tiptap JSON when content changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
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
      preset: noHeadingEditorPreset,
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

  it('does not render toolbar or status bar regions when the preset omits them', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
    })

    await getEditable(wrapper)

    expect(wrapper.find('[data-test="rich-text-toolbar"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-toolbar-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-status-bar"]').exists()).toBe(false)
  })

  it('emits blur only after focus leaves the complete editor interaction surface', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })
    const editable = await getEditable(wrapper)
    const overlayHost = wrapper.get('[data-test="rich-text-overlay-host"]')
    const overlayButton = document.createElement('button')
    const outsideButton = document.createElement('button')
    overlayHost.element.appendChild(overlayButton)
    document.body.appendChild(outsideButton)

    await editable.trigger('focusout', { relatedTarget: overlayButton })
    expect(wrapper.emitted('blur')).toBeUndefined()

    overlayButton.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: editable.element }),
    )
    expect(wrapper.emitted('blur')).toBeUndefined()

    overlayButton.dispatchEvent(
      new FocusEvent('focusout', { bubbles: true, relatedTarget: outsideButton }),
    )
    expect(wrapper.emitted('blur')).toHaveLength(1)

    outsideButton.remove()
  })

  it('toggles editor editability when disabled changes', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: noHeadingEditorPreset,
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

  it('updates undo and redo button availability with editor history', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })

    const editable = await getEditable(wrapper)
    const undoButton = wrapper.get('[data-test="rich-text-undo"]')
    const redoButton = wrapper.get('[data-test="rich-text-redo"]')

    expect(undoButton.attributes('disabled')).toBeDefined()
    expect(redoButton.attributes('disabled')).toBeDefined()

    editable.element.innerHTML = '<p>新的通知</p>'
    await editable.trigger('input')

    await vi.waitFor(() => {
      expect(undoButton.attributes('disabled')).toBeUndefined()
    })

    await undoButton.trigger('click')

    await vi.waitFor(() => {
      expect(redoButton.attributes('disabled')).toBeUndefined()
    })
  })

  it('creates, configures, and exits code blocks with a split button', async () => {
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
    const codeBlockButton = wrapper.get('[data-test="rich-text-code-block"]')
    const languageDropdown = wrapper.findAllComponents(NDropdown).find((component) => {
      const options = component.props('options') as Array<{ key: string | number }>

      return options.some((option) => option.key === 'typescript')
    })

    expect(languageDropdown?.props('disabled')).toBe(true)
    await codeBlockButton.trigger('click')

    await vi.waitFor(() => {
      expect(codeBlockButton.attributes('data-active')).toBe('true')
      expect(languageDropdown?.props('disabled')).toBe(false)
      expect(wrapper.find('.ProseMirror pre').exists()).toBe(true)
    })

    await selectDropdownCommand(wrapper, 'typescript')

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror code').classes()).toContain('language-typescript')
      expect(wrapper.get('.ProseMirror .hljs-keyword').text()).toBe('const')
    })

    await selectDropdownCommand(wrapper, 'plaintext')

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror code').classes()).not.toContain('language-typescript')
    })

    await codeBlockButton.trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.find('.ProseMirror pre').exists()).toBe(false)
      expect(wrapper.get('.ProseMirror p').text()).toBe('const ready = true')
    })
  })

  it('creates a paragraph after a trailing code block when clicking editor whitespace', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: {
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: null },
            content: [{ type: 'text', text: 'const ready = true' }],
          },
        ],
      },
      preset: allEditorPreset,
    })

    const editable = await getEditable(wrapper)
    expect(editable.element.parentElement?.classList.contains('h-full')).toBe(true)
    const codeBlock = editable.get('pre')
    codeBlock.element.getBoundingClientRect = () => ({ bottom: 100 }) as DOMRect

    await editable.trigger('click', { clientY: 120 })

    await vi.waitFor(() => {
      expect(editable.findAll(':scope > *').map((node) => node.element.tagName)).toEqual([
        'PRE',
        'P',
      ])
      expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
        content: [{ type: 'codeBlock' }, { type: 'paragraph' }],
      })
    })
  })
})
