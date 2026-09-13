export class InvalidIconCursorError extends Error {
  readonly code = 'INVALID_ICON_CURSOR'

  constructor() {
    super('分页游标无效')
  }
}

export class IconSearchPreparingError extends Error {
  readonly code = 'ICON_SEARCH_PREPARING'

  constructor() {
    super('图标搜索正在准备')
  }
}

export class IconSearchUnavailableError extends Error {
  readonly code = 'ICON_SEARCH_UNAVAILABLE'

  constructor() {
    super('图标搜索暂不可用')
  }
}
