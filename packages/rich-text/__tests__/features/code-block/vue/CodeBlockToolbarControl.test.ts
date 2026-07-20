import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NButtonGroup, NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { codeBlockEditorFeature } from '../../../../src/features/code-block/editor'
import { codeBlockToolbarControl } from '../../../../src/features/code-block/vue'
import CodeBlockToolbarControl from '../../../../src/features/code-block/vue/CodeBlockToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

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

function mountControl(editor: Editor) {
  return mount(CodeBlockToolbarControl, {
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
})
