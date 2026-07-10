import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { NPopover } from 'naive-ui'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LinkToolbarControl from '../../../../src/features/link/vue/LinkToolbarControl.vue'
import { linkFeature } from '../../../../src/features/link/shared'
import { createTestEditor } from '../../../helpers/editor'

function createEditor(content = '<p>维护通知</p>') {
  const linkExtension = linkFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(linkExtension) ? linkExtension : [linkExtension]),
    ],
    content,
  })
}

function mountControl(editor: Editor | null, disabled = false) {
  return mount(LinkToolbarControl, {
    global: {
      stubs: {
        teleport: true,
      },
    },
    props: {
      editor: editor ? markRaw(editor) : null,
      disabled,
    },
  })
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

async function openPopover(wrapper: ReturnType<typeof mount>) {
  await flushPromises()
  if (!isPopoverShown(wrapper)) {
    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
  }
  await flushPromises()
  await vi.waitFor(() => {
    expect(isPopoverShown(wrapper)).toBe(true)
  })
}

function getUrlInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-test="rich-text-link-url"] input')
}

function isPopoverShown(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent(NPopover).props('show') === true
}

async function focusEditor(editor: Editor) {
  editor.commands.focus()
  await flushPromises()
}

describe('LinkToolbarControl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('applies a normalized link and pre-fills from the current selection href', async () => {
    const editor = createEditor()
    selectEditorText(editor)

    const wrapper = mountControl(editor)
    await openPopover(wrapper)
    await getUrlInput(wrapper).setValue('example.com')
    await getUrlInput(wrapper).trigger('keydown.enter')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })

    wrapper.unmount()
    const remountedWrapper = mountControl(editor)
    await openPopover(remountedWrapper)

    expect(remountedWrapper.get('[data-test="rich-text-link"]').attributes('data-active')).toBe(
      'true',
    )
    expect((getUrlInput(remountedWrapper).element as HTMLInputElement).value).toBe(
      'https://example.com',
    )
    expect(remountedWrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)
  })

  it('does not open automatically before the editor is focused', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('opens automatically when the focused selection enters a link without focusing the input', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await focusEditor(editor)

    await vi.waitFor(() => {
      expect(isPopoverShown(wrapper)).toBe(true)
    })

    const input = getUrlInput(wrapper).element as HTMLInputElement

    expect(input.value).toBe('https://example.com')
    expect(document.activeElement).not.toBe(input)
  })

  it('keeps the popover closed after a manual close while staying on the same link', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await focusEditor(editor)

    await vi.waitFor(() => {
      expect(isPopoverShown(wrapper)).toBe(true)
    })

    await wrapper.get('[data-test="rich-text-link"]').trigger('click')
    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)

    editor.commands.setTextSelection({ from: 1, to: 2 })
    await flushPromises()

    expect(isPopoverShown(wrapper)).toBe(false)
  })

  it('keeps link actions visible while the editor blurs before the popover closes', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await focusEditor(editor)

    await vi.waitFor(() => {
      expect(isPopoverShown(wrapper)).toBe(true)
    })

    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)

    editor.commands.blur()
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-link-remove"]').exists()).toBe(true)
  })

  it('removes the current link when applying an empty input', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    expect((getUrlInput(wrapper).element as HTMLInputElement).value).toBe('https://example.com')

    await getUrlInput(wrapper).setValue('')
    await getUrlInput(wrapper).trigger('keydown.enter')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
  })

  it('does not write unsafe links', async () => {
    const editor = createEditor()
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await getUrlInput(wrapper).setValue('javascript:alert(1)')
    await getUrlInput(wrapper).trigger('keydown.enter')
    await flushPromises()

    expect(JSON.stringify(editor.getJSON())).not.toContain('"link"')
  })

  it('does not apply protocol-relative links', async () => {
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await getUrlInput(wrapper).setValue('//example.com')
    await getUrlInput(wrapper).trigger('keydown.enter')
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          content: [
            {
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
              text: '维护通知',
            },
          ],
        },
      ],
    })
  })

  it('opens the current input href', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')

    await getUrlInput(wrapper).setValue('rev30.example')
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(openSpy).toHaveBeenLastCalledWith(
      'https://rev30.example',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('does not open the current selection href after the input is cleared', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await getUrlInput(wrapper).setValue('')
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(wrapper.get('[data-test="rich-text-link-open"]').attributes('disabled')).toBeDefined()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('labels icon actions for assistive technology', async () => {
    const editor = createEditor()
    const wrapper = mountControl(editor)

    await openPopover(wrapper)

    expect(wrapper.get('[data-test="rich-text-link"]').attributes('aria-label')).toBe('链接')
    expect(wrapper.get('[data-test="rich-text-link-apply"]').attributes('aria-label')).toBe(
      '应用链接',
    )
    expect(wrapper.get('[data-test="rich-text-link-open"]').attributes('aria-label')).toBe(
      '新窗口打开链接',
    )
  })

  it('is disabled without an editor or when the disabled prop is true', () => {
    const wrapperWithoutEditor = mountControl(null)
    const wrapperDisabled = mountControl(createEditor(), true)

    expect(
      wrapperWithoutEditor.get('[data-test="rich-text-link"]').attributes('disabled'),
    ).toBeDefined()
    expect(wrapperDisabled.get('[data-test="rich-text-link"]').attributes('disabled')).toBeDefined()
  })
})
