import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import { createImageQuickBar } from '../../../../src/features/image/vue'
import { createTestEditor } from '../../../helpers/editor'

describe('ImageQuickBar', () => {
  it('offers native download and opens the shared image dialog for editing', async () => {
    const src = '/uploads/image.png'
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...imageFeature.sharedExtensions!()],
      content: `<img src="${src}">`,
    })
    editor.commands.setNodeSelection(0)

    const quickBar = createImageQuickBar({
      upload: async () => ({ src }),
    })
    const wrapper = mount(quickBar.component, {
      attachTo: document.body,
      props: {
        ...quickBar.props,
        editor: markRaw(editor),
      },
    })
    const controls = wrapper.findAll('[data-rich-text-toolbar-item]')
    const download = controls[0]!

    expect(controls.map((control) => control.attributes('data-test'))).toEqual([
      'rich-text-quick-bar-image-download',
      'rich-text-quick-bar-image',
    ])
    expect(download.element.tagName).toBe('A')
    expect(download.attributes('href')).toBe(src)
    expect(download.attributes()).toHaveProperty('download')

    await controls[1]!.trigger('click')
    await flushPromises()

    expect(
      document.querySelector('[data-test="rich-text-image-preview"] img')?.getAttribute('src'),
    ).toBe(src)
  })
})
