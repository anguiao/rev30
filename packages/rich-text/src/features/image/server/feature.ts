import { RichTextContentInvalidError } from '../../../server/errors'
import { defineRichTextServerFeature } from '../../../server/feature'
import type { RichTextHtmlPolicy, RichTextTagTransform } from '../../../server/sanitize'
import { normalizeImageSize } from '../core/dimensions'
import { imageFeature } from '../core/feature'

export interface RichTextImageServerOptions {
  isAllowedSrc: (src: string) => boolean
  allowedSrcSchemes?: readonly string[]
}

export function createImageHtmlPolicy(options: RichTextImageServerOptions): RichTextHtmlPolicy {
  const transformImage: RichTextTagTransform = ({ tagName, attribs }) => {
    const src = attribs.src ?? ''

    if (!options.isAllowedSrc(src)) {
      throw new RichTextContentInvalidError()
    }

    const { width, height } = normalizeImageSize(attribs)

    return {
      tagName,
      attribs: {
        src,
        ...(Object.hasOwn(attribs, 'alt') ? { alt: attribs.alt } : {}),
        ...(width === null ? {} : { width: String(width) }),
        ...(height === null ? {} : { height: String(height) }),
      },
    }
  }

  return {
    allowedTags: ['img'],
    ...(options.allowedSrcSchemes
      ? { allowedSchemesByTag: { img: options.allowedSrcSchemes } }
      : {}),
    allowedAttributes: {
      img: ['src', 'alt', 'width', 'height'],
    },
    transformTags: {
      img: [transformImage],
    },
  }
}

export function createImageServerFeature(options: RichTextImageServerOptions) {
  return defineRichTextServerFeature(imageFeature, {
    htmlPolicy: createImageHtmlPolicy(options),
  })
}
