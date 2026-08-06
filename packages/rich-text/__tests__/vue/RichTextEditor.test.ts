import { flushPromises, mount } from '@vue/test-utils'
import { columnResizingPluginKey } from '@tiptap/pm/tables'
import { EditorContent, type Editor } from '@tiptap/vue-3'
import { NConfigProvider, NDropdown } from 'naive-ui'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { RichTextFeature } from '../../src/core/feature'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { boldEditorFeature } from '../../src/features/bold/editor'
import { boldFeature } from '../../src/features/bold/shared'
import { historyEditorFeature } from '../../src/features/history/editor'
import { historyFeature } from '../../src/features/history/shared'
import { tableEditorFeature } from '../../src/features/table/editor'
import { tableFeature } from '../../src/features/table/shared'
import RichTextEditor from '../../src/vue/RichTextEditor.vue'
import type { RichTextDocument } from '../../src/schema'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { createAllRichTextEditorPreset } from '../../src/vue/presets/all'
import { compactRichTextEditorPreset } from '../../src/vue/presets/compact'
import { defineRichTextStatusBar, richTextStatusBarComponent } from '../../src/vue/status-bar'
import { appendTestElement } from '../helpers/editor'

const contentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '维护通知' }] }],
}

const emptyContentJson: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
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
  'rich-text-table',
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

const tableResizePreset = defineRichTextPreset({
  key: 'table-resize',
  features: [baseFeature, tableFeature],
})
const tableResizeEditorPreset = defineRichTextEditorPreset(tableResizePreset, {
  editorFeatures: [baseEditorFeature, tableEditorFeature],
})

function createStatusBarItem(feature: RichTextFeature, label: string) {
  return richTextStatusBarComponent({
    feature,
    component: defineComponent({
      props: {
        editor: {
          type: Object,
          required: true,
        },
      },
      setup: () => () => h('span', { 'data-test': `rich-text-${feature.key}` }, label),
    }),
    props: {},
  })
}

const statusBarStartItem = createStatusBarItem(baseFeature, 'Paragraph')
const statusBarEndItem = createStatusBarItem(boldFeature, 'Status')
const statusBarPreset = defineRichTextPreset({
  key: 'status-bar-layout',
  features: [baseFeature, boldFeature],
})
const statusBarEditorPreset = defineRichTextEditorPreset(statusBarPreset, {
  editorFeatures: [baseEditorFeature, boldEditorFeature],
  statusBar: defineRichTextStatusBar({
    start: [statusBarStartItem],
    end: [statusBarEndItem],
  }),
})

function mountRichTextEditor(props: InstanceType<typeof RichTextEditor>['$props']) {
  return mount(RichTextEditor, { props })
}

function getTiptapEditor(wrapper: ReturnType<typeof mount>) {
  return wrapper.findComponent(EditorContent).props('editor') as Editor
}

