const dayMs = 24 * 60 * 60 * 1000

const defaults = {
  revokedSessionRetentionMs: 7 * dayMs,
  loginAttemptRetentionMs: dayMs,
  loginLogRetentionMs: 90 * dayMs,
  operationLogRetentionMs: 180 * dayMs,
  attachmentRetentionMs: 7 * dayMs,
  jobRunRetentionMs: 90 * dayMs,
} as const

export type ScheduledJobRetentionConfig = {
  revokedSessionRetentionMs: number
  loginAttemptRetentionMs: number
  loginLogRetentionMs: number
  operationLogRetentionMs: number
  attachmentRetentionMs: number
  jobRunRetentionMs: number
}

function readRetention(env: NodeJS.ProcessEnv, name: string, fallback: number, allowZero: boolean) {
  const rawValue = env[name]?.trim()
  if (!rawValue) return fallback

  const value = Number(rawValue)
  const valid = Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0)
  if (!valid) {
    throw new Error(`${name} 必须是${allowZero ? ' 0 或' : ''}正整数毫秒值`)
  }

  return value
}

export function readScheduledJobRetentionConfig(env = process.env): ScheduledJobRetentionConfig {
  return {
    revokedSessionRetentionMs: readRetention(
      env,
      'AUTH_REVOKED_SESSION_RETENTION_MS',
      defaults.revokedSessionRetentionMs,
      true,
    ),
    loginAttemptRetentionMs: readRetention(
      env,
      'AUTH_LOGIN_ATTEMPT_RETENTION_MS',
      defaults.loginAttemptRetentionMs,
      true,
    ),
    loginLogRetentionMs: readRetention(
      env,
      'OPS_LOGIN_LOG_RETENTION_MS',
      defaults.loginLogRetentionMs,
      true,
    ),
    operationLogRetentionMs: readRetention(
      env,
      'OPS_OPERATION_LOG_RETENTION_MS',
      defaults.operationLogRetentionMs,
      true,
    ),
    attachmentRetentionMs: readRetention(
      env,
      'ATTACHMENT_CLEANUP_RETENTION_MS',
      defaults.attachmentRetentionMs,
      false,
    ),
    jobRunRetentionMs: readRetention(
      env,
      'OPS_JOB_RUN_RETENTION_MS',
      defaults.jobRunRetentionMs,
      false,
    ),
  }
}
