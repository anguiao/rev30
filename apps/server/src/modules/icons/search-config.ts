export const recommendedIconNames = [
  'lucide:users',
  'lucide:user-cog',
  'lucide:shield-check',
  'lucide:menu',
  'lucide:package',
  'lucide:building-2',
  'lucide:settings',
  'lucide:file-clock',
  'lucide:house',
  'lucide:chart-column',
  'lucide:book-open',
  'lucide:bell',
]

export const chineseIconSearchAliases: Record<string, string[]> = {
  用户: ['user', 'users', 'account', 'profile'],
  角色: ['role', 'shield', 'badge', 'user-check'],
  权限: ['permission', 'lock', 'key', 'shield'],
  菜单: ['menu', 'list', 'panel'],
  资源: ['resource', 'box', 'boxes', 'package', 'database'],
  部门: ['department', 'building', 'network', 'organization'],
  组织: ['organization', 'building', 'network', 'users'],
  系统: ['system', 'settings', 'server', 'monitor'],
  设置: ['settings', 'cog', 'sliders'],
  日志: ['log', 'file-text', 'history', 'clock'],
  首页: ['home', 'house', 'dashboard'],
  统计: ['chart', 'bar-chart', 'line-chart', 'activity'],
  报表: ['report', 'chart', 'file-chart', 'clipboard-list'],
  字典: ['dictionary', 'book', 'list'],
  通知: ['bell', 'notification', 'message'],
  文件: ['file', 'folder', 'files'],
  外链: ['external-link', 'link', 'globe'],
  操作: ['action', 'play', 'mouse-pointer', 'command'],
  状态: ['status', 'check', 'circle', 'badge'],
  排序: ['sort', 'arrow-up-down', 'list-ordered'],
  配置: ['settings', 'sliders', 'cog'],
}

export const iconSearchAliasGroups = [
  ['account', 'person', 'profile', 'user'],
  ['add', 'create', 'new', 'plus'],
  ['alert', 'bell', 'notification', 'notify', 'reminder'],
  ['attach', 'connect', 'link'],
  ['building', 'home', 'house'],
  ['cog', 'gear', 'preferences', 'settings'],
  ['delete', 'remove', 'trash'],
  ['document', 'file', 'paper'],
  ['earth', 'globe', 'world', 'global'],
  ['list', 'menu'],
  ['lock', 'secure', 'security'],
  ['refresh', 'reload', 'update', 'sync'],
  ['chart', 'graph'],
] as const

export const preferredIconPrefixes = new Map([
  ['lucide', 40],
  ['tabler', 32],
  ['heroicons', 28],
  ['ph', 24],
  ['material-symbols', 16],
])

export const deprioritizedIconPrefixes = new Set(['logos', 'simple-icons', 'emojione', 'noto'])
