import { flushPromises, mount } from '@vue/test-utils'
import { markRaw } from 'vue'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../../src/editor/feature'
import { imageQuickBar } from '../../../../src/features/image/vue'
import { createTestEditor } from '../../../helpers/editor'
import { createImageTestEditorPreset } from '../../../helpers/image-editor'

describe('ImageQuickBar', () => {
  it('offers native download and opens the shared image dialog for editing', async () => {
    const src = '/uploads/image.png'
    const preset = createImageTestEditorPreset({ upload: async () => ({ src }) })
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions(preset),
      content: `<img src="${src}">`,
    })
    editor.commands.setNodeSelection(0)

    const wrapper = mount(imageQuickBar.component, {
      attachTo: document.body,
      props: {
        ...imageQuickBar.props,
        editor: markRaw(editor),
      },
    })
    const controls = wrapper.findAll('[data-rich-text-toolbar-item]')
    const download = controls[0]!

    expect(controls.map((control) => control.attributes('aria-label'))).toEqual([
      '下载图片',
      '编辑图片',
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
