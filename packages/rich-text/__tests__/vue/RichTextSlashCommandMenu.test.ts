import type { Editor } from '@tiptap/core'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature, paragraphActionItem } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { slashCommandEditorFeature } from '../../src/features/slash-command/editor'
import { slashCommandFeature } from '../../src/features/slash-command/shared'
import { defineRichTextSlashCommand, richTextSlashCommandAction } from '../../src/vue/slash-command'
import RichTextSlashCommandMenu from '../../src/vue/slash-command/RichTextSlashCommandMenu.vue'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-command-menu-test',
  features: [baseFeature, slashCommandFeature],
})

const config = defineRichTextSlashCommand([
  {
    key: 'basic',
    label: '基础块',
    commands: [richTextSlashCommandAction(paragraphActionItem)],
  },
])

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature, slashCommandEditorFeature],
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
  const handled = editor.view.someProp('handleKeyDown', (handler) =>
    handler(editor.view, event) ? true : undefined,
  )

  return { event, handled: handled ?? false }
}

async function mountSlashCommand(editor: Editor, appendTo?: HTMLElement) {
  const wrapper = mount(RichTextSlashCommandMenu, {
    props: { editor, config, appendTo: appendTo ?? document.body },
  })

  await flushPromises()
  return wrapper
}

describe('RichTextSlashCommandMenu', () => {
  it('mounts the same command list for slash while the editor retains focus and ARIA ownership', async () => {
    const editor = createEditor()
    const overlayHost = document.createElement('div')

    document.body.append(overlayHost)
    onTestFinished(() => overlayHost.remove())

    await mountSlashCommand(editor, overlayHost)
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).not.toBeNull()
    })

    const listbox = document.querySelector<HTMLElement>(
      '[data-test="rich-text-slash-command-list"]',
    )

    expect(document.activeElement).toBe(editor.view.dom)
    expect(overlayHost.contains(listbox)).toBe(true)
    expect(listbox?.classList.contains('pointer-events-auto')).toBe(true)
    expect(editor.view.dom.getAttribute('aria-controls')).toBe(listbox?.id)
    expect(editor.view.dom.getAttribute('aria-expanded')).toBe('true')
    await vi.waitFor(() => {
      expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-paragraph')
    })

    const { handled } = dispatchEditorKey(editor, 'Enter')

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('')
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
    expect(editor.view.dom.hasAttribute('aria-expanded')).toBe(false)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('closes an active slash session when the editor becomes disabled', async () => {
    const editor = createEditor()
    const wrapper = await mountSlashCommand(editor)

    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).not.toBeNull()
    })

    await wrapper.setProps({ disabled: true })

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).toBeNull()
    })
  })

  it('shows an empty slash state and lets Tab close without consuming the event or deleting text', async () => {
    const editor = createEditor()

    await mountSlashCommand(editor)
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
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/unknown')
  })

  it('closes the slash session on Escape while preserving the query and editor focus', async () => {
    const editor = createEditor()

    await mountSlashCommand(editor)
    editor.view.focus()
    typeText(editor, '/')
    typeText(editor, 'paragraph')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).not.toBeNull()
    })

    const { event, handled } = dispatchEditorKey(editor, 'Escape')

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/paragraph')
    expect(document.activeElement).toBe(editor.view.dom)
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
  })

  it('assigns globally unique slash ARIA targets across Vue roots', async () => {
    const firstEditor = createEditor()
    const secondEditor = createEditor()

    await mountSlashCommand(firstEditor)
    await mountSlashCommand(secondEditor)
    firstEditor.view.focus()
    typeText(firstEditor, '/')
    secondEditor.view.focus()
    typeText(secondEditor, '/')

    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-test="rich-text-slash-command-list"]')).toHaveLength(
        2,
      )
    })

    const firstListboxId = firstEditor.view.dom.getAttribute('aria-controls')
    const secondListboxId = secondEditor.view.dom.getAttribute('aria-controls')
    const firstOptionId = firstEditor.view.dom.getAttribute('aria-activedescendant')
    const secondOptionId = secondEditor.view.dom.getAttribute('aria-activedescendant')

    expect(firstListboxId).not.toBe(secondListboxId)
    expect(firstOptionId).not.toBe(secondOptionId)
    expect(document.getElementById(firstListboxId!)).not.toBeNull()
    expect(document.getElementById(secondListboxId!)).not.toBeNull()
    expect(document.getElementById(firstOptionId!)?.closest('[role="listbox"]')?.id).toBe(
      firstListboxId,
    )
    expect(document.getElementById(secondOptionId!)?.closest('[role="listbox"]')?.id).toBe(
      secondListboxId,
    )
  })

  it('cleans up an active slash renderer after the editor is destroyed', async () => {
    const editor = createEditor()
    const wrapper = await mountSlashCommand(editor)
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-slash-command-list"]')).not.toBeNull()
    })

    editor.destroy()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
