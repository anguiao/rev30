import { beforeEach, describe, expect, it } from 'vitest'
import type { RichTextDemoPreviewResponse } from '@rev30/contracts'
import { generateRichTextPreview } from '../../../src/features/demos'
import { useAuthStore } from '../../../src/stores/auth'
import { createFetchMock, expectFetchCall, expectJsonBody, jsonResponse } from '../../helpers/fetch'
import { createTestPinia } from '../../helpers/pinia'

const previewResponse: RichTextDemoPreviewResponse = {
  contentJson: {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '组件演示' }] }],
  },
  contentText: '组件演示',
  contentHtml: '<p>组件演示</p>',
}

beforeEach(() => {
  createTestPinia()
})

describe('demo request helpers', () => {
  it('posts rich text content and parses the preview response', async () => {
    const fetchMock = createFetchMock(jsonResponse(previewResponse))
    useAuthStore().accessToken = 'access-token'

    const result = await generateRichTextPreview({ contentJson: previewResponse.contentJson })

    expect(result).toEqual(previewResponse)
    expectFetchCall(fetchMock, 0, {
      method: 'POST',
      pathname: '/api/demos/rich-text/preview',
    })
    expectJsonBody(fetchMock, 0, { contentJson: previewResponse.contentJson })
  })
})
