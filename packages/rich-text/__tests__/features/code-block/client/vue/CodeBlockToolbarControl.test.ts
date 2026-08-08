import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import type { Editor } from '@tiptap/vue-3'
import { mount } from '@vue/test-utils'
import type { DropdownOption } from 'naive-ui'
import { NDropdown } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { codeBlockEditorFeature } from '../../../../../src/features/code-block/client/editor'
import CodeBlockToolbarControl from '../../../../../src/features/code-block/client/vue/CodeBlockToolbarControl.vue'
import { createTestEditor } from '../../../../helpers/editor'

function createEditor(content: string | object = '<p>const ready = true</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...codeBlockEditorFeature.extensions!()],
    content,
  })
}

function mountControl(editor: Editor, attachToDocument = false) {
  return mount(CodeBlockToolbarControl, {
    ...(attachToDocument ? { attachTo: document.body } : undefined),
    props: {
      editor: markRaw(editor),
    },
  })
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
  it('creates a language-selected code block from one dropdown', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)
    const dropdown = wrapper.getComponent(NDropdown)
    const trigger = wrapper.get('[data-test="rich-text-code-block"]')

    expect(wrapper.findAll('[data-rich-text-toolbar-item]')).toHaveLength(1)
    expect(trigger.attributes('aria-pressed')).toBe('false')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(dropdown.props('disabled')).toBe(false)
    expect(findOption(wrapper, 'plaintext').props).toMatchObject({
      'aria-pressed': false,
    })
    expect(findOption(wrapper, 'typescript').props).toMatchObject({
      'aria-pressed': false,
    })

    dropdown.vm.$emit('select', 'typescript')

    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: 'codeBlock',
        attrs: { language: 'typescript' },
      })
      expect(trigger.attributes('aria-pressed')).toBe('true')
      expect(findOption(wrapper, 'typescript').props).toMatchObject({
        'aria-pressed': true,
      })
    })

    expect(trigger.text()).toBe('')
  })

  it('switches language without exposing it in the toolbar', async () => {
    const editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const ready = true' }],
        },
      ],
    })
    editor.commands.setTextSelection(1)
    const wrapper = mountControl(editor)
    const dropdown = wrapper.getComponent(NDropdown)
    const trigger = wrapper.get('[data-test="rich-text-code-block"]')

    expect(trigger.text()).toBe('')
    expect(findOption(wrapper, 'typescript').props).toMatchObject({ 'aria-pressed': true })

    dropdown.vm.$emit('select', 'plaintext')

    await vi.waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs).toEqual({ language: null })
      expect(findOption(wrapper, 'plaintext').props).toMatchObject({ 'aria-pressed': true })
    })
  })
})
