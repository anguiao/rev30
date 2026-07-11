import { describe, expect, it } from 'vitest'
import {
  richTextDemoPreviewInputSchema,
  richTextDemoPreviewResponseSchema,
} from '../../../src/demos/rich-text'

const contentJson = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: '组件演示' }] }],
}

describe('rich text demo schemas', () => {
  it('parses preview input and output', () => {
    expect(richTextDemoPreviewInputSchema.parse({ contentJson })).toEqual({ contentJson })
    expect(
      richTextDemoPreviewResponseSchema.parse({
        contentJson,
        contentText: '组件演示',
        contentHtml: '<p>组件演示</p>',
      }),
    ).toEqual({
      contentJson,
      contentText: '组件演示',
      contentHtml: '<p>组件演示</p>',
    })
  })

  it('rejects unknown preview input fields', () => {
    expect(richTextDemoPreviewInputSchema.safeParse({ contentJson, persisted: true }).success).toBe(
      false,
    )
  })
})
