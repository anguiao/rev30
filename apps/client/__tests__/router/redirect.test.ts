import { describe, expect, it } from 'vitest'
import { resolveRedirectTarget } from '../../src/router/redirect'

describe('resolveRedirectTarget', () => {
  it('keeps same-origin absolute paths', () => {
    expect(resolveRedirectTarget('/system/users')).toBe('/system/users')
    expect(resolveRedirectTarget('/system/users?page=2')).toBe('/system/users?page=2')
  })

  it('falls back home for external or malformed redirect targets', () => {
    expect(resolveRedirectTarget('//evil.example/admin')).toBe('/')
    expect(resolveRedirectTarget('https://evil.example/admin')).toBe('/')
    expect(resolveRedirectTarget('system/users')).toBe('/')
    expect(resolveRedirectTarget(undefined)).toBe('/')
    expect(resolveRedirectTarget(['/system/users'])).toBe('/')
  })
})
