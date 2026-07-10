import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import { imageFeature } from '../../../src/features/image/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string) {
  const extension = imageFeature.extension()

  return createTestEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      ...(Array.isArray(extension) ? extension : [extension]),
    ],
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
})
