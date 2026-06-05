import type sanitizeHtml from 'sanitize-html'
import { RichTextContentInvalidError } from '../../server/errors'
import type { RichTextHtmlPolicy } from '../../server/policy'
import { buildImageStyle, normalizeImageSize } from './dimensions'

export interface RichTextImageServerOptions {
  isAllowedSrc: (src: string) => boolean
}

export function createImageHtmlPolicy(options: RichTextImageServerOptions): RichTextHtmlPolicy {
  const transformImage: sanitizeHtml.Transformer = (tagName, attribs) => {
    const src = attribs.src?.trim() ?? ''

    if (!options.isAllowedSrc(src)) {
      throw new RichTextContentInvalidError()
    }

    const { width, height } = normalizeImageSize(attribs)

    return {
      tagName,
      attribs: {
        src,
        ...(attribs.alt ? { alt: attribs.alt } : {}),
        ...(width === null ? {} : { width: String(width) }),
        ...(height === null ? {} : { height: String(height) }),
        style: buildImageStyle(width),
      },
    }
  }

  return {
    allowedTags: ['img'],
    allowedAttributes: {
      img: ['src', 'alt', 'width', 'height', 'style'],
    },
    allowedStyles: {
      img: {
        width: [/^\d+px$/],
        'max-width': [/^100%$/],
        height: [/^auto$/],
      },
    },
    transformTags: {
      img: transformImage,
    },
  }
}
