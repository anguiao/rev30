import type { Editor as CoreEditor } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { defineRichTextAction, defineRichTextActionItem } from '../../src/editor/action'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature, paragraphActionItem } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import {
  defineRichTextSlashMenu,
  richTextSlashCommand,
  type RichTextSlashCommand,
  type RichTextSlashMenuGroup,
} from '../../src/vue/slash-menu'
import RichTextSlashMenu from '../../src/vue/slash-menu/RichTextSlashMenu.vue'
import { appendTestElement, createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-menu-test',
  features: [baseFeature],
})

const groups = defineRichTextSlashMenu([
  {
    key: 'basic',
    label: '基础块',
    commands: [richTextSlashCommand(paragraphActionItem)],
  },
])

function createCommand(
  key: string,
  options: {
    enabled?: boolean
    run?: (editor: CoreEditor) => boolean
  } = {},
) {
  const item = defineRichTextActionItem(
    defineRichTextAction(baseFeature, {
      key,
      command: () => true,
    }),
    {
      label: key,
      icon: 'i-[lucide--pilcrow]',
    },
  )

  return {
    feature: item.action.feature,
    key: item.action.key,
    label: item.label,
    icon: item.icon,
    keywords: item.keywords,
    command: ({ editor, dispatch }) =>
      dispatch ? (options.run?.(editor) ?? true) : (options.enabled ?? true),
  } satisfies RichTextSlashCommand
}

function createGroups(commands: readonly RichTextSlashCommand[]) {
  return defineRichTextSlashMenu([
    { key: 'first-group', label: '第一组', commands: commands.slice(0, 2) },
    { key: 'second-group', label: '第二组', commands: commands.slice(2) },
  ])
}

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature],
    }),
    content,
  })
}

function typeText(editor: Editor, text: string) {
  const { from, to } = editor.state.selection

  editor.view.someProp('handleTextInput', (handler) =>
    handler(editor.view, from, to, text, () => editor.state.tr),
  )
  editor.view.dispatch(editor.state.tr.insertText(text, from, to))
}

function dispatchEditorKey(editor: Editor, key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  editor.view.dom.dispatchEvent(event)

  return { event, handled: event.defaultPrevented }
}

async function mountSlashMenu(
  editor: Editor,
  menuGroups: readonly RichTextSlashMenuGroup[] = groups,
  appendTo: HTMLElement = document.body,
) {
  const wrapper = mount(RichTextSlashMenu, {
    props: { editor, slashMenu: menuGroups, appendTo },
  })

  await flushPromises()
  return wrapper
}

describe('RichTextSlashMenu', () => {
  it('mounts the same command list for slash while the editor retains focus and ARIA ownership', async () => {
    const editor = createEditor()
    const editorRoot = appendTestElement('div')

    editorRoot.append(editor.view.dom)

    await mountSlashMenu(editor, groups, editorRoot)
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).not.toBeNull()
    })

    const listbox = document.querySelector<HTMLElement>('[data-test="rich-text-slash-menu"]')
    const group = listbox?.querySelector('section')

    expect(document.activeElement).toBe(editor.view.dom)
    expect(editorRoot.contains(listbox)).toBe(true)
    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
    expect(listbox?.classList.contains('bg-(--rich-text-theme-popover-color)')).toBe(true)
    expect(listbox?.classList.contains('bg-(--rich-text-theme-input-color)')).toBe(false)
    expect(listbox?.classList.contains('border')).toBe(true)
    expect(listbox?.classList.contains('border-(--rich-text-theme-input-border-color)')).toBe(true)
    expect(group?.classList.contains('border-stone-200')).toBe(true)
    expect(group?.classList.contains('dark:border-zinc-500/60')).toBe(true)
    expect(editor.view.dom.getAttribute('aria-controls')).toBe(listbox?.id)
    expect(editor.view.dom.getAttribute('aria-expanded')).toBe('true')
    await vi.waitFor(() => {
      expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-paragraph')
    })

    const { handled } = dispatchEditorKey(editor, 'Enter')

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).toBeNull()
    })
    expect(editor.getText()).toBe('')
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
    expect(editor.view.dom.hasAttribute('aria-expanded')).toBe(false)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('navigates enabled commands across groups and executes the active command', async () => {
    const editor = createEditor()
    const disabledRun = vi.fn(() => true)
    const secondRun = vi.fn(() => true)
    const thirdRun = vi.fn(() => true)

    await mountSlashMenu(
      editor,
      createGroups([
        createCommand('disabled', { enabled: false, run: disabledRun }),
        createCommand('second', { run: secondRun }),
        createCommand('third', { run: thirdRun }),
      ]),
    )
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-second')
    })

    const disabled = document.querySelector<HTMLElement>(
      '[data-test="rich-text-slash-menu-disabled"]',
    )
    expect(disabled?.getAttribute('aria-disabled')).toBe('true')
    disabled?.click()
    expect(disabledRun).not.toHaveBeenCalled()

    dispatchEditorKey(editor, 'ArrowDown')
    await nextTick()
    expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-third')

    dispatchEditorKey(editor, 'ArrowDown')
    await nextTick()
    expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-second')

    dispatchEditorKey(editor, 'ArrowUp')
    await nextTick()
    expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-third')

    expect(dispatchEditorKey(editor, 'Enter').handled).toBe(true)
    expect(thirdRun).toHaveBeenCalledOnce()
    expect(secondRun).not.toHaveBeenCalled()
  })

  it('cleans up an active slash session when unmounted', async () => {
    const editor = createEditor()
    const wrapper = await mountSlashMenu(editor)

    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).not.toBeNull()
    })

    wrapper.unmount()

    expect(document.querySelector('[data-test="rich-text-slash-menu"]')).toBeNull()
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
    expect(editor.view.dom.hasAttribute('aria-expanded')).toBe(false)
  })

  it('shows an empty slash state and lets Tab close without consuming the event or deleting text', async () => {
    const editor = createEditor()

    await mountSlashMenu(editor)
    editor.view.focus()
    typeText(editor, '/')
    typeText(editor, 'unknown')

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('无匹配命令')
    })

    expect(editor.view.dom.hasAttribute('aria-activedescendant')).toBe(false)

    const { event, handled } = dispatchEditorKey(editor, 'Tab')

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/unknown')
  })

  it('closes the slash session on Escape while preserving the query and editor focus', async () => {
    const editor = createEditor()

    await mountSlashMenu(editor)
    editor.view.focus()
    typeText(editor, '/')
    typeText(editor, 'paragraph')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).not.toBeNull()
    })

    const { event, handled } = dispatchEditorKey(editor, 'Escape')

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-menu"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/paragraph')
    expect(document.activeElement).toBe(editor.view.dom)
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
  })
})
