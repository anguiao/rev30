// Frozen from the approved 2026-10-02 design before changing search behavior.
export const qualitySampleVersion = '2026-10-02-v1'

export const qualitySampleIds = {
  A: 'lucide:log-out',
  B: 'tabler:logout',
  C: 'mdi:logout',
  D: 'lucide:search',
  E: 'lucide:trash',
  F: 'mdi:trash-can',
  G: 'lucide:folder-open',
  H: 'tabler:folder-open',
  I: 'lucide:bell',
  J: 'lucide:logs',
  K: 'lucide:signpost',
  L: 'lucide:trash-2',
} as const

export const qualitySampleExpressions = [
  {
    kind: 'icon',
    owner: qualitySampleIds.A,
    source: 'log-out',
    expressions: ['退出登录', '登出', 'log out', 'logout', 'sign out', 'sign-out'],
  },
  {
    kind: 'icon',
    owner: qualitySampleIds.B,
    source: 'logout',
    expressions: ['退出登录', '登出', 'log out', 'log-out', 'sign out', 'sign-out'],
  },
  {
    kind: 'icon',
    owner: qualitySampleIds.C,
    source: 'logout',
    expressions: ['退出登录', '登出', 'log out', 'log-out', 'sign out', 'sign-out'],
  },
  {
    kind: 'icon',
    owner: qualitySampleIds.D,
    source: 'search',
    expressions: ['搜索', '查找', 'find'],
  },
  {
    kind: 'icon',
    owner: qualitySampleIds.E,
    source: 'trash',
    expressions: ['垃圾桶', '废纸篓', 'trash can', 'trash-can'],
  },
  {
    kind: 'icon',
    owner: qualitySampleIds.F,
    source: 'trash-can',
    expressions: ['垃圾桶', '废纸篓', 'trash can'],
  },
  { kind: 'icon', owner: qualitySampleIds.G, source: 'folder', expressions: ['文件夹'] },
  { kind: 'icon', owner: qualitySampleIds.G, source: 'open', expressions: ['打开'] },
  { kind: 'icon', owner: qualitySampleIds.G, source: 'folder-open', expressions: ['打开文件夹'] },
  { kind: 'icon', owner: qualitySampleIds.H, source: 'folder', expressions: ['文件夹'] },
  { kind: 'icon', owner: qualitySampleIds.H, source: 'open', expressions: ['打开'] },
  { kind: 'icon', owner: qualitySampleIds.I, source: 'bell', expressions: ['铃铛'] },
  { kind: 'icon', owner: qualitySampleIds.J, source: 'logs', expressions: ['日志'] },
  { kind: 'icon', owner: qualitySampleIds.K, source: 'signpost', expressions: ['路标'] },
  { kind: 'icon', owner: qualitySampleIds.L, source: 'trash', expressions: ['垃圾桶'] },
] as const

type SampleLabel = keyof typeof qualitySampleIds
type QualityQuery = {
  number: number
  query: string
  required: readonly SampleLabel[]
  forbidden: readonly SampleLabel[]
  exact?: readonly SampleLabel[]
  before?: readonly [SampleLabel, SampleLabel]
}

export const qualityQueries: readonly QualityQuery[] = [
  { number: 1, query: 'lucide:log-out', required: ['A'], forbidden: [], exact: ['A'] },
  { number: 2, query: 'log-out', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 3, query: 'log out', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 4, query: 'logout', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 5, query: '登出', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 6, query: 'sign out', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 7, query: 'sign-out', required: ['A', 'B', 'C'], forbidden: [] },
  { number: 8, query: 'lucide sign out', required: ['A'], forbidden: ['B', 'C'] },
  { number: 9, query: 'sign out qzxmissing', required: [], forbidden: ['A', 'B', 'C'] },
  { number: 10, query: 'sign', required: ['K'], forbidden: ['A', 'B', 'C'] },
  { number: 11, query: 'sig ou', required: [], forbidden: ['A', 'B', 'C'] },
  { number: 12, query: 'out sign', required: [], forbidden: ['A', 'B', 'C'] },
  { number: 13, query: 'log', required: ['A', 'B', 'C', 'J'], forbidden: [] },
  { number: 14, query: '日志', required: ['J'], forbidden: ['A', 'B', 'C'] },
  { number: 15, query: '罐头', required: [], forbidden: ['F'] },
  { number: 16, query: '垃圾桶', required: ['E', 'F', 'L'], forbidden: [] },
  { number: 17, query: '废纸篓', required: ['E', 'F'], forbidden: ['L'] },
  { number: 18, query: 'trash can', required: ['E', 'F'], forbidden: ['L'] },
  { number: 19, query: '查找', required: ['D'], forbidden: [] },
  { number: 20, query: 'find', required: ['D'], forbidden: [] },
  { number: 21, query: 'fin', required: [], forbidden: ['D'] },
  { number: 22, query: '打开文件夹', required: ['G'], forbidden: ['H'] },
  { number: 23, query: '打开 文件夹', required: ['G', 'H'], forbidden: [], before: ['G', 'H'] },
  { number: 24, query: '文件夹 打开', required: ['G', 'H'], forbidden: [] },
  { number: 25, query: 'lucide 打开 文件夹', required: ['G'], forbidden: ['H'] },
  { number: 26, query: '打开 文件夹 qzxmissing', required: [], forbidden: ['G', 'H'] },
  { number: 27, query: '铃铛', required: ['I'], forbidden: [] },
  { number: 28, query: '通知', required: [], forbidden: ['I'] },
  { number: 29, query: 'lucide:trash-2', required: ['L'], forbidden: [], exact: ['L'] },
  { number: 30, query: 'ＳＩＧＮ　ＯＵＴ', required: ['A', 'B', 'C'], forbidden: [] },
]

export const qualityPerformanceCases = [
  { kind: 'original-english', query: 'file' },
  { kind: 'full-chinese', query: '铃铛' },
  { kind: 'full-english-expression', query: 'sign out' },
  { kind: 'spaced-chinese-expression', query: '打开 文件夹' },
  { kind: 'mixed', query: 'lucide 打开 文件夹' },
  { kind: 'wide-multiple-terms', query: 'outline round' },
  { kind: 'wide-prefix', query: 'co' },
  { kind: 'maximum-length', query: 'a'.repeat(120) },
  {
    kind: 'many-short-terms',
    query: Array.from({ length: 40 }, (_, index) =>
      String.fromCharCode(97 + Math.floor(index / 26), 97 + (index % 26)),
    ).join(' '),
  },
] as const
