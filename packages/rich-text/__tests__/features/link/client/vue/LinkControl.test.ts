import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkFeature } from '../../../../../src/features/link/core/feature'
import LinkControl from '../../../../../src/features/link/client/vue/LinkControl.vue'
import { appendTestElement, createTestEditor } from '../../../../helpers/editor'

function createEditor(content = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...linkFeature.sharedExtensions!()],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  return mount(LinkControl, {
    props: {
      editor: markRaw(editor),
      disabled,
    },
  })
}

function isPopoverShown(wrapper: ReturnType<typeof mountControl>) {
  return wrapper.get('[data-test="rich-text-link"]').attributes('aria-expanded') === 'true'
}

function getUrlInput(wrapper: ReturnType<typeof mountControl>) {
  return wrapper.get('[data-test="rich-text-link-url"] input')
}

async function setUrl(wrapper: ReturnType<typeof mountControl>, value: string) {
  await getUrlInput(wrapper).setValue(value)
}

async function openPopover(wrapper: ReturnType<typeof mountControl>) {
  await wrapper.get('[data-test="rich-text-link"]').trigger('click')
  await flushPromises()
  expect(isPopoverShown(wrapper)).toBe(true)
}

describe('LinkControl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens on click and creates a normalized link for the exact selection', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 3 })
    editor.commands.focus()
    const wrapper = mountControl(editor)

    await flushPromises()
    expect(isPopoverShown(wrapper)).toBe(false)

    await openPopover(wrapper)
    expect(getUrlInput(wrapper).element).toHaveProperty('value', '')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(false)

    await setUrl(wrapper, 'example.com')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      {
        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        text: '维护',
      },
      { text: '通知' },
    ])
    expect(editor.state.selection).toMatchObject({ from: 1, to: 3 })
    expect(isPopoverShown(wrapper)).toBe(false)
    await vi.waitFor(() => {
      expect(editor.isFocused).toBe(true)
    })
  })

  it('does not open automatically when a focused caret enters a link', async () => {
    const editor = createEditor('<p>plain <a href="https://example.com">link</a></p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    editor.commands.focus()
    await flushPromises()
    expect(isPopoverShown(wrapper)).toBe(false)

    editor.commands.setTextSelection(8)
    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)
    expect(wrapper.get('[data-test="rich-text-link"]').attributes('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(editor.view.dom)
  })

  it('edits the complete link without moving the collapsed selection', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect(getUrlInput(wrapper).element).toHaveProperty('value', 'https://old.example')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)

    await setUrl(wrapper, 'new.example')
    const onTransaction = vi.fn()
    editor.on('transaction', onTransaction)

    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(onTransaction.mock.calls.filter(([event]) => event.transaction.docChanged)).toHaveLength(
      1,
    )
    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      marks: [{ type: 'link', attrs: { href: 'https://new.example' } }],
      text: '链接文本',
    })
    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({
      marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
      text: '链接文本',
    })
  })

  it('sets and removes links only inside an exact mixed selection', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接</a>普通</p>')
    editor.commands.setTextSelection({ from: 2, to: 5 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect(getUrlInput(wrapper).element).toHaveProperty('value', '')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)

    await setUrl(wrapper, 'https://new.example')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      {
        text: '链',
        marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
      },
      {
        text: '接普通',
        marks: [{ type: 'link', attrs: { href: 'https://new.example' } }],
      },
    ])
    expect(editor.state.selection).toMatchObject({ from: 2, to: 5 })

    await openPopover(wrapper)
    await wrapper.get('[data-test="rich-text-link-remove"]').trigger('click')
    await flushPromises()

    expect(editor.getJSON().content?.[0]?.content).toMatchObject([
      {
        text: '链',
        marks: [{ type: 'link', attrs: { href: 'https://old.example' } }],
      },
      { text: '接普通' },
    ])
    expect(editor.state.selection).toMatchObject({ from: 2, to: 5 })
  })

  it('uses an unprefilled stored-mark mode for an ordinary collapsed caret', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection(3)
    editor.commands.setLink({ href: 'https://stored.example' })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect(getUrlInput(wrapper).element).toHaveProperty('value', '')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(false)

    await setUrl(wrapper, 'next.example')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.state.storedMarks?.find((mark) => mark.type.name === 'link')?.attrs).toEqual({
      href: 'https://next.example',
    })
    expect(editor.getText()).toBe('普通文字')

    await openPopover(wrapper)
    expect(getUrlInput(wrapper).element).toHaveProperty('value', '')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.state.storedMarks?.some((mark) => mark.type.name === 'link')).toBe(false)
  })

  it('disables the control for a cross-block selection', async () => {
    const editor = createEditor('<p>第一段</p><p>第二段</p>')
    editor.commands.setTextSelection({ from: 2, to: 7 })
    const wrapper = mountControl(editor)

    expect(wrapper.get('[data-test="rich-text-link"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('abandons drafts on explicit cancel and a second trigger click', async () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    await wrapper.get('[data-test="rich-text-link-cancel"]').trigger('click')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)

    await openPopover(wrapper)
    await setUrl(wrapper, 'second-draft.example')
    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.getHTML()).not.toContain('second-draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('abandons drafts on outside close without stealing focus', async () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)
    const outsideButton = appendTestElement('button')

    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    outsideButton.focus()
    wrapper.getComponent(NPopover).vm.$emit('update:show', false)
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(document.activeElement).toBe(outsideButton)
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('keeps invalid drafts open', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'javascript:alert(1)')

    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('disabled')).toBeDefined()

    await wrapper.get('form').trigger('submit')
    expect(isPopoverShown(wrapper)).toBe(true)
  })

  it('applies with Enter, ignores composition, and cancels with Escape', async () => {
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'example.com')
    await getUrlInput(wrapper).trigger('keydown', { key: 'Enter', isComposing: true })
    expect(editor.getHTML()).not.toContain('href=')
    expect(isPopoverShown(wrapper)).toBe(true)

    await getUrlInput(wrapper).trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(editor.getHTML()).toContain('href="https://example.com"')
    expect(isPopoverShown(wrapper)).toBe(false)

    editor.commands.setTextSelection(2)
    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    await wrapper.get('[data-test="rich-text-link-cancel"]').trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 2, to: 2 })
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
    expect(editor.isFocused).toBe(true)
  })

  it('labels icon actions and honors the disabled prop', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect(wrapper.get('[data-test="rich-text-link"]').attributes('aria-label')).toBe('链接')
    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('aria-label')).toBe(
      '应用链接',
    )
    const applyMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    wrapper.get('[data-test="rich-text-link-apply"]').element.dispatchEvent(applyMouseDown)
    expect(applyMouseDown.defaultPrevented).toBe(true)
    expect(wrapper.get('[data-test="rich-text-link-cancel"]').attributes('aria-label')).toBe(
      '取消编辑链接',
    )

    const disabledWrapper = mountControl(createEditor(), true)
    expect(disabledWrapper.get('[data-test="rich-text-link"]').attributes('disabled')).toBeDefined()
    expect(disabledWrapper.find('[data-test="rich-text-link-url"]').exists()).toBe(false)
  })
})
