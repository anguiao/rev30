import { describe, expect, it } from 'vitest'
import { CustomSvgInvalidError } from '../../../../../src/modules/content/icon-sets/custom/errors'
import {
  normalizeSvgIconName,
  parseSvgIcon,
} from '../../../../../src/modules/content/icon-sets/custom/svg'

describe('custom icon SVG parser', () => {
  it('normalizes upload filenames into icon names', () => {
    expect(normalizeSvgIconName('User Add.svg')).toBe('user-add')
    expect(normalizeSvgIconName('logo_primary.svg')).toBe('logo-primary')
    expect(normalizeSvgIconName('24px/Home.svg')).toBe('home')
  })

  it('reports invalid upload filenames', async () => {
    await expect(
      parseSvgIcon('Bad!.svg', '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /></svg>'),
    ).rejects.toThrow('图标名称无效')
  })

  it('limits normalized upload names to 256 characters without truncating them', () => {
    expect(normalizeSvgIconName(`  ${'A'.repeat(256)}.SVG`)).toBe('a'.repeat(256))
    expect(() => normalizeSvgIconName(`${'a'.repeat(257)}.svg`)).toThrow(
      '图标名称不能超过 256 个字符',
    )
  })

  it('parses single color SVGs as currentColor icons', async () => {
    const icon = await parseSvgIcon(
      'Logo.svg',
      '<svg viewBox="0 0 24 24" fill="#000"><path d="M4 4h16v16H4z" /></svg>',
    )

    expect(icon).toMatchObject({
      name: 'logo',
      width: 24,
      height: 24,
      palette: false,
    })
    expect(icon.body).toContain('currentColor')
  })

  it.each([
    ['script', '<script>alert(1)</script>'],
    ['external reference', '<use href="https://example.com/icon.svg#x"/>'],
  ])('rejects a valid SVG containing a %s', async (_name, unsafeElement) => {
    await expect(
      parseSvgIcon(
        'Unsafe.svg',
        `<svg viewBox="0 0 24 24">${unsafeElement}<path d="M0 0h24v24H0z"/></svg>`,
      ),
    ).rejects.toBeInstanceOf(CustomSvgInvalidError)
  })

  it('removes event handlers while preserving safe SVG geometry', async () => {
    const icon = await parseSvgIcon(
      'Safe.svg',
      '<svg viewBox="0 0 24 24"><path onload="alert(1)" d="M0 0h24v24H0z"/></svg>',
    )
    expect(icon.body).toContain('<path')
    expect(icon.body).not.toMatch(/onload|alert/)
    expect(icon).toMatchObject({ width: 24, height: 24, palette: false })
  })

  it('parses stroke-only single color SVGs as currentColor icons', async () => {
    const icon = await parseSvgIcon(
      'Outline.svg',
      '<svg viewBox="0 0 24 24"><path fill="none" stroke="#000" d="M4 12h16" /></svg>',
    )

    expect(icon).toMatchObject({
      name: 'outline',
      width: 24,
      height: 24,
      palette: false,
    })
    expect(icon.body).toContain('currentColor')
  })

  it('preserves multicolor SVGs as palette icons', async () => {
    const icon = await parseSvgIcon(
      'Brand.svg',
      [
        '<svg viewBox="0 0 32 32">',
        '<path fill="#ff0000" d="M0 0h16v32H0z" />',
        '<path fill="#00ff00" d="M16 0h16v32H16z" />',
        '</svg>',
      ].join(''),
    )

    expect(icon).toMatchObject({
      name: 'brand',
      width: 32,
      height: 32,
      palette: true,
    })
    expect(icon.body).toContain('#ff0000')
    expect(icon.body).toContain('#00ff00')
  })

  it.each([
    { origin: '-12 -12', translation: '12 12' },
    { origin: '10 5', translation: '-10 -5' },
  ])('preserves the viewBox origin $origin', async ({ origin, translation }) => {
    const icon = await parseSvgIcon(
      'Offset.svg',
      `<svg viewBox="${origin} 24 24"><circle cx="0" cy="0" r="10"/></svg>`,
    )

    expect(icon).toMatchObject({ width: 24, height: 24 })
    expect(icon.body).toBe(
      `<g transform="translate(${translation})"><circle r="10" fill="currentColor"/></g>`,
    )
  })

  it.each(['0 24', '24 0', '-1 24', '24 -1'])(
    'rejects non-positive viewBox dimensions %s',
    async (dimensions) => {
      await expect(
        parseSvgIcon(
          'Invalid.svg',
          `<svg viewBox="0 0 ${dimensions}"><path d="M0 0h10v10H0z"/></svg>`,
        ),
      ).rejects.toBeInstanceOf(CustomSvgInvalidError)
    },
  )

  it.each(['Infinity 0 24 24', '1e309 0 24 24', '0 -Infinity 24 24'])(
    'rejects non-finite viewport origins in %s',
    async (viewBox) => {
      await expect(
        parseSvgIcon('Invalid.svg', `<svg viewBox="${viewBox}"><circle r="10"/></svg>`),
      ).rejects.toBeInstanceOf(CustomSvgInvalidError)
    },
  )

  it('rejects invalid SVGs', async () => {
    const result = parseSvgIcon('Bad.svg', '<svg><script>alert(1)</script>')

    await expect(result).rejects.toBeInstanceOf(CustomSvgInvalidError)
    await expect(result).rejects.toThrow('SVG 无效')
  })

  it('rejects empty SVG bodies', async () => {
    await expect(parseSvgIcon('Empty.svg', '<svg viewBox="0 0 24 24"></svg>')).rejects.toThrow(
      'SVG 无效',
    )
  })
})
