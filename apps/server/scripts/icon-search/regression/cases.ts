export const adminCases = [
  ['用户', 'user', 'users'],
  ['角色', 'role', 'roles', 'user-cog', 'user-shield'],
  ['部门', 'department', 'building-2', 'hierarchy', 'organization-chart'],
  ['菜单', 'menu', 'menu-2', 'bars-3', 'hamburger-menu'],
  ['权限', 'permission', 'permissions', 'shield-check', 'key-round'],
  ['设置', 'settings', 'setting', 'gear', 'cog'],
  ['退出登录', 'log-out', 'logout', 'sign-out', 'door-exit'],
  ['搜索', 'search', 'magnifying-glass', 'loupe'],
  ['查找', 'search', 'magnifying-glass', 'loupe'],
  ['编辑', 'edit', 'pencil', 'square-pen'],
  ['新增', 'add', 'plus', 'circle-plus', 'square-plus'],
  ['上传', 'upload', 'cloud-upload', 'arrow-up-to-line'],
  ['下载', 'download', 'cloud-download', 'arrow-down-to-line'],
  ['刷新', 'refresh', 'refresh-cw', 'reload'],
  ['导入', 'import', 'file-input'],
  ['导出', 'export', 'file-output'],
  ['公告', 'announcement', 'megaphone', 'megaphone-2', 'bullhorn'],
  ['数据字典', 'data-dictionary', 'dictionary', 'book-a'],
  ['附件', 'attachment', 'paperclip', 'paper-clip'],
  ['定时任务', 'calendar-clock', 'calendar-time', 'clock-cog', 'alarm-clock', 'cron'],
  ['监控', 'monitoring', 'end-to-end-monitoring', 'cloud-monitoring'],
  ['仪表盘', 'dashboard', 'layout-dashboard'],
  ['文件夹', 'folder', 'folders'],
  ['锁', 'lock', 'locked'],
  ['解锁', 'unlock', 'unlocked', 'lock-open', 'lock-keyhole-open'],
  ['收藏', 'favorite', 'favourite', 'star', 'bookmark'],
  ['过滤', 'filter', 'filter-variant', 'funnel'],
  ['筛选', 'filter', 'filter-variant', 'funnel'],
] as const

export const variantCases = [
  {
    queries: ['打开文件夹', '打开 文件夹', '打开的文件夹'],
    names: ['folder-open', 'open-folder', 'folder-opened', 'open-file-folder'],
  },
  {
    queries: ['K线图', 'K 线图', '股票图'],
    names: ['chart-candlestick', 'candlestick-chart', 'chart-stock'],
  },
  {
    queries: ['四级标题', '4级标题', '标题4', '标题级别4'],
    names: ['heading-4'],
  },
  {
    queries: ['AVI文件', 'AVI 文件'],
    names: ['avi-format', 'file-avi-filled', 'file-avi-outline', 'vide-document-avi'],
  },
  {
    queries: ['信用卡', '贷记卡'],
    names: ['credit-card', 'creditcard'],
  },
] as const
