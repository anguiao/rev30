import {
  type RichTextDemoPreviewInput,
  type RichTextDemoPreviewResponse,
  richTextDemoPreviewResponseSchema,
} from '@rev30/contracts'
import { api } from '../../api'
import { parseApiResponse } from '../../utils/request'

export async function previewRichTextDemo(
  input: RichTextDemoPreviewInput,
): Promise<RichTextDemoPreviewResponse> {
  return parseApiResponse(
    await api.demos['rich-text'].preview.$post({ json: input }),
    richTextDemoPreviewResponseSchema,
  )
}
