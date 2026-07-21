import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { imageFeature } from '../../../../src/features/image/shared'
import ImageQuickbar from '../../../../src/features/image/vue/ImageQuickbar.vue'
import { createTestEditor } from '../../../helpers/editor'

describe('ImageQuickbar', () => {
  it('offers native download before editing', () => {
    const src = '/uploads/image.png'
    const editor = createTestEditor({
      extensions: [Document, Paragraph, Text, ...imageFeature.documentExtensions!()],
      content: `<img src="${src}">`,
    })
    editor.commands.setNodeSelection(0)

    const wrapper = mount(ImageQuickbar, {
      attachTo: document.body,
      props: {
        editor: markRaw(editor),
        upload: async () => ({ src }),
      },
    })
    const controls = wrapper.findAll('[data-rich-text-quickbar-roving]')
    const download = controls[0]!

    expect(controls.map((control) => control.attributes('data-test'))).toEqual([
      'rich-text-quickbar-image-download',
      'rich-text-quickbar-image',
    ])
    expect(download.element.tagName).toBe('A')
    expect(download.attributes('href')).toBe(src)
    expect(download.attributes()).toHaveProperty('download')
  })
})
