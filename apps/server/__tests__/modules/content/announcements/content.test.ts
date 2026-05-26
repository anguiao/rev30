import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadContentHelpers() {
  vi.resetModules()

  const contentModule = await import('../../../../src/modules/content/announcements/content')
  const errorModule = await import('../../../../src/modules/content/announcements/errors')

  return {
    ...contentModule,
    ...errorModule,
  }
}

afterEach(() => {
  vi.doUnmock('@tiptap/html')
  vi.doUnmock('@tiptap/html/server')
  vi.resetModules()
})

describe('announcement content helpers', () => {
  it('does not register duplicate tiptap extensions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadContentHelpers()

    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === 'string' && message.includes('Duplicate extension names found'),
      ),
    ).toBe(false)

    warnSpy.mockRestore()
  })
})