async function getEditable(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  expect(wrapper.find('.ProseMirror[contenteditable="true"]').exists()).toBe(true)

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
            errorColor: '#a12345',
            popoverColor: '#345678',
            inputColor: '#456789',
            borderColor: '#56789a',
            dividerColor: '#6789ab',
            textColor3: '#789abc',
            tableHeaderColor: '#89abcd',
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
    expect(editor.element.style.getPropertyValue('--rich-text-default-error-color')).toBe('#a12345')
    expect(editor.element.style.getPropertyValue('--rich-text-default-popover-color')).toBe(
      '#345678',
    )
    expect(editor.element.style.getPropertyValue('--rich-text-default-input-color')).toBe('#456789')
    expect(editor.element.style.getPropertyValue('--rich-text-default-input-divider-color')).toBe(
      '#6789ab',
    )
    expect(editor.element.style.getPropertyValue('--rich-text-default-table-border-color')).toBe(
      '#6789ab',
    )
    expect(editor.element.style.getPropertyValue('--rich-text-default-table-header-color')).toBe(
      '#89abcd',
    )
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
    expect(wrapper.get('[data-test="rich-text-status-bar"]').text()).toBe('p4 字')
    expect(wrapper.find('[data-test="rich-text-status-bar-start"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-status-bar-end"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-element-path"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rich-text-character-count"]').exists()).toBe(true)
    expect(editable.element.parentElement?.classList).toContain('rich-text-content')
    expect(editable.element.parentElement?.classList).toContain('rich-text-content--sm')
    expect(editable.text()).toContain('维护通知')
  })

  it('renders table semantics inside the responsive table wrapper', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                    content: [{ type: 'paragraph', attrs: { textAlign: null } }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
                    content: [{ type: 'paragraph', attrs: { textAlign: null } }],
                  },
                ],
              },
            ],
          },
        ],
      },
      preset: allEditorPreset,
    })

    await getEditable(wrapper)

    expect(wrapper.find('.ProseMirror .tableWrapper').exists()).toBe(true)
    expect(wrapper.find('.ProseMirror .tableWrapper table').exists()).toBe(true)
    expect(wrapper.find('.ProseMirror .tableWrapper th').exists()).toBe(true)
    expect(wrapper.find('.ProseMirror .tableWrapper td').exists()).toBe(true)
  })

  it('renders status bar items in their configured regions', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: statusBarEditorPreset,
    })

    await getEditable(wrapper)

    const start = wrapper.get('[data-test="rich-text-status-bar-start"]')
    const end = wrapper.get('[data-test="rich-text-status-bar-end"]')

    expect(start.get('[data-test="rich-text-base"]').text()).toBe('Paragraph')
    expect(end.get('[data-test="rich-text-bold"]').text()).toBe('Status')
  })

  it('rejects duplicate status bar item keys across regions', () => {
    expect(() =>
      defineRichTextStatusBar({
        start: [statusBarStartItem],
        end: [statusBarStartItem],
      }),
    ).toThrow('Rich text status bar has a duplicate item: "base"')
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

  it('shows the slash command hint for the compact preset', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: emptyContentJson,
      preset: compactRichTextEditorPreset,
    })

    await getEditable(wrapper)

    const paragraph = wrapper.get('.ProseMirror p')
    expect(paragraph.classes()).toContain('rich-text-slash-menu-placeholder')
    expect(paragraph.attributes('data-placeholder')).toBe('开始输入，或按 / 唤起命令')
  })

  it('emits blur only after focus leaves the complete editor interaction surface', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })
    const editable = await getEditable(wrapper)
    const editorRoot = wrapper.get('[data-test="rich-text-editor"]')
    const overlayButton = document.createElement('button')
    const outsideButton = appendTestElement('button')
    editorRoot.element.appendChild(overlayButton)

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
  })

  it('defers an unknown focusout until focus restoration settles', async () => {
    const wrapper = mount(RichTextEditor, {
      attachTo: document.body,
      props: { modelValue: contentJson, preset: allEditorPreset },
    })
    const editable = await getEditable(wrapper)
    const outsideButton = appendTestElement('button')
    const restoredButton = wrapper
      .findAll<HTMLElement>('[data-rich-text-toolbar-item]')
      .find((item) => !item.element.matches(':disabled'))!.element

    void nextTick(() => restoredButton.focus())
    editable.element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('blur')).toBeUndefined()

    outsideButton.focus()
    expect(wrapper.emitted('blur')).toHaveLength(1)
  })

  it('keeps column resizing registered while editability changes from an initial disabled state', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: tableResizeEditorPreset,
      disabled: true,
    })

    await flushPromises()

    const editor = getTiptapEditor(wrapper)
    const document = editor.state.doc
    const selection = editor.state.selection
    const resizeState = columnResizingPluginKey.getState(editor.state)

    expect(resizeState).toBeDefined()
    expect(editor.isEditable).toBe(false)
    expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('false')

    await wrapper.setProps({ disabled: false })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('true')
    })

    expect(getTiptapEditor(wrapper)).toBe(editor)
    expect(editor.state.doc).toBe(document)
    expect(editor.state.selection).toBe(selection)
    expect(columnResizingPluginKey.getState(editor.state)).toBe(resizeState)

    await wrapper.setProps({ disabled: true })

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('false')
    })

    expect(editor.isEditable).toBe(false)
    expect(columnResizingPluginKey.getState(editor.state)).toBe(resizeState)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps all-preset overlay layers stable while disabled changes', async () => {
    const unhandledErrors: unknown[] = []
    const handleError = (event: ErrorEvent) => {
      unhandledErrors.push(event.error ?? event.message)
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      unhandledErrors.push(event.reason)
      event.preventDefault()
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    try {
      const wrapper = mountRichTextEditor({
        modelValue: contentJson,
        preset: allEditorPreset,
        disabled: true,
      })
      await flushPromises()

      const editor = getTiptapEditor(wrapper)
      const document = editor.state.doc
      expect(editor.isEditable).toBe(false)
      expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="rich-text-slash-menu"]').exists()).toBe(false)

      await wrapper.setProps({ disabled: false })
      await vi.waitFor(() => {
        expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('true')
      })

      await wrapper.setProps({ disabled: true })
      await vi.waitFor(() => {
        expect(wrapper.get('.ProseMirror').attributes('contenteditable')).toBe('false')
      })

      expect(editor.state.doc).toBe(document)
      expect(wrapper.find('[data-test="rich-text-quick-bar"]').exists()).toBe(false)
      expect(wrapper.find('[data-test="rich-text-slash-menu"]').exists()).toBe(false)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      expect(unhandledErrors).toEqual([])
    } finally {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  })

  it('reflects active formatting states in toolbar buttons', async () => {
    const wrapper = mountRichTextEditor({
      modelValue: contentJson,
      preset: allEditorPreset,
    })

    await getEditable(wrapper)

    await selectDropdownCommand(wrapper, 'heading-2')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-heading"]').attributes('aria-pressed')).toBe('true')
      expect(wrapper.get('[data-test="rich-text-heading"]').attributes('title')).toBe('二级标题')
    })
    expect(wrapper.get('[data-test="rich-text-list"]').attributes('aria-pressed')).toBe('false')

    await wrapper.get('[data-test="rich-text-bold"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-bold"]').attributes('aria-pressed')).toBe('true')
    })

    await selectDropdownCommand(wrapper, 'bullet-list')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-test="rich-text-list"]').attributes('aria-pressed')).toBe('true')
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

  it('creates and configures code blocks with one dropdown', async () => {
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

    expect(languageDropdown?.props('disabled')).toBe(false)

    await selectDropdownCommand(wrapper, 'typescript')

    await vi.waitFor(() => {
      expect(codeBlockButton.attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.ProseMirror pre').exists()).toBe(true)
      expect(wrapper.get('.ProseMirror code').classes()).toContain('language-typescript')
      expect(wrapper.get('.ProseMirror .hljs-keyword').text()).toBe('const')
    })

    await selectDropdownCommand(wrapper, 'plaintext')

    await vi.waitFor(() => {
      expect(wrapper.get('.ProseMirror code').classes()).not.toContain('language-typescript')
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
