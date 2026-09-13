import {
  OPERATION_LOG_MODULE_CONTENT,
  OPERATION_LOG_MODULE_OPS,
  OPERATION_LOG_MODULE_SYSTEM,
  OPERATION_LOG_RESULT_FAILURE,
  OPERATION_LOG_RESULT_SUCCESS,
  operationLogActionSchema,
  type OperationLogAction,
  type OperationLogListItem,
  type OperationLogModule,
  type OperationLogResult,
} from '@rev30/contracts'

export const operationLogModuleLabels = {
  [OPERATION_LOG_MODULE_SYSTEM]: '系统管理',
  [OPERATION_LOG_MODULE_CONTENT]: '内容管理',
  [OPERATION_LOG_MODULE_OPS]: '运维管理',
} as const satisfies Record<OperationLogModule, string>

export const operationLogResultLabels = {
  [OPERATION_LOG_RESULT_SUCCESS]: '成功',
  [OPERATION_LOG_RESULT_FAILURE]: '失败',
} as const satisfies Record<OperationLogResult, string>

export const operationLogActionLabels = {
  'system:config:update': '更新系统配置',
  'system:dictionary:create': '创建字典',
  'system:dictionary:update': '更新字典',
  'system:dictionary:delete': '删除字典',
  'system:department:create': '创建部门',
  'system:department:update': '更新部门',
  'system:department:delete': '删除部门',
  'system:role:create': '创建角色',
  'system:role:update': '更新角色',
  'system:role:delete': '删除角色',
  'system:resource:create': '创建资源',
  'system:resource:update': '更新资源',
  'system:resource:delete': '删除资源',
  'system:user:create': '创建用户',
  'system:user:update': '更新用户',
  'system:user:reset-password': '重置用户密码',
  'system:user:delete': '删除用户',
  'content:announcement:create': '创建公告',
  'content:announcement:update': '更新公告',
  'content:announcement:publish': '发布公告',
  'content:announcement:archive': '归档公告',
  'content:announcement:delete': '删除公告',
  'content:icon-set:create': '创建图标集',
  'content:icon-set:update': '更新图标集',
  'content:icon-set:delete': '删除图标集',
  'content:icon-set:export': '导出图标集',
  'content:icon:upload': '上传图标',
  'content:icon:rename': '重命名图标',
  'content:icon:update': '编辑图标',
  'content:icon:delete': '删除图标',
  'content:attachment:upload': '完成附件上传',
  'content:attachment:delete': '删除附件',
  'ops:online-session:revoke': '撤销在线会话',
  'ops:scheduled-job:update': '修改定时任务',
  'ops:scheduled-job:enable': '启用定时任务',
  'ops:scheduled-job:disable': '禁用定时任务',
  'ops:scheduled-job:execute': '执行定时任务',
  'ops:scheduled-job:cancel': '取消定时任务',
} as const satisfies Record<OperationLogAction, string>

export const operationLogModuleOptions: Array<{
  label: string
  value: OperationLogModule
}> = [
  {
    label: operationLogModuleLabels[OPERATION_LOG_MODULE_SYSTEM],
    value: OPERATION_LOG_MODULE_SYSTEM,
  },
  {
    label: operationLogModuleLabels[OPERATION_LOG_MODULE_CONTENT],
    value: OPERATION_LOG_MODULE_CONTENT,
  },
  {
    label: operationLogModuleLabels[OPERATION_LOG_MODULE_OPS],
    value: OPERATION_LOG_MODULE_OPS,
  },
]

export const operationLogResultOptions: Array<{
  label: string
  value: OperationLogResult
}> = [
  {
    label: operationLogResultLabels[OPERATION_LOG_RESULT_SUCCESS],
    value: OPERATION_LOG_RESULT_SUCCESS,
  },
  {
    label: operationLogResultLabels[OPERATION_LOG_RESULT_FAILURE],
    value: OPERATION_LOG_RESULT_FAILURE,
  },
]

export const operationLogActionOptions = operationLogActionSchema.options.map((value) => ({
  label: operationLogActionLabels[value],
  value,
}))

export function formatOperationLogTarget(
  item: Pick<OperationLogListItem, 'targetKey' | 'targetLabel'>,
) {
  if (item.targetLabel !== null && item.targetKey !== null) {
    return `${item.targetLabel}（${item.targetKey}）`
  }

  return item.targetLabel ?? item.targetKey ?? '-'
}
