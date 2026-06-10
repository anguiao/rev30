export const textAlignOptions = [
  { key: 'left', label: '左对齐', value: 'left', icon: 'i-[lucide--align-left]' },
  { key: 'center', label: '居中对齐', value: 'center', icon: 'i-[lucide--align-center]' },
  { key: 'right', label: '右对齐', value: 'right', icon: 'i-[lucide--align-right]' },
] as const

export type TextAlignment = (typeof textAlignOptions)[number]['value']

export const textAlignments = textAlignOptions.map((alignment) => alignment.value)
