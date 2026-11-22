import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadIconSearchConcepts } from '../../../../src/modules/icons/search/concepts'

const directory = fileURLToPath(
  new URL('../../../../resources/icon-search/concepts/', import.meta.url),
)

describe('maintained icon search concepts', () => {
  it('keeps names and pictograms in their respective evidence levels', async () => {
    const { byKey } = await loadIconSearchConcepts(directory)

    for (const [query, direct, pictogram] of [
      ['通知', 'notifications', 'bell'],
      ['删除', 'delete', 'trash'],
      ['首页', 'home', 'house'],
    ] as const) {
      const concept = byKey.get(query)
      expect(concept?.en).toContain(direct)
      expect(concept?.en).not.toContain(pictogram)
      expect(concept?.intentEn).toContain(pictogram)
    }
  })

  it('keeps meaningful compounds and status variants distinct', async () => {
    const { byKey } = await loadIconSearchConcepts(directory)

    expect(byKey.get('退出登录')?.zh).toContain('登出')
    expect(byKey.get('登出')?.en).toContain('log-out')
    expect(byKey.get('日志')?.en).toContain('logs')
    expect(byKey.get('日志')?.en).not.toContain('log-out')
    expect(byKey.get('已读')?.en).toContain('mark-email-read')
    expect(byKey.get('未读')?.en).toContain('mark-email-unread')
    expect(byKey.get('可见')?.exclude).toContain('visibility-off')
    expect(byKey.get('不可见')?.en).toContain('visibility-off')
    expect(byKey.get('打开文件夹')?.parts).toEqual(['打开', '文件夹'])
  })

  it('keeps the action or status qualifier in direct compound targets', async () => {
    const { byKey } = await loadIconSearchConcepts(directory)

    for (const [query, direct, pictogram] of [
      ['复制链接', 'copy-link', 'link'],
      ['示例代码', 'code-sample', 'code'],
      ['已取消', 'cancelled', 'circle-x'],
      ['已禁用', 'disabled', 'toggle-left'],
      ['未完成', 'incomplete', 'circle-dot'],
    ] as const) {
      expect(byKey.get(query)?.en, query).toContain(direct)
      expect(byKey.get(query)?.en, query).not.toContain(pictogram)
      expect(byKey.get(query)?.intentEn, query).toContain(pictogram)
    }

    expect(byKey.get('待审核')).toMatchObject({
      en: [],
      intentEn: expect.arrayContaining(['clock', 'clipboard-list']),
    })
    expect(byKey.get('温湿度')).toMatchObject({
      en: [],
      intentEn: expect.arrayContaining(['humidity']),
    })
  })

  it('recognizes status and navigation wording through shared concepts', async () => {
    const { byKey } = await loadIconSearchConcepts(directory)

    expect(byKey.get('已过期')).toEqual(byKey.get('过期'))
    expect(byKey.get('已过期')?.intentEn).toContain('calendar-x')
    expect(byKey.get('维护中')).toEqual(byKey.get('正在维护'))
    expect(byKey.get('维护中')?.intentEn).toContain('wrench')
    expect(byKey.get('快捷入口')).toEqual(byKey.get('快速入口'))
    expect(byKey.get('快捷入口')?.intentEn).toContain('zap')
  })

  it('separates compression from archiving and keeps action pictograms as intent', async () => {
    const { byKey } = await loadIconSearchConcepts(directory)

    expect(byKey.get('压缩包')).toEqual(byKey.get('压缩文件'))
    expect(byKey.get('压缩包')?.en).toContain('file-zip')
    expect(byKey.get('压缩包')?.en).not.toContain('archive')
    expect(byKey.get('归档包')?.en).toContain('archive')
    expect(byKey.get('发布')?.en).toContain('publish')
    expect(byKey.get('发布')?.en).not.toContain('send')
    expect(byKey.get('发布')?.intentEn).toContain('send')
    expect(byKey.get('数据脱敏')?.intentEn).toContain('asterisk')
  })
})
