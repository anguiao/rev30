import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { describe, expect, it } from 'vitest'
import {
  fontFamilies,
  fontSizes,
  lineHeights,
  textColors,
} from '../../../src/features/text-style/options'
import { textStyleFeature } from '../../../src/features/text-style/shared'
import { baseFeature } from '../../../src/features/base/shared'
import { createTestEditor } from '../../helpers/editor'

function createEditor(content: string | object = '<p>维护通知</p>') {
  return createTestEditor({
    extensions: [Document, Paragraph, Text, ...textStyleFeature.documentExtensions!()],
    content,
  })
}

describe('text style feature', () => {
  it('declares the canonical feature contract', () => {
    expect(textStyleFeature).toMatchObject({
      key: 'text-style',
      editorImplementation: true,
      serverImplementation: true,
      dependencies: [baseFeature],
    })
    expect(textStyleFeature.documentExtensions!().map((extension) => extension.name)).toEqual([
      'textStyle',
      'color',
      'fontFamily',
      'fontSize',
      'lineHeight',
    ])
  })

  it.each([
    ...textColors.map((value) => ['color', value] as const),
    ...fontFamilies.map((value) => ['fontFamily', value] as const),
    ...fontSizes.map((value) => ['fontSize', value] as const),
    ...lineHeights.map((value) => ['lineHeight', value] as const),
    ['color', null],
    ['fontFamily', null],
    ['fontSize', null],
    ['lineHeight', null],
  ] as const)('accepts the supported %s value: %s', (attribute, value) => {
    const editor = createEditor()

    expect(() =>
      editor.schema.markFromJSON({ type: 'textStyle', attrs: { [attribute]: value } }),
    ).not.toThrow()
  })

  it.each([
    ['color', '#000000'],
    ['color', 'red; position: fixed'],
    ['fontFamily', 'Arial'],
    ['fontFamily', 'serif, sans-serif'],
    ['fontSize', '16px'],
    ['fontSize', '14pt !important'],
    ['lineHeight', 'normal'],
    ['lineHeight', 'calc(1 + 1)'],
    ['color', 1],
    ['fontSize', {}],
  ] as const)('rejects an unsupported %s value: %s', (attribute, value) => {
    const editor = createEditor()

    expect(() =>
      editor.schema.markFromJSON({ type: 'textStyle', attrs: { [attribute]: value } }),
    ).toThrow()
  })

  it('normalizes supported styles and drops unsupported imported values', () => {
    const editor = createEditor(
      '<p><span style="color: #EF4444; font-family: SERIF; font-size: 14PT; line-height: 1.5; position: fixed">维护通知</span></p>',
    )

    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'textStyle',
                  attrs: {
                    color: '#ef4444',
                    fontFamily: 'serif',
                    fontSize: '14pt',
                    lineHeight: '1.5',
                  },
                },
              ],
            },
          ],
        },
      ],
    })
  })

  it('does not preserve an empty mark for unsupported imported styles', () => {
    const editor = createEditor(
      '<p><span style="position: fixed; font-family: Arial; font-size: 16px">维护通知</span></p>',
    )

    expect(editor.getJSON()).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '维护通知' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<p>维护通知</p>')
  })
})
