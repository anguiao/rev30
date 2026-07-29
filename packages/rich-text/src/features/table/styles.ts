export const TABLE_CELL_MIN_WIDTH = 96

const tableBorderColor =
  'var(--rich-text-theme-table-border-color, var(--rich-text-table-border-color, light-dark(#e7e5e4, #3f3f46)))'
const tableHeaderColor =
  'var(--rich-text-theme-table-header-color, var(--rich-text-table-header-color, light-dark(#f5f5f4, #18181b)))'

type TableCellTextAlign = 'inherit' | 'left' | 'center' | 'right'

export const richTextTableWrapperStyle =
  'max-width: 100%; overflow-x: auto; overscroll-behavior-x: contain'

export function buildRichTextTableStyle(width = '100%', minWidth?: string) {
  return [
    `width: ${width}`,
    ...(minWidth ? [`min-width: ${minWidth}`] : []),
    `border: 1px solid ${tableBorderColor}`,
    'border-collapse: collapse',
  ].join('; ')
}

export function buildRichTextTableCellStyle(textAlign: TableCellTextAlign = 'inherit') {
  return [
    `min-width: ${TABLE_CELL_MIN_WIDTH}px`,
    `border: 1px solid ${tableBorderColor}`,
    'padding: 0.5rem 0.625rem',
    `text-align: ${textAlign}`,
    'vertical-align: top',
  ].join('; ')
}

export function buildRichTextTableHeaderStyle(textAlign: TableCellTextAlign = 'inherit') {
  return [
    buildRichTextTableCellStyle(textAlign),
    `background-color: ${tableHeaderColor}`,
    'font-weight: 600',
  ].join('; ')
}

export const richTextTableStyle = buildRichTextTableStyle()
export const richTextTableCellStyle = buildRichTextTableCellStyle()
export const richTextTableHeaderStyle = buildRichTextTableHeaderStyle()
