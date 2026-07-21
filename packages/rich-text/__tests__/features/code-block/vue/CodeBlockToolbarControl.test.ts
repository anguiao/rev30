import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NButtonGroup, NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { codeBlockEditorFeature } from '../../../../src/features/code-block/editor'
import { codeBlockToolbarControl } from '../../../../src/features/code-block/vue'
import CodeBlockToolbarControl from '../../../../src/features/code-block/vue/CodeBlockToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'
import { createTestRichTextOverlayState } from '../../../helpers/overlay'

const codeBlockLanguageOptions = codeBlockToolbarControl.props.languages as readonly {
  readonly value: string
  readonly label: string
}[]

function createEditor(firstLanguage: string | null, secondLanguage: string | null) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
    content: {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: firstLanguage },
          content: [{ type: 'text', text: 'const first = 1' }],
        },
        {
          type: 'codeBlock',
          attrs: { language: secondLanguage },
          content: [{ type: 'text', text: 'const second = 2' }],
        },
      ],
    },
  })
}

function mountControl(editor: Editor, attachToDocument = false) {
  const overlay = createTestRichTextOverlayState()

  return mount(CodeBlockToolbarControl, {
    ...(attachToDocument ? { attachTo: document.body } : undefined),
    global: { provide: overlay.provide },
    props: {
      editor: markRaw(editor),
      languages: [...codeBlockLanguageOptions],
    },
  })
}

function findCodeBlockTextPositions(editor: Editor) {
  const positions: number[] = []

  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'codeBlock') {
      positions.push(position + 1)
      return false
    }

    return true
  })

  return positions
}

function findOption(wrapper: ReturnType<typeof mount>, value: string) {
  const options = wrapper.getComponent(NDropdown).props('options') as DropdownOption[]
  const option = options.find((candidate) => candidate.key === value)

  if (!option) {
    throw new Error(`Option not found: ${value}`)
  }

  return option
}

function getLanguageMenuId(wrapper: ReturnType<typeof mount>) {
  const getMenuProps = wrapper.getComponent(NDropdown).props('menuProps') as () => Record<
    string,
    string
  >

  return getMenuProps()['data-rich-text-code-block-language-menu']
}

describe('CodeBlockToolbarControl', () => {
  it('groups the primary action and language menu as a split button', async () => {
    const editor = createEditor(null, null)
    editor.commands.setTextSelection(findCodeBlockTextPositions(editor)[0]!)
    const wrapper = mountControl(editor)
    const dropdown = wrapper.getComponent(NDropdown)

    expect(wrapper.getComponent(NButtonGroup).props('size')).toBe('small')
    expect(wrapper.get('[data-test="rich-text-code-block"]').attributes('data-active')).toBe('true')
    expect(dropdown.props('disabled')).toBe(false)
    expect(findOption(wrapper, 'plaintext').props).toMatchObject({
      'data-active': 'true',
      'aria-pressed': true,
    })

    dropdown.vm.$emit('select', 'typescript')

    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: 'typescript' })
    })

    dropdown.vm.$emit('select', 'plaintext')

    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: null })
    })
  })

  it('disables language changes across multiple code blocks', async () => {
    const editor = createEditor('typescript', 'json')
    const positions = findCodeBlockTextPositions(editor)
    const wrapper = mountControl(editor)
    const dropdown = wrapper.getComponent(NDropdown)

    editor.commands.setTextSelection(positions[0]!)

    await vi.waitFor(() => {
      expect(dropdown.props('disabled')).toBe(false)
      expect(findOption(wrapper, 'typescript').props).toMatchObject({
        'data-active': 'true',
        'aria-pressed': true,
      })
    })

    editor.commands.setTextSelection({
      from: positions[0]!,
      to: positions[1]! + 1,
    })

    await vi.waitFor(() => {
      expect(dropdown.props('disabled')).toBe(true)
    })

    editor.commands.setTextSelection({
      from: positions[0]!,
      to: positions[0]! + 3,
    })

    await vi.waitFor(() => {
      expect(dropdown.props('disabled')).toBe(false)
    })
  })

  it('closes only the language menu that owns the Escape event', async () => {
    const firstEditor = createEditor(null, null)
    const secondEditor = createEditor(null, null)
    const firstPositions = findCodeBlockTextPositions(firstEditor)
    firstEditor.commands.setTextSelection(firstPositions[0]!)
    secondEditor.commands.setTextSelection(findCodeBlockTextPositions(secondEditor)[0]!)
    firstEditor.view.focus()
    const firstWrapper = mountControl(firstEditor, true)
    const secondWrapper = mountControl(secondEditor, true)

    firstWrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    secondWrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    await flushPromises()

    const firstButton = firstWrapper.get('[data-test="rich-text-code-block-language"]')
    const secondButton = secondWrapper.get('[data-test="rich-text-code-block-language"]')
    expect(firstButton.attributes('aria-expanded')).toBe('true')
    expect(secondButton.attributes('aria-expanded')).toBe('true')
    expect(getLanguageMenuId(firstWrapper)).not.toBe(getLanguageMenuId(secondWrapper))

    firstEditor.commands.setTextSelection(firstPositions[1]!)
    firstEditor.view.dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await flushPromises()

    expect(firstButton.attributes('aria-expanded')).toBe('false')
    expect(secondButton.attributes('aria-expanded')).toBe('true')
    expect(firstEditor.state.selection).toMatchObject({
      from: firstPositions[0],
      to: firstPositions[0],
    })
    expect(document.activeElement).toBe(firstEditor.view.dom)
  })

  it('isolates Escape events from teleported menus across Vue roots', async () => {
    const firstEditor = createEditor(null, null)
    const secondEditor = createEditor(null, null)
    firstEditor.commands.setTextSelection(findCodeBlockTextPositions(firstEditor)[0]!)
    secondEditor.commands.setTextSelection(findCodeBlockTextPositions(secondEditor)[0]!)
    const firstWrapper = mountControl(firstEditor, true)
    const secondWrapper = mountControl(secondEditor, true)

    firstWrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    secondWrapper.getComponent(NDropdown).vm.$emit('update:show', true)
    await flushPromises()

    const firstMenuId = getLanguageMenuId(firstWrapper)
    const secondMenuId = getLanguageMenuId(secondWrapper)
    expect(firstMenuId).not.toBe(secondMenuId)

    const firstMenu = document.createElement('div')
    firstMenu.dataset.richTextCodeBlockLanguageMenu = firstMenuId
    document.body.appendChild(firstMenu)
    firstMenu.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    firstMenu.remove()
    await flushPromises()

    expect(
      firstWrapper.get('[data-test="rich-text-code-block-language"]').attributes('aria-expanded'),
    ).toBe('false')
    expect(
      secondWrapper.get('[data-test="rich-text-code-block-language"]').attributes('aria-expanded'),
    ).toBe('true')
  })
})
