import { describe, expect, it } from 'vitest'
import { compileIconSearchConcepts } from '../../../../src/modules/icons/search/concepts'
import { planIconSearchQuery } from '../../../../src/modules/icons/search/planner'

const budgetKeys = ['甲词', '乙词', '丙词', '丁词', '戊词', '己词', '庚词', '辛词', '壬词']
const dictionary = compileIconSearchConcepts({
  words: [
    { zh: ['打开', '已打开'], en: ['open'] },
    { zh: ['读'], en: ['read'] },
    { zh: ['文件夹'], en: ['folder'] },
    { zh: ['文件'], en: ['file'] },
    { zh: ['标题'], en: ['heading'] },
    { zh: ['日志'], en: ['logs'] },
    { zh: ['通知', '提醒'], en: ['notification'] },
    { zh: ['可见'], en: ['eye'] },
    { zh: ['信用'], en: ['credit'] },
    { zh: ['卡'], en: ['card'] },
    ...budgetKeys.map((key) => ({ zh: [key], en: ['example'] })),
  ],
  phrases: [
    { zh: ['打开文件夹'], en: ['folder-open'], parts: ['打开', '文件夹'] },
    { zh: ['k线图', '股票图'], en: ['chart-candlestick'] },
    { zh: ['退出登录', '登出'], en: ['log-out'] },
    { zh: ['已读'], en: ['mail-open'] },
    { zh: ['未读'], en: ['mail'] },
    { zh: ['不可见'], en: ['eye-off'] },
    { zh: ['信用卡', '贷记卡'], en: ['credit-card'] },
  ],
  intent: [{ zh: ['通知', '提醒'], intentEn: ['bell'] }],
})

function chinese(keyword: string) {
  const plan = planIconSearchQuery(keyword, dictionary)
  if (plan.kind !== 'chinese') throw new Error(`Expected Chinese query plan for ${keyword}`)
  return plan
}

function unitKeys(keyword: string) {
  return chinese(keyword).fragments.map((fragment) => fragment.units.map((unit) => unit.key))
}

describe('icon search query planner', () => {
  it('separates complete IDs, empty queries and legacy English term boundaries', () => {
    expect(planIconSearchQuery(' ＬＵＣＩＤＥ：trash-2 ', dictionary)).toEqual({
      kind: 'id',
      id: 'lucide:trash-2',
    })
    expect(planIconSearchQuery('！', dictionary)).toEqual({ kind: 'empty' })
    expect(planIconSearchQuery(' sign-3D/alarm / X sign ', dictionary)).toEqual({
      kind: 'english',
      phrase: 'sign-3d/alarm / x sign',
      tokens: ['sign', '3d', 'alarm', 'x'],
      englishTerms: ['sign', 'alarm', 'x'],
    })
  })

  it('prefers whole normalized keys and supplies only expressly declared composition', () => {
    const folder = chinese('打开 文件夹')
    expect(folder.phrase).toBe('打开 文件夹')
    expect(folder.compactKey).toBe('打开文件夹')
    expect(folder.exactConcept?.en).toEqual(['folder-open'])
    expect(folder.fragments[0]?.units).toEqual([
      expect.objectContaining({
        kind: 'han',
        key: '打开文件夹',
        parts: [
          expect.objectContaining({ key: '打开' }),
          expect.objectContaining({ key: '文件夹' }),
        ],
      }),
    ])

    const chart = chinese('Ｋ\t线图')
    expect(chart.compactKey).toBe('k线图')
    expect(chart.exactConcept?.zh).toEqual(['k线图', '股票图'])
    expect(unitKeys('信用卡')).toEqual([['信用卡']])
    expect(unitKeys('不可见')).toEqual([['不可见']])
  })

  it('segments a mixed fragment and preserves its whole original as an alternative', () => {
    const plan = chinese('acme 日志通知 AVI文件 foo/3D qzxmissing')
    expect(unitKeys(plan.phrase)).toEqual([
      ['acme'],
      ['日志', '通知'],
      ['avi', '文件'],
      ['foo', '3d'],
      ['qzxmissing'],
    ])
    expect(plan.fragments.map((fragment) => fragment.originalKeys)).toEqual([
      [],
      ['日志通知'],
      ['avi文件'],
      [],
      [],
    ])
    expect(
      chinese('x 3d 日志')
        .fragments.slice(0, 2)
        .map((fragment) => fragment.units),
    ).toEqual([[{ kind: 'english', key: 'x', prefix: false }], [{ kind: 'literal', key: '3d' }]])
    expect(unitKeys('右 无名字符日志燕鸥')).toEqual([['右'], ['无名字符', '日志', '燕鸥']])
  })

  it('recognizes a connector between known words and resolves only explicitly authored states', () => {
    expect(unitKeys('打开的文件夹')).toEqual([['打开', '文件夹']])
    expect(unitKeys('打开 的 文件夹')).toEqual([['打开'], ['文件夹']])
    expect(unitKeys('打开的燕鸥')).toEqual([['打开', '的燕鸥']])
    expect(chinese('已打开').exactConcept?.zh).toEqual(['打开', '已打开'])
    expect(chinese('已读').exactConcept?.en).toEqual(['mail-open'])
    expect(chinese('未读').exactConcept?.en).toEqual(['mail'])
    expect(unitKeys('已文件夹')).toEqual([['已', '文件夹']])
  })

  it.each(['四级标题', '４级标题', '标题4', '标题级别4', '四 级 标题'])(
    'normalizes heading level variant %s before concept segmentation',
    (keyword) => {
      const plan = chinese(keyword)
      expect(unitKeys(keyword)).toEqual([['标题', '4']])
      expect(plan.exactNames).toEqual(['heading-4', 'h-4', 'h4'])
      expect(plan.fragments[0]?.exactNames).toEqual(plan.exactNames)
    },
  )

  it('keeps heading alternatives local in mixed queries and never truncates a longer number', () => {
    const plan = chinese('lucide 标题 级别 4')
    expect(plan.exactNames).toEqual([])
    expect(plan.fragments[1]?.exactNames).toEqual(['heading-4', 'h-4', 'h4'])
    expect(unitKeys(plan.phrase)).toEqual([['lucide'], ['标题', '4']])
    expect(chinese('标题42').exactNames).toEqual([])
    expect(unitKeys('标题42')).toEqual([['标题', '42']])
  })

  it('only expands the first eight distinct units and keeps later conditions literal', () => {
    const plan = chinese(['甲词', ...budgetKeys, 'luc', '甲词'].join(' '))
    expect(plan.fragments[8]?.units[0]).toEqual(
      expect.objectContaining({ key: '辛词', concept: expect.any(Object) }),
    )
    expect(plan.fragments[9]?.units[0]).toMatchObject({ kind: 'han', key: '壬词' })
    expect(plan.fragments[9]?.units[0]).not.toHaveProperty('concept')
    expect(plan.fragments[10]?.units[0]).toEqual({ kind: 'english', key: 'luc', prefix: false })
    expect(plan.fragments[11]?.units[0]).toHaveProperty('concept')
  })

  it('shares the expansion budget between aliases with the same merged concept', () => {
    const plan = chinese([...budgetKeys.slice(0, 6), '通知', '提醒', '庚词', '辛词'].join(' '))
    expect(plan.fragments[8]?.units[0]).toHaveProperty('concept')
    expect(plan.fragments[9]?.units[0]).not.toHaveProperty('concept')
  })
})
