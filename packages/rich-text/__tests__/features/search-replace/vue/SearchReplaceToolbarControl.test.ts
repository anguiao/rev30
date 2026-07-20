import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NButton, NCheckbox, NInput, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { runRichTextAction } from '../../../../src/editor/action'
import {
  getSearchReplaceState,
  openSearchReplaceAction,
  searchReplaceEditorFeature,
} from '../../../../src/features/search-replace/editor'
import SearchReplaceToolbarControl from '../../../../src/features/search-replace/vue/SearchReplaceToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content = '<p>Alpha alpha ALPHA</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...searchReplaceEditorFeature.extensions!()],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  const element = document.createElement('div')
  document.body.appendChild(element)

  const wrapper = mount(SearchReplaceToolbarControl, {
    attachTo: element,
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: markRaw(editor),
      disabled,
    },
  })

  onTestFinished(() => {
    wrapper.unmount()
    element.remove()
  })

  return wrapper
}

function getButtonComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const button = wrapper.findAllComponents(NButton).find((component) => {
    return component.attributes('data-test') === dataTest
  })

  if (!button) {
    throw new Error(`Button not found: ${dataTest}`)
  }

  return button
}

function getInputComponent(wrapper: ReturnType<typeof mount>, dataTest: string) {
  const input = wrapper.findAllComponents(NInput).find((component) => {
    return component.attributes('data-test') === dataTest
  })

  if (!input) {
    throw new Error(`Input not found: ${dataTest}`)
  }

  return input
}

function isPopoverOpen(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent(NPopover).props('show') === true
}

async function openPanel(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-search-replace"]').trigger('click')
  await flushPromises()

  await vi.waitFor(() => {
    expect(wrapper.find('[data-test="rich-text-search-replace-panel"]').exists()).toBe(true)
  })
}

