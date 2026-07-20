import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions/undo-redo'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NInput, NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { linkFeature } from '../../../../src/features/link/shared'
import LinkToolbarControl from '../../../../src/features/link/vue/LinkToolbarControl.vue'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, UndoRedo, ...linkFeature.documentExtensions!()],
    content,
  })
}

function mountControl(editor: Editor, disabled = false) {
  return mount(LinkToolbarControl, {
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
}

function isPopoverShown(wrapper: ReturnType<typeof mountControl>) {
  return wrapper.getComponent(NPopover).props('show') === true
}

function getUrlInput(wrapper: ReturnType<typeof mountControl>) {
  return wrapper.get('[data-test="rich-text-link-url"] input')
}

async function setUrl(wrapper: ReturnType<typeof mountControl>, value: string) {
  wrapper.getComponent(NInput).vm.$emit('update:value', value)
  await flushPromises()
}

async function openPopover(wrapper: ReturnType<typeof mountControl>) {
  await wrapper.get('[data-test="rich-text-link"]').trigger('click')
  await flushPromises()
  expect(isPopoverShown(wrapper)).toBe(true)
}

describe('LinkToolbarControl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens only on click and creates a normalized link for the exact selection', async () => {
    const editor = createEditor()
    editor.commands.setTextSelection({ from: 1, to: 3 })
    editor.commands.focus()
    const wrapper = mountControl(editor)

    await flushPromises()
    expect(isPopoverShown(wrapper)).toBe(false)

    await openPopover(wrapper)
    expect(wrapper.getComponent(NInput).props('value')).toBe('')
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

  it('does not open automatically when a focused selection enters a link', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    editor.commands.focus()
    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)
    expect(wrapper.get('[data-test="rich-text-link"]').attributes('data-active')).toBe('true')
  })

  it('edits the complete link while restoring the original collapsed selection', async () => {
    const editor = createEditor('<p><a href="https://old.example">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect(wrapper.getComponent(NInput).props('value')).toBe('https://old.example')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)

    editor.commands.setTextSelection(6)
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
    expect(wrapper.getComponent(NInput).props('value')).toBe('')
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
    expect(wrapper.getComponent(NInput).props('value')).toBe('')
    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(false)

    await setUrl(wrapper, 'next.example')
    await wrapper.get('[data-test="rich-text-link-apply"]').trigger('click')
    await flushPromises()

    expect(editor.state.storedMarks?.find((mark) => mark.type.name === 'link')?.attrs).toEqual({
      href: 'https://next.example',
    })
    expect(editor.getText()).toBe('普通文字')

    await openPopover(wrapper)
    expect(wrapper.getComponent(NInput).props('value')).toBe('')
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

  it('restores selection on explicit cancel and a second trigger click', async () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    editor.commands.setTextSelection(6)
    await wrapper.get('[data-test="rich-text-link-cancel"]').trigger('click')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)

    await openPopover(wrapper)
    await setUrl(wrapper, 'second-draft.example')
    editor.commands.setTextSelection(6)
    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 3, to: 3 })
    expect(editor.getHTML()).not.toContain('second-draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('abandons drafts on outside close without restoring the selection or focus', async () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)
    const outsideButton = document.createElement('button')
    document.body.append(outsideButton)

    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    editor.commands.setTextSelection(6)
    outsideButton.focus()
    wrapper.getComponent(NPopover).vm.$emit('clickoutside')
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 6, to: 6 })
    expect(document.activeElement).toBe(outsideButton)
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
    outsideButton.remove()
  })

  it('closes an invalidated target without applying its draft', async () => {
    const editor = createEditor('<p><a href="https://example.com">链接文本</a>末尾</p>')
    editor.commands.setTextSelection(3)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'draft.example')
    editor.commands.setTextSelection(6)
    editor.commands.insertContent('外部')
    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)
    expect(editor.getText()).toContain('外部')
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(editor.state.selection.from).not.toBe(3)
  })

  it('keeps invalid drafts open and opens normalized drafts without closing', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createEditor('<p>普通文字</p>')
    editor.commands.setTextSelection({ from: 1, to: 3 })
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await setUrl(wrapper, 'javascript:alert(1)')

    expect(wrapper.getComponent(NInput).props('status')).toBe('error')
    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="rich-text-link-open"]').attributes('disabled')).toBeDefined()

    await setUrl(wrapper, 'example.com/path')
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(open).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noopener,noreferrer')
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
    editor.commands.setTextSelection(4)
    await getUrlInput(wrapper).trigger('keydown', { key: 'Escape' })
    await flushPromises()

    expect(editor.state.selection).toMatchObject({ from: 2, to: 2 })
    expect(editor.getHTML()).not.toContain('draft.example')
    expect(isPopoverShown(wrapper)).toBe(false)
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
    expect(wrapper.get('[data-test="rich-text-link-open"]').attributes('aria-label')).toBe(
      '新窗口打开链接',
    )
    expect(wrapper.get('[data-test="rich-text-link-cancel"]').attributes('aria-label')).toBe(
      '取消编辑链接',
    )

    const disabledWrapper = mountControl(createEditor(), true)
    expect(disabledWrapper.get('[data-test="rich-text-link"]').attributes('disabled')).toBeDefined()
  })
})
