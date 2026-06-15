import { iconifyIconNamePartPatternSource } from '@rev30/contracts'
import { cleanupSVG, isEmptyColor, parseColors, runSVGO, SVG } from '@iconify/tools'
import { basename } from 'node:path/posix'
import { CustomSvgInvalidError } from './errors'

const iconNamePattern = new RegExp(`^${iconifyIconNamePartPatternSource}$`)
const preserveColorSvgoPlugins = [
  'cleanupAttrs',
  'mergeStyles',
  'inlineStyles',
  'removeComments',
  'removeUselessDefs',
  'removeEditorsNSData',
  'removeEmptyAttrs',
  'removeEmptyContainers',
  'convertStyleToAttrs',
  'removeUnknownsAndDefaults',
  'removeNonInheritableGroupAttrs',
  'removeUnusedNS',
  'cleanupNumericValues',
  'cleanupListOfValues',
  'collapseGroups',
  'sortDefsChildren',
  'sortAttrs',
  'removeUselessStrokeAndFill',
] as const

export type ParsedSvgIcon = {
  name: string
  body: string
  width: number
  height: number
  palette: boolean
}

function hasPathTraversal(filename: string) {
  return filename.split('/').includes('..')
}

export function normalizeSvgIconName(filename: string) {
  if (hasPathTraversal(filename)) {
    throw new Error('图标名称无效')
  }

  const name = basename(filename)
    .replace(/\.svg$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (!iconNamePattern.test(name)) {
    throw new Error('图标名称无效')
  }

  return name
}

function isUrlColor(color: unknown) {
  if (typeof color === 'string') {
    return color.trim().toLowerCase().startsWith('url(')
  }

  return (
    typeof color === 'object' &&
    color !== null &&
    'type' in color &&
    color.type === 'function' &&
    'func' in color &&
    color.func === 'url'
  )
}

function isParsedColor(color: unknown): Parameters<typeof isEmptyColor>[0] {
  return color as Parameters<typeof isEmptyColor>[0]
}

function isMeaningfulColor(color: unknown) {
  return typeof color === 'string' || !isEmptyColor(isParsedColor(color))
}

function detectPalette(svg: SVG) {
  const colors = parseColors(svg).colors.filter(isMeaningfulColor)

  return colors.some(isUrlColor) || colors.length > 1
}

export async function parseSvgIcon(filename: string, content: string): Promise<ParsedSvgIcon> {
  const name = normalizeSvgIconName(filename)

  try {
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

    runSVGO(svg, { plugins: [...preserveColorSvgoPlugins] })
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
  } catch {
    throw new CustomSvgInvalidError()
  }
}
