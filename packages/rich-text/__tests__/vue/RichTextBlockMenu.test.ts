import type { Editor } from '@tiptap/core'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { paragraphActionItem } from '../../src/features/base/vue'
import { blockCommandEditorFeature } from '../../src/features/block-command/editor'
import { blockCommandFeature } from '../../src/features/block-command/shared'
import { defineRichTextBlockMenu, richTextBlockMenuAction } from '../../src/vue/block-menu'
import RichTextBlockMenu from '../../src/vue/block-menu/RichTextBlockMenu.vue'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'block-menu-component-test',
  features: [baseFeature, blockCommandFeature],
})

const config = defineRichTextBlockMenu([
  {
    key: 'basic',
    label: '基础块',
    commands: [richTextBlockMenuAction(paragraphActionItem, ['段落', 'paragraph', 'text'])],
  },
])

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature, blockCommandEditorFeature],
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

async function mountBlockMenu(editor: Editor) {
  const wrapper = mount(RichTextBlockMenu, {
    props: { editor, config },
  })

  await flushPromises()
  return wrapper
}

describe('RichTextBlockMenu', () => {
  it('shows a 44px plus target for a focused top-level empty paragraph and restores focus on Escape', async () => {
    const editor = createEditor()

    await mountBlockMenu(editor)
    editor.view.focus()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-menu-trigger"]')).not.toBeNull()
    })

    const trigger = document.querySelector<HTMLButtonElement>(
      '[data-test="rich-text-block-menu-trigger"]',
    )

    expect(trigger?.classList.contains('size-11')).toBe(true)
    expect(trigger?.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    expect(trigger?.parentElement?.parentElement?.tabIndex).toBe(-1)

    trigger?.click()
    await flushPromises()

    const listbox = document.querySelector<HTMLElement>(
      '[data-test="rich-text-block-command-list"]',
    )

    expect(listbox).not.toBeNull()
    expect(document.activeElement).toBe(listbox)
    expect(trigger?.getAttribute('aria-expanded')).toBe('true')

    listbox?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).toBeNull()
      expect(document.activeElement).toBe(editor.view.dom)
    })
  })

  it('hides the plus entry when the editor becomes disabled', async () => {
    const editor = createEditor()
    const wrapper = await mountBlockMenu(editor)

    editor.view.focus()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-menu-trigger"]')).not.toBeNull()
    })

    await wrapper.setProps({ disabled: true })

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-menu-trigger"]')).toBeNull()
    })
  })

  it('keeps plus commands targeted at the fixed empty paragraph', async () => {
    const editor = createEditor('<p></p><p>other</p>')

    await mountBlockMenu(editor)
    editor.commands.setTextSelection(1)
    editor.view.focus()

    const trigger = await vi.waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>(
        '[data-test="rich-text-block-menu-trigger"]',
      )
      expect(element).not.toBeNull()
      return element!
    })

    trigger.click()
    await flushPromises()
    editor.commands.setTextSelection(4)
    await flushPromises()

    const command = document.querySelector<HTMLElement>(
      '[data-test="rich-text-block-command-paragraph"]',
    )
    expect(command?.getAttribute('aria-disabled')).toBe('false')

    command?.click()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).toBeNull()
      expect(editor.state.selection).toMatchObject({ from: 1, to: 1 })
      expect(document.activeElement).toBe(editor.view.dom)
    })
  })

  it('mounts the same command list for slash while the editor retains focus and ARIA ownership', async () => {
    const editor = createEditor()

    await mountBlockMenu(editor)
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).not.toBeNull()
    })

    const listbox = document.querySelector<HTMLElement>(
      '[data-test="rich-text-block-command-list"]',
    )

    expect(document.activeElement).toBe(editor.view.dom)
    expect(editor.view.dom.getAttribute('aria-controls')).toBe(listbox?.id)
    expect(editor.view.dom.getAttribute('aria-expanded')).toBe('true')
    await vi.waitFor(() => {
      expect(editor.view.dom.getAttribute('aria-activedescendant')).toContain('option-paragraph')
    })

    const { handled } = dispatchEditorKey(editor, 'Enter')

    expect(handled).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('')
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
    expect(editor.view.dom.hasAttribute('aria-expanded')).toBe(false)
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('shows an empty slash state and lets Tab close without consuming the event or deleting text', async () => {
    const editor = createEditor()

    await mountBlockMenu(editor)
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
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/unknown')
  })

  it('closes the slash session on Escape while preserving the query and editor focus', async () => {
    const editor = createEditor()

    await mountBlockMenu(editor)
    editor.view.focus()
    typeText(editor, '/')
    typeText(editor, 'paragraph')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).not.toBeNull()
    })

    const { event, handled } = dispatchEditorKey(editor, 'Escape')

    expect(handled).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).toBeNull()
    })
    expect(editor.getText()).toBe('/paragraph')
    expect(document.activeElement).toBe(editor.view.dom)
    expect(editor.view.dom.hasAttribute('aria-controls')).toBe(false)
  })

  it('assigns globally unique slash ARIA targets across Vue roots', async () => {
    const firstEditor = createEditor()
    const secondEditor = createEditor()

    await mountBlockMenu(firstEditor)
    await mountBlockMenu(secondEditor)
    firstEditor.view.focus()
    typeText(firstEditor, '/')
    secondEditor.view.focus()
    typeText(secondEditor, '/')

    await vi.waitFor(() => {
      expect(document.querySelectorAll('[data-test="rich-text-block-command-list"]')).toHaveLength(
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
    const wrapper = await mountBlockMenu(editor)
    editor.view.focus()
    typeText(editor, '/')

    await vi.waitFor(() => {
      expect(document.querySelector('[data-test="rich-text-block-command-list"]')).not.toBeNull()
    })

    editor.destroy()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
