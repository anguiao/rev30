import { iconifyIconNamePartPatternSource } from '@rev30/contracts'
import { cleanupSVG, isEmptyColor, parseColors, runSVGO, SVG } from '@iconify/tools'
import { basename } from 'node:path/posix'
import { CustomSvgInvalidError } from './errors'

const iconNamePattern = new RegExp(`^${iconifyIconNamePartPatternSource}$`)
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

  if (!iconNamePattern.test(name)) {
    throw new CustomSvgInvalidError('图标名称无效')
  }

  return name
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
    const icon = svg.getIcon()

    if (icon.body.trim() === '') {
      throw new CustomSvgInvalidError()
    }

    return {
      name,
      body: icon.body,
      width: icon.width ?? 16,
      height: icon.height ?? 16,
      palette,
    }
  } catch (error) {
    if (error instanceof CustomSvgInvalidError) {
      throw error
    }

    throw new CustomSvgInvalidError()
  }
}
