export const highlightColorOptions = [
  { key: 'yellow', label: '黄色', value: 'rgba(250, 204, 21, 0.35)' },
  { key: 'green', label: '绿色', value: 'rgba(34, 197, 94, 0.28)' },
  { key: 'blue', label: '蓝色', value: 'rgba(59, 130, 246, 0.3)' },
  { key: 'pink', label: '粉色', value: 'rgba(236, 72, 153, 0.28)' },
] as const

export type HighlightColorOption = (typeof highlightColorOptions)[number]

export const highlightColors = highlightColorOptions.map((color) => color.value)
