export const textStyleColorOptions = [
  { key: 'gray', label: '灰色', value: '#737373' },
  { key: 'red', label: '红色', value: '#ef4444' },
  { key: 'orange', label: '橙色', value: '#f97316' },
  { key: 'amber', label: '琥珀色', value: '#d97706' },
  { key: 'green', label: '绿色', value: '#22c55e' },
  { key: 'blue', label: '蓝色', value: '#3b82f6' },
  { key: 'purple', label: '紫色', value: '#a855f7' },
  { key: 'pink', label: '粉色', value: '#ec4899' },
] as const

export type TextColorOption = (typeof textStyleColorOptions)[number]

export const textColors = textStyleColorOptions.map((option) => option.value)

export const textStyleFontFamilyOptions = [
  { key: 'system', label: '系统默认', value: 'system-ui' },
  { key: 'sans', label: '无衬线', value: 'sans-serif' },
  { key: 'serif', label: '衬线', value: 'serif' },
  { key: 'monospace', label: '等宽', value: 'monospace' },
] as const

export type FontFamilyOption = (typeof textStyleFontFamilyOptions)[number]

export const fontFamilies = textStyleFontFamilyOptions.map((option) => option.value)

export const textStyleFontSizeOptions = [
  { key: '8pt', label: '8pt', value: '8pt' },
  { key: '10pt', label: '10pt', value: '10pt' },
  { key: '12pt', label: '12pt', value: '12pt' },
  { key: '14pt', label: '14pt', value: '14pt' },
  { key: '18pt', label: '18pt', value: '18pt' },
  { key: '24pt', label: '24pt', value: '24pt' },
  { key: '36pt', label: '36pt', value: '36pt' },
] as const

export type FontSizeOption = (typeof textStyleFontSizeOptions)[number]

export const fontSizes = textStyleFontSizeOptions.map((option) => option.value)

export const textStyleLineHeightOptions = [
  { key: '1', label: '1', value: '1' },
  { key: '1.1', label: '1.1', value: '1.1' },
  { key: '1.2', label: '1.2', value: '1.2' },
  { key: '1.3', label: '1.3', value: '1.3' },
  { key: '1.4', label: '1.4', value: '1.4' },
  { key: '1.5', label: '1.5', value: '1.5' },
  { key: '2', label: '2', value: '2' },
] as const

export type LineHeightOption = (typeof textStyleLineHeightOptions)[number]

export const lineHeights = textStyleLineHeightOptions.map((option) => option.value)
