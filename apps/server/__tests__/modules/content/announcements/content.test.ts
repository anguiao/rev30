import { describe, expect, it, vi } from 'vitest'

async function loadContentHelpers() {
  vi.resetModules()

  const contentModule = await import('../../../../src/modules/content/announcements/content')
  const errorModule = await import('../../../../src/modules/content/announcements/errors')

  return {
    ...contentModule,
    ...errorModule,
  }
}

describe('announcement content helpers', () => {
  it('derives plain text from Tiptap JSON with block separators', async () => {
    const { deriveAnnouncementContentText } = await loadContentHelpers()

    expect(
      deriveAnnouncementContentText({
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '维护通知' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '今晚 22:00 开始维护' }] },
        ],
      }),
    ).toBe('维护通知\n\n今晚 22:00 开始维护')
  })

  it('rejects empty documents', async () => {
    const { AnnouncementEmptyContentError, deriveAnnouncementContentText } = await loadContentHelpers()

    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      }),
    ).toThrow(AnnouncementEmptyContentError)
  })

  it('rejects documents that do not match enabled extensions', async () => {
    const { AnnouncementContentInvalidError, deriveAnnouncementContentText } = await loadContentHelpers()

    expect(() =>
      deriveAnnouncementContentText({
        type: 'doc',
        content: [{ type: 'unsupportedBlock', content: [{ type: 'text', text: 'x' }] }],
      }),
    ).toThrow(AnnouncementContentInvalidError)
  })

  it('does not register duplicate tiptap extensions', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await loadContentHelpers()

    expect(
      warnSpy.mock.calls.some(([message]) =>
        typeof message === 'string' && message.includes('Duplicate extension names found'),
      ),
    ).toBe(false)

    warnSpy.mockRestore()
  })
})
