import { RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES } from '@rev30/contracts'
import { createAllRichTextServerPreset } from '@rev30/rich-text/server/presets/all'
import { deriveRichTextContent } from '@rev30/rich-text/server'

const imageDataUrlPattern =
  /^data:image\/(?:jpeg|png|webp);base64,(?<payload>[A-Za-z0-9+/]+={0,2})$/

export function isAllowedRichTextDemoImageSrc(src: string) {
  const payload = imageDataUrlPattern.exec(src)?.groups?.payload

  return (
    payload !== undefined &&
    payload.length % 4 === 0 &&
    Buffer.byteLength(payload, 'base64') <= RICH_TEXT_DEMO_IMAGE_MAX_SIZE_BYTES
  )
}

const richTextDemoServerPreset = createAllRichTextServerPreset({
  image: {
    allowedSrcSchemes: ['data'],
    isAllowedSrc: isAllowedRichTextDemoImageSrc,
  },
})

export function deriveRichTextDemoContent(contentJson: unknown) {
  return deriveRichTextContent(contentJson, richTextDemoServerPreset)
}
