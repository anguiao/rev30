import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { imageFeature } from '../../../src/features/image/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string) {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...imageFeature.documentExtensions!()],
    content,
  })
}

describe('image feature shared rendering', () => {
  it('drops isolated height when width is missing', () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="说明" height="360" />',
    )
    const html = editor.getHTML()

    expect(html).toMatch(/style="max-width: 100%; height: auto;?"/)
    expect(html).not.toContain('height="360"')
    expect(html).not.toContain('width=')
  })

  it('keeps valid width and height together when both are valid', () => {
    const editor = createEditor(
      '<img src="/api/attachments/cover/content" alt="说明" width="640" height="360" />',
    )
    const html = editor.getHTML()

    expect(html).toContain('width="640"')
    expect(html).toContain('height="360"')
    expect(html).toMatch(/style="width: 640px; max-width: 100%; height: auto;?"/)
  })

  it('accepts valid image attributes from JSON', () => {
    const editor = createEditor('<p>维护通知</p>')

    expect(() =>
      editor.schema.nodeFromJSON({
        type: 'image',
        attrs: {
          src: '/api/attachments/cover/content',
          alt: '说明',
          width: 640,
          height: 360,
        },
      }),
    ).not.toThrow()
  })

  it.each([
    { name: 'src', value: null },
    { name: 'src', value: 1 },
    { name: 'alt', value: 1 },
    { name: 'width', value: '640' },
    { name: 'width', value: 0 },
    { name: 'width', value: -1 },
    { name: 'width', value: 1.5 },
    { name: 'height', value: '360' },
    { name: 'height', value: 0 },
    { name: 'height', value: -1 },
    { name: 'height', value: 1.5 },
  ])('rejects an invalid $name attribute: $value', ({ name, value }) => {
    const editor = createEditor('<p>维护通知</p>')

    expect(() =>
      editor.schema.nodeFromJSON({
        type: 'image',
        attrs: {
          src: '/api/attachments/cover/content',
          alt: null,
          width: null,
          height: null,
          [name]: value,
        },
      }),
    ).toThrow()
  })
})
