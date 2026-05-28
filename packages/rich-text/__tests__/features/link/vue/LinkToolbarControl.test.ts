import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { Editor } from '@tiptap/vue-3'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LinkToolbarControl from '../../../../src/features/link/vue/LinkToolbarControl.vue'
import { linkFeature } from '../../../../src/features/link/shared'

const editors: Editor[] = []
const wrappers: Array<ReturnType<typeof mount>> = []

function createEditor(content = '<p>维护通知</p>') {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const linkExtension = linkFeature.extension()

  const editor = new Editor({
    element,
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(linkExtension) ? linkExtension : [linkExtension]),
    ],
    content,
  })
  editors.push(editor)

  return editor
}

function mountControl(editor: Editor | null, disabled = false) {
  const wrapper = mount(LinkToolbarControl, {
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
  wrappers.push(wrapper)

  return wrapper
}

function selectEditorText(editor: Editor) {
  editor.commands.setTextSelection({
    from: 1,
    to: editor.state.doc.nodeSize - 3,
  })
}

async function openPopover(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-test="rich-text-link"]').trigger('click')
  await flushPromises()
  await vi.waitFor(() => {
    expect(wrapper.find('input').exists()).toBe(true)
  })
}

function getUrlInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.get('[data-test="rich-text-link-url"] input')
}

describe('LinkToolbarControl', () => {
  afterEach(() => {
    while (wrappers.length > 0) {
      wrappers.pop()?.unmount()
    }

    document.body.innerHTML = ''
    vi.restoreAllMocks()

    while (editors.length > 0) {
      editors.pop()?.destroy()
    }
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

  it('opens the current href when the input is blank', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const editor = createEditor('<p><a href="https://example.com">维护通知</a></p>')
    selectEditorText(editor)
    const wrapper = mountControl(editor)

    await openPopover(wrapper)
    await getUrlInput(wrapper).setValue('')
    await wrapper.get('[data-test="rich-text-link-open"]').trigger('click')

    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
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
