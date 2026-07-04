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
    expect(icon.body).not.toContain('<script')
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

  it('rejects invalid SVGs', async () => {
    await expect(parseSvgIcon('Bad.svg', '<svg><script>alert(1)</script>')).rejects.toBeInstanceOf(
      CustomSvgInvalidError,
    )
    await expect(parseSvgIcon('Bad.svg', '<svg><script>alert(1)</script>')).rejects.toThrow(
      'SVG 无效',
    )
  })

  it('rejects empty SVG bodies', async () => {
    await expect(parseSvgIcon('Empty.svg', '<svg viewBox="0 0 24 24"></svg>')).rejects.toThrow(
      'SVG 无效',
    )
  })
})
