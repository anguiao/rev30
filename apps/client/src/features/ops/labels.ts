import {
  LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  LOGIN_FAILURE_REASON_RATE_LIMITED,
  LOGIN_LOG_RESULT_FAILURE,
  LOGIN_LOG_RESULT_SUCCESS,
  OPERATION_LOG_MODULE_CONTENT,
  OPERATION_LOG_MODULE_OPS,
  OPERATION_LOG_MODULE_SYSTEM,
  OPERATION_LOG_RESULT_FAILURE,
  OPERATION_LOG_RESULT_SUCCESS,
  SCHEDULED_JOB_ERROR_CATEGORY_DATABASE,
  SCHEDULED_JOB_ERROR_CATEGORY_INTERNAL,
  SCHEDULED_JOB_ERROR_CATEGORY_PARTIAL_FAILURE,
  SCHEDULED_JOB_ERROR_CATEGORY_STORAGE,
  SCHEDULED_JOB_RUN_STATUS_CANCELLED,
  SCHEDULED_JOB_RUN_STATUS_FAILURE,
  SCHEDULED_JOB_RUN_STATUS_INTERRUPTED,
  SCHEDULED_JOB_RUN_STATUS_RUNNING,
  SCHEDULED_JOB_RUN_STATUS_SKIPPED,
  SCHEDULED_JOB_RUN_STATUS_SUCCESS,
  SCHEDULED_JOB_SKIP_REASON_OVERLAP,
  SCHEDULED_JOB_TRIGGER_SOURCE_MANUAL,
  SCHEDULED_JOB_TRIGGER_SOURCE_RECOVERY,
  SCHEDULED_JOB_TRIGGER_SOURCE_SCHEDULED,
  operationLogActionSchema,
  type ClientIpSource,
  type LoginFailureReason,
  type LoginLogResult,
  type OpsDeviceType,
  type OperationLogAction,
  type OperationLogListItem,
  type OperationLogModule,
  type OperationLogResult,
  type ScheduledJobErrorCategory,
  type ScheduledJobRunStatus,
  type ScheduledJobSkipReason,
  type ScheduledJobTriggerSource,
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

export const scheduledJobRunStatusLabels = {
  [SCHEDULED_JOB_RUN_STATUS_RUNNING]: '运行中',
  [SCHEDULED_JOB_RUN_STATUS_SUCCESS]: '成功',
  [SCHEDULED_JOB_RUN_STATUS_FAILURE]: '失败',
  [SCHEDULED_JOB_RUN_STATUS_SKIPPED]: '已跳过',
  [SCHEDULED_JOB_RUN_STATUS_CANCELLED]: '已取消',
  [SCHEDULED_JOB_RUN_STATUS_INTERRUPTED]: '已中断',
} as const satisfies Record<ScheduledJobRunStatus, string>

export const scheduledJobTriggerSourceLabels = {
  [SCHEDULED_JOB_TRIGGER_SOURCE_SCHEDULED]: '定时',
  [SCHEDULED_JOB_TRIGGER_SOURCE_MANUAL]: '手动',
  [SCHEDULED_JOB_TRIGGER_SOURCE_RECOVERY]: '恢复',
} as const satisfies Record<ScheduledJobTriggerSource, string>

export const scheduledJobSkipReasonLabels = {
  [SCHEDULED_JOB_SKIP_REASON_OVERLAP]: '任务重叠',
} as const satisfies Record<ScheduledJobSkipReason, string>

export const scheduledJobErrorCategoryLabels = {
  [SCHEDULED_JOB_ERROR_CATEGORY_PARTIAL_FAILURE]: '部分失败',
  [SCHEDULED_JOB_ERROR_CATEGORY_DATABASE]: '数据库',
  [SCHEDULED_JOB_ERROR_CATEGORY_STORAGE]: '存储',
  [SCHEDULED_JOB_ERROR_CATEGORY_INTERNAL]: '内部错误',
} as const satisfies Record<ScheduledJobErrorCategory, string>

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

export const loginLogResultLabels = {
  [LOGIN_LOG_RESULT_SUCCESS]: '成功',
  [LOGIN_LOG_RESULT_FAILURE]: '失败',
} as const satisfies Record<LoginLogResult, string>

export const loginLogResultOptions: Array<{ label: string; value: LoginLogResult }> = [
  {
    label: loginLogResultLabels[LOGIN_LOG_RESULT_SUCCESS],
    value: LOGIN_LOG_RESULT_SUCCESS,
  },
  {
    label: loginLogResultLabels[LOGIN_LOG_RESULT_FAILURE],
    value: LOGIN_LOG_RESULT_FAILURE,
  },
]

export const loginFailureReasonLabels = {
  [LOGIN_FAILURE_REASON_INVALID_CREDENTIALS]: '凭据无效',
  [LOGIN_FAILURE_REASON_ACCOUNT_DISABLED]: '账号已停用',
  [LOGIN_FAILURE_REASON_RATE_LIMITED]: '触发限流',
} as const satisfies Record<LoginFailureReason, string>

export const loginFailureReasonOptions: Array<{ label: string; value: LoginFailureReason }> = [
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_INVALID_CREDENTIALS],
    value: LOGIN_FAILURE_REASON_INVALID_CREDENTIALS,
  },
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_ACCOUNT_DISABLED],
    value: LOGIN_FAILURE_REASON_ACCOUNT_DISABLED,
  },
  {
    label: loginFailureReasonLabels[LOGIN_FAILURE_REASON_RATE_LIMITED],
    value: LOGIN_FAILURE_REASON_RATE_LIMITED,
  },
]

export const clientIpSourceLabels: Record<ClientIpSource, string> = {
  socket: 'socket',
  'x-forwarded-for': 'x-forwarded-for',
  unavailable: 'unavailable',
}

export const opsDeviceTypeLabels: Record<OpsDeviceType, string> = {
  desktop: '桌面设备',
  mobile: '移动设备',
  tablet: '平板设备',
  tv: '电视设备',
  bot: '机器人',
  unknown: '未知设备',
}