describe('SearchReplaceToolbarControl', () => {
  it('searches, navigates, toggles case sensitivity, and replaces through the core actions', async () => {
    const editor = createEditor()
    const update = vi.fn()
    editor.on('update', update)
    const wrapper = mountControl(editor)

    await openPanel(wrapper)
    const queryInput = getInputComponent(wrapper, 'rich-text-search-query')
    queryInput.vm.$emit('update:value', 'alpha')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('1/3')
    expect(update).not.toHaveBeenCalled()

    getButtonComponent(wrapper, 'rich-text-search-next').vm.$emit('click')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('2/3')
    expect(update).not.toHaveBeenCalled()

    wrapper.getComponent(NCheckbox).vm.$emit('update:checked', true)
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('1/1')

    const replacementInput = getInputComponent(wrapper, 'rich-text-search-replacement')
    replacementInput.vm.$emit('update:value', 'beta')
    getButtonComponent(wrapper, 'rich-text-search-replace-current').vm.$emit('click')
    await flushPromises()

    expect(editor.getText()).toBe('Alpha beta ALPHA')
    expect(update).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('0/0')
    expect(isPopoverOpen(wrapper)).toBe(true)
  })

  it('focuses the query when opened and handles panel keyboard navigation', async () => {
    const editor = createEditor('<p>one one</p>')
    const wrapper = mountControl(editor)

    runRichTextAction(editor, openSearchReplaceAction)
    await flushPromises()

    const getQueryElement = () => getInputComponent(wrapper, 'rich-text-search-query').get('input')

    expect(isPopoverOpen(wrapper)).toBe(true)
    expect(document.activeElement).toBe(getQueryElement().element)

    getInputComponent(wrapper, 'rich-text-search-query').vm.$emit('update:value', 'one')
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('1/2')

    await getQueryElement().trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('2/2')

    await getQueryElement().trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('1/2')

    await getQueryElement().trigger('keydown', { key: 'Escape', isComposing: true })
    await flushPromises()
    expect(isPopoverOpen(wrapper)).toBe(true)

    await getQueryElement().trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(isPopoverOpen(wrapper)).toBe(false)
    expect(editor.isFocused).toBe(true)
  })

  it('replaces with Enter and navigates backward with Shift-Enter in the replacement input', async () => {
    const editor = createEditor('<p>one one</p>')
    const wrapper = mountControl(editor)

    await openPanel(wrapper)
    getInputComponent(wrapper, 'rich-text-search-query').vm.$emit('update:value', 'one')
    const replacementInput = getInputComponent(wrapper, 'rich-text-search-replacement')
    replacementInput.vm.$emit('update:value', 'two')
    await flushPromises()

    await replacementInput.get('input').trigger('keydown', { key: 'Enter', shiftKey: true })
    await flushPromises()
    expect(editor.getText()).toBe('one one')
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('2/2')

    await replacementInput.get('input').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(editor.getText()).toBe('one two')
    expect(wrapper.get('[data-test="rich-text-search-match-position"]').text()).toBe('1/1')
  })

  it('opens from Mod-f only while the editor is focused', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)
    const modifier = navigator.platform.includes('Mac') ? { metaKey: true } : { ctrlKey: true }

    expect(
      wrapper.get('[data-test="rich-text-search-replace"]').attributes('aria-keyshortcuts'),
    ).toBe('Control+F Meta+F')
    expect(wrapper.get('[data-test="rich-text-search-replace"]').attributes('aria-haspopup')).toBe(
      'dialog',
    )
    expect(wrapper.get('[data-test="rich-text-search-replace"]').attributes('aria-expanded')).toBe(
      'false',
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ...modifier }))
    await flushPromises()
    expect(isPopoverOpen(wrapper)).toBe(false)

    editor.view.focus()
    expect(editor.isFocused).toBe(true)
    const event = new KeyboardEvent('keydown', {
      key: 'f',
      ...modifier,
      bubbles: true,
      cancelable: true,
    })
    editor.view.dom.dispatchEvent(event)
    await flushPromises()

    expect(event.defaultPrevented).toBe(true)
    expect(isPopoverOpen(wrapper)).toBe(true)
    expect(wrapper.get('[data-test="rich-text-search-replace"]').attributes('aria-expanded')).toBe(
      'true',
    )
    expect(wrapper.get('[data-test="rich-text-search-replace-panel"]').attributes('role')).toBe(
      'dialog',
    )
  })

  it('closes when disabled', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)
    const readOnlyEditor = createEditor()
    readOnlyEditor.setEditable(false)
    const wrapperWithReadOnlyEditor = mountControl(readOnlyEditor)

    expect(
      wrapperWithReadOnlyEditor
        .get('[data-test="rich-text-search-replace"]')
        .attributes('disabled'),
    ).toBeDefined()

    await openPanel(wrapper)
    await wrapper.setProps({ disabled: true })
    await flushPromises()

    expect(
      wrapper.get('[data-test="rich-text-search-replace"]').attributes('disabled'),
    ).toBeDefined()
    expect(isPopoverOpen(wrapper)).toBe(false)
    expect(getSearchReplaceState(editor).isOpen).toBe(false)
  })

  it('closes without changing content when an active editor becomes read-only', async () => {
    const editor = createEditor('<p>abc</p>')
    const wrapper = mountControl(editor)

    await openPanel(wrapper)
    getInputComponent(wrapper, 'rich-text-search-query').vm.$emit('update:value', 'abc')
    getInputComponent(wrapper, 'rich-text-search-replacement').vm.$emit('update:value', 'X')
    await flushPromises()

    editor.setEditable(false)
    await flushPromises()

    await vi.waitFor(() => {
      expect(isPopoverOpen(wrapper)).toBe(false)
    })
    expect(
      wrapper.get('[data-test="rich-text-search-replace"]').attributes('disabled'),
    ).toBeDefined()
    expect(getSearchReplaceState(editor).isOpen).toBe(false)
    expect(editor.getText()).toBe('abc')
  })
})
