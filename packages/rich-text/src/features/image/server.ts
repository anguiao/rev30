import type sanitizeHtml from 'sanitize-html'
import { RichTextContentInvalidError } from '../../server/errors'
import type { RichTextHtmlPolicy } from '../../server/policy'

export interface RichTextImageServerOptions {
  isAllowedSrc: (src: string) => boolean
}

function normalizeDimension(value: string | undefined) {
  if (!value) return undefined

  const numberValue = Number(value)

  return Number.isInteger(numberValue) && numberValue > 0 ? String(numberValue) : undefined
}

function buildImageStyle(width: string | undefined) {
  return width === undefined
    ? 'max-width: 100%; height: auto'
    : `width: ${width}px; max-width: 100%; height: auto`
}

function normalizeImageDimensions(attribs: Record<string, string>) {
  const width = normalizeDimension(attribs.width)
  const height = width === undefined ? undefined : normalizeDimension(attribs.height)

  return { width, height }
}

export function createImageHtmlPolicy(options: RichTextImageServerOptions): RichTextHtmlPolicy {
  const transformImage: sanitizeHtml.Transformer = (tagName, attribs) => {
    const src = attribs.src?.trim() ?? ''

    if (!options.isAllowedSrc(src)) {
      throw new RichTextContentInvalidError()
    }

    const { width, height } = normalizeImageDimensions(attribs)

    return {
      tagName,
      attribs: {
        src,
        ...(attribs.alt ? { alt: attribs.alt } : {}),
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
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
