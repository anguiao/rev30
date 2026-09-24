import { customIconItemSchema, customIconNameInputSchema } from '@rev30/contracts'
import { cleanupSVG, isEmptyColor, parseColors, runSVGO, SVG } from '@iconify/tools'
import { iconToSVG, wrapSVGContent } from '@iconify/utils'
import { basename } from 'node:path/posix'
import { z } from 'zod'
import { CustomSvgInvalidError } from './errors'

const customIconDimensionsSchema = customIconItemSchema.pick({ width: true, height: true })

const customIconSvgoPlugins = [
  {
    name: 'preset-default',
    params: {
      overrides: {
        cleanupIds: false,
        convertColors: false,
        mergePaths: false,
        moveElemsAttrsToGroup: false,
        moveGroupAttrsToElems: false,
        removeHiddenElems: false,
      },
    },
  },
] as const

export type ParsedSvgIcon = {
  name: string
  body: string
  width: number
  height: number
  palette: boolean
}

export function normalizeSvgIconName(filename: string) {
  const name = basename(filename)
    .replace(/\.svg$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const result = customIconNameInputSchema.safeParse(name)

  if (!result.success) {
    const { formErrors } = z.flattenError(result.error)
    throw new CustomSvgInvalidError(formErrors[0]!)
  }

  return result.data
}

function detectPalette(svg: SVG) {
  const colors = parseColors(svg).colors.filter(
    (color) => typeof color === 'string' || !isEmptyColor(color),
  )

  return colors.length > 1
}

export async function parseSvgIcon(filename: string, content: string): Promise<ParsedSvgIcon> {
  try {
    const name = normalizeSvgIconName(filename)
    const svg = new SVG(content)

    cleanupSVG(svg)
    const palette = detectPalette(svg)

    if (!palette) {
      parseColors(svg, {
        defaultColor: 'currentColor',
        callback: (_attr, _colorString, parsedColor) =>
          parsedColor && isEmptyColor(parsedColor) ? parsedColor : 'currentColor',
      })
    }

    runSVGO(svg, { plugins: [...customIconSvgoPlugins] })
    const rendered = iconToSVG(svg.getIcon())
    const [left, top, width, height] = rendered.viewBox

    if (
      rendered.body.trim() === '' ||
      !customIconDimensionsSchema.safeParse({ width, height }).success
    ) {
      throw new CustomSvgInvalidError()
    }

    return {
      name,
      body:
        left === 0 && top === 0
          ? rendered.body
          : wrapSVGContent(rendered.body, `<g transform="translate(${-left} ${-top})">`, '</g>'),
      width,
      height,
      palette,
    }
  } catch (error) {
    if (error instanceof CustomSvgInvalidError) {
      throw error
    }

    throw new CustomSvgInvalidError()
  }
}
