import {
  type AnyPgColumn,
  bigint as bigintColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  ATTACHMENT_CLEANUP_POLICY_MANUAL,
  ATTACHMENT_READ_POLICY_SIGNED,
  DEPARTMENT_STATUS_ENABLED,
  DICTIONARY_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  type TiptapDocument,
  USER_STATUS_ENABLED,
} from '@rev30/contracts'

const timestampOptions = { withTimezone: true } as const

function createdAtColumn() {
  return timestamp('created_at', timestampOptions).notNull().defaultNow()
}

function updatedAtColumn() {
  return timestamp('updated_at', timestampOptions)
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
}

function deletedAtColumn() {
  return timestamp('deleted_at', timestampOptions)
}

function auditTimestamps() {
  return {
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    deletedAt: deletedAtColumn(),
  }
}

function mutableTimestamps() {
  return {
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  }
}

function createdTimestamp() {
  return {
    createdAt: createdAtColumn(),
  }
}

function uuidPrimaryKeyColumn() {
  return uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`)
}

export const systemUsers = pgTable(
  'system_users',
  {
    id: uuidPrimaryKeyColumn(),
    username: text('username').notNull(),
    nickname: text('nickname').notNull(),
    avatarId: uuid('avatar_id').references((): AnyPgColumn => attachments.id),
    email: text('email'),
    phone: text('phone'),
    status: smallint('status').notNull().default(USER_STATUS_ENABLED),
    builtIn: boolean('built_in').notNull().default(false),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_users_username_unique')
      .on(table.username)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('system_users_email_unique')
      .on(table.email)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex('system_users_phone_unique')
      .on(table.phone)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_users_avatar_id_idx').on(table.avatarId),
  ],
)

export const systemDepartments = pgTable(
  'system_departments',
  {
    id: uuidPrimaryKeyColumn(),
    parentId: uuid('parent_id').references((): AnyPgColumn => systemDepartments.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: smallint('status').notNull().default(DEPARTMENT_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_departments_code_unique')
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_departments_parent_id_idx').on(table.parentId),
    index('system_departments_status_idx').on(table.status),
  ],
)

export const systemResources = pgTable(
  'system_resources',
  {
    id: uuidPrimaryKeyColumn(),
    parentId: uuid('parent_id').references((): AnyPgColumn => systemResources.id),
    type: text('type').notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    path: text('path'),
    externalUrl: text('external_url'),
    openTarget: text('open_target').notNull().default(RESOURCE_OPEN_TARGET_SELF),
    icon: text('icon'),
    hidden: boolean('hidden').notNull().default(false),
    status: smallint('status').notNull().default(RESOURCE_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_resources_code_unique')
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_resources_parent_id_idx').on(table.parentId),
    index('system_resources_type_idx').on(table.type),
    index('system_resources_status_idx').on(table.status),
  ],
)

export const systemRoles = pgTable(
  'system_roles',
  {
    id: uuidPrimaryKeyColumn(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: smallint('status').notNull().default(ROLE_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_roles_code_unique')
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_roles_status_idx').on(table.status),
  ],
)

export const systemConfigOverrides = pgTable(
  'system_config_overrides',
  {
    id: uuidPrimaryKeyColumn(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex('system_config_overrides_key_unique').on(table.key),
    check('system_config_overrides_value_non_blank_check', sql`btrim(${table.value}) <> ''`),
  ],
)

export const systemDictionaryTypes = pgTable(
  'system_dictionary_types',
  {
    id: uuidPrimaryKeyColumn(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: smallint('status').notNull().default(DICTIONARY_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_dictionary_types_code_active_unique')
      .on(table.code)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_dictionary_types_status_idx').on(table.status),
  ],
)

export const systemDictionaryItems = pgTable(
  'system_dictionary_items',
  {
    id: uuidPrimaryKeyColumn(),
    typeId: uuid('type_id')
      .notNull()
      .references(() => systemDictionaryTypes.id),
    label: text('label').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    status: smallint('status').notNull().default(DICTIONARY_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_dictionary_items_type_value_active_unique')
      .on(table.typeId, table.value)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_dictionary_items_type_id_idx').on(table.typeId),
    index('system_dictionary_items_status_idx').on(table.status),
  ],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuidPrimaryKeyColumn(),
    storageProvider: text('storage_provider').notNull(),
    storageKey: text('storage_key').notNull(),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    size: integer('size').notNull(),
    usage: text('usage').notNull(),
    readPolicy: text('read_policy').notNull().default(ATTACHMENT_READ_POLICY_SIGNED),
    cleanupPolicy: text('cleanup_policy').notNull().default(ATTACHMENT_CLEANUP_POLICY_MANUAL),
    checksum: text('checksum'),
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => systemUsers.id),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_unique').on(table.storageProvider, table.storageKey),
    index('attachments_created_by_created_at_idx').on(table.createdBy, table.createdAt),
    index('attachments_usage_created_at_idx').on(table.usage, table.createdAt),
    index('attachments_cleanup_policy_updated_at_idx').on(table.cleanupPolicy, table.updatedAt),
    index('attachments_deleted_at_idx').on(table.deletedAt),
  ],
)

export const attachmentUploadSessions = pgTable(
  'attachment_upload_sessions',
  {
    id: uuidPrimaryKeyColumn(),
    originalName: text('original_name').notNull(),
    expectedSize: integer('expected_size').notNull(),
    usage: text('usage').notNull(),
    readPolicy: text('read_policy').notNull().default(ATTACHMENT_READ_POLICY_SIGNED),
    cleanupPolicy: text('cleanup_policy').notNull().default(ATTACHMENT_CLEANUP_POLICY_MANUAL),
    state: text('state', { enum: ['pending', 'uploading', 'stored'] })
      .notNull()
      .default('pending'),
    storageProvider: text('storage_provider'),
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    extension: text('extension'),
    storedSize: integer('stored_size'),
    checksum: text('checksum'),
    storedAt: timestamp('stored_at', timestampOptions),
    createdBy: uuid('created_by')
      .notNull()
      .references((): AnyPgColumn => systemUsers.id),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    check(
      'attachment_upload_sessions_state_check',
      sql`${table.state} IN ('pending', 'uploading', 'stored')`,
    ),
    check(
      'attachment_upload_sessions_expected_size_non_negative_check',
      sql`${table.expectedSize} >= 0`,
    ),
    check(
      'attachment_upload_sessions_expiration_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      'attachment_upload_sessions_storage_state_check',
      sql`(
        ${table.state} IN ('pending', 'uploading')
        AND ${table.storageProvider} IS NULL
        AND ${table.storageKey} IS NULL
        AND ${table.mimeType} IS NULL
        AND ${table.extension} IS NULL
        AND ${table.storedSize} IS NULL
        AND ${table.checksum} IS NULL
        AND ${table.storedAt} IS NULL
      ) OR (
        ${table.state} = 'stored'
        AND ${table.storageProvider} IS NOT NULL
        AND ${table.storageKey} IS NOT NULL
        AND ${table.mimeType} IS NOT NULL
        AND ${table.extension} IS NOT NULL
        AND ${table.storedSize} IS NOT NULL
        AND ${table.storedSize} >= 0
        AND ${table.checksum} IS NOT NULL
        AND ${table.storedAt} IS NOT NULL
      )`,
    ),
    uniqueIndex('attachment_upload_sessions_storage_key_unique')
      .on(table.storageProvider, table.storageKey)
      .where(sql`${table.storageKey} IS NOT NULL`),
    index('attachment_upload_sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const attachmentReferences = pgTable(
  'attachment_references',
  {
    attachmentId: uuid('attachment_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    sourceField: text('source_field').notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    primaryKey({
      columns: [table.sourceType, table.sourceId, table.sourceField, table.attachmentId],
    }),
    index('attachment_references_attachment_id_idx').on(table.attachmentId),
    index('attachment_references_source_idx').on(table.sourceType, table.sourceId),
  ],
)

export const systemUserDepartments = pgTable(
  'system_user_departments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => systemUsers.id),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => systemDepartments.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.departmentId],
    }),
    index('system_user_departments_department_id_idx').on(table.departmentId),
  ],
)

export const systemRoleResources = pgTable(
  'system_role_resources',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => systemRoles.id),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => systemResources.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.resourceId],
    }),
    index('system_role_resources_resource_id_idx').on(table.resourceId),
  ],
)

export const systemUserRoles = pgTable(
  'system_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => systemUsers.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => systemRoles.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
    }),
    index('system_user_roles_role_id_idx').on(table.roleId),
  ],
)

export const authPasswordCredentials = pgTable('auth_password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => systemUsers.id),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  ...mutableTimestamps(),
})

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => systemUsers.id),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    createdIp: text('created_ip'),
    createdIpSource: text('created_ip_source').notNull().default('unavailable'),
    userAgent: text('user_agent'),
    lastActiveAt: timestamp('last_active_at', timestampOptions).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    revokedAt: timestamp('revoked_at', timestampOptions),
    revocationReason: text('revocation_reason'),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex('auth_sessions_refresh_token_hash_unique').on(table.refreshTokenHash),
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
    index('auth_sessions_revoked_at_idx').on(table.revokedAt),
    index('auth_sessions_last_active_at_idx').on(table.lastActiveAt),
    check(
      'auth_sessions_created_ip_source_check',
      sql`${table.createdIpSource} in ('socket', 'x-forwarded-for', 'unavailable')`,
    ),
    check(
      'auth_sessions_revocation_check',
      sql`(${table.revokedAt} is null and ${table.revocationReason} is null) or (${table.revokedAt} is not null and ${table.revocationReason} is not null and ${table.revocationReason} in ('logout', 'password_changed', 'password_reset', 'admin_forced', 'user_disabled', 'user_deleted'))`,
    ),
  ],
)

export const opsLoginLogs = pgTable(
  'ops_login_logs',
  {
    id: uuidPrimaryKeyColumn(),
    userId: uuid('user_id').references(() => systemUsers.id),
    username: text('username').notNull(),
    result: text('result').notNull(),
    failureReason: text('failure_reason'),
    sessionId: uuid('session_id'),
    requestId: uuid('request_id').notNull(),
    clientIp: text('client_ip'),
    clientIpSource: text('client_ip_source').notNull(),
    userAgent: text('user_agent'),
    ...createdTimestamp(),
  },
  (table) => [
    index('ops_login_logs_created_at_id_idx').on(table.createdAt, table.id),
    index('ops_login_logs_user_id_idx').on(table.userId),
    index('ops_login_logs_username_idx').on(table.username),
    index('ops_login_logs_result_idx').on(table.result),
    index('ops_login_logs_client_ip_idx').on(table.clientIp),
    check(
      'ops_login_logs_client_ip_source_check',
      sql`${table.clientIpSource} in ('socket', 'x-forwarded-for', 'unavailable')`,
    ),
    check(
      'ops_login_logs_result_check',
      sql`(${table.result} = 'success' and ${table.userId} is not null and ${table.sessionId} is not null and ${table.failureReason} is null) or (${table.result} = 'failure' and ${table.sessionId} is null and ${table.failureReason} is not null and ${table.failureReason} in ('invalid_credentials', 'account_disabled', 'rate_limited'))`,
    ),
  ],
)

export const opsOperationLogs = pgTable(
  'ops_operation_logs',
  {
    id: uuidPrimaryKeyColumn(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorUsername: text('actor_username').notNull(),
    actorNickname: text('actor_nickname').notNull(),
    actorIsAdmin: boolean('actor_is_admin').notNull(),
    actorSessionId: uuid('actor_session_id').notNull(),
    module: text('module').notNull(),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetKey: text('target_key'),
    targetLabel: text('target_label'),
    result: text('result').notNull(),
    httpStatus: smallint('http_status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    requestId: uuid('request_id').notNull(),
    clientIp: text('client_ip'),
    clientIpSource: text('client_ip_source').notNull(),
    userAgent: text('user_agent'),
    ...createdTimestamp(),
  },
  (table) => [
    index('ops_operation_logs_created_at_id_idx').on(table.createdAt, table.id),
    index('ops_operation_logs_actor_user_id_idx').on(table.actorUserId),
    index('ops_operation_logs_actor_session_id_idx').on(table.actorSessionId),
    index('ops_operation_logs_module_action_idx').on(table.module, table.action),
    index('ops_operation_logs_result_idx').on(table.result),
    index('ops_operation_logs_http_status_idx').on(table.httpStatus),
    index('ops_operation_logs_target_type_target_key_idx').on(table.targetType, table.targetKey),
    index('ops_operation_logs_client_ip_idx').on(table.clientIp),
    uniqueIndex('ops_operation_logs_request_id_unique').on(table.requestId),
    check('ops_operation_logs_module_check', sql`${table.module} in ('system', 'content', 'ops')`),
    check(
      'ops_operation_logs_client_ip_source_check',
      sql`${table.clientIpSource} in ('socket', 'x-forwarded-for', 'unavailable')`,
    ),
    check(
      'ops_operation_logs_action_shape_check',
      sql`btrim(${table.action}) <> '' and btrim(${table.targetType}) <> '' and char_length(${table.targetType}) <= 512 and split_part(${table.action}, ':', 1) = ${table.module} and split_part(${table.action}, ':', 2) = ${table.targetType} and btrim(split_part(${table.action}, ':', 3)) <> '' and ${table.action} = ${table.module} || ':' || ${table.targetType} || ':' || split_part(${table.action}, ':', 3)`,
    ),
    check('ops_operation_logs_http_status_check', sql`${table.httpStatus} between 100 and 599`),
    check('ops_operation_logs_duration_check', sql`${table.durationMs} >= 0`),
    check(
      'ops_operation_logs_result_status_check',
      sql`(${table.result} = 'success' and ${table.httpStatus} between 200 and 299) or (${table.result} = 'failure' and ${table.httpStatus} not between 200 and 299)`,
    ),
    check(
      'ops_operation_logs_actor_snapshot_check',
      sql`btrim(${table.actorUsername}) <> '' and char_length(${table.actorUsername}) <= 512 and btrim(${table.actorNickname}) <> '' and char_length(${table.actorNickname}) <= 512`,
    ),
    check(
      'ops_operation_logs_target_check',
      sql`(${table.targetKey} is null or (btrim(${table.targetKey}) <> '' and char_length(${table.targetKey}) <= 512)) and (${table.targetLabel} is null or (btrim(${table.targetLabel}) <> '' and char_length(${table.targetLabel}) <= 512)) and (${table.targetKey} is not null or ${table.targetLabel} is not null)`,
    ),
    check(
      'ops_operation_logs_user_agent_length_check',
      sql`${table.userAgent} is null or char_length(${table.userAgent}) <= 512`,
    ),
  ],
)

export const opsScheduledJobs = pgTable(
  'ops_scheduled_jobs',
  {
    taskKey: text('task_key').primaryKey(),
    cronExpression: text('cron_expression').notNull(),
    timezone: text('timezone').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at', timestampOptions),
    activeRunId: uuid('active_run_id').references((): AnyPgColumn => opsJobRuns.id, {
      onDelete: 'restrict',
    }),
    ...mutableTimestamps(),
  },
  (table) => [
    index('ops_scheduled_jobs_enabled_next_run_at_task_key_idx').on(
      table.enabled,
      table.nextRunAt,
      table.taskKey,
    ),
    uniqueIndex('ops_scheduled_jobs_active_run_id_unique')
      .on(table.activeRunId)
      .where(sql`${table.activeRunId} IS NOT NULL`),
    check(
      'ops_scheduled_jobs_text_shape_check',
      sql`
        btrim(${table.taskKey}) <> ''
        AND char_length(${table.taskKey}) <= 128
        AND btrim(${table.cronExpression}) <> ''
        AND char_length(${table.cronExpression}) <= 128
        AND btrim(${table.timezone}) <> ''
        AND char_length(${table.timezone}) <= 128
      `,
    ),
    check(
      'ops_scheduled_jobs_enabled_next_run_at_check',
      sql`(${table.enabled} AND ${table.nextRunAt} IS NOT NULL) OR (NOT ${table.enabled} AND ${table.nextRunAt} IS NULL)`,
    ),
  ],
)

export const opsJobRuns = pgTable(
  'ops_job_runs',
  {
    id: uuidPrimaryKeyColumn(),
    taskKey: text('task_key')
      .notNull()
      .references(() => opsScheduledJobs.taskKey, { onDelete: 'restrict' }),
    triggerSource: text('trigger_source').notNull(),
    status: text('status').notNull(),
    skipReason: text('skip_reason'),
    scheduledFor: timestamp('scheduled_for', timestampOptions),
    executorId: uuid('executor_id'),
    deletedCount: integer('deleted_count'),
    failedCount: integer('failed_count'),
    errorCategory: text('error_category'),
    errorSummary: text('error_summary'),
    triggeredByUserId: uuid('triggered_by_user_id'),
    triggeredByUsername: text('triggered_by_username'),
    triggeredByNickname: text('triggered_by_nickname'),
    triggeredBySessionId: uuid('triggered_by_session_id'),
    triggerRequestId: uuid('trigger_request_id'),
    cancelRequestedAt: timestamp('cancel_requested_at', timestampOptions),
    cancelRequestedByUserId: uuid('cancel_requested_by_user_id'),
    cancelRequestedByUsername: text('cancel_requested_by_username'),
    cancelRequestedByNickname: text('cancel_requested_by_nickname'),
    cancelRequestedBySessionId: uuid('cancel_requested_by_session_id'),
    cancelRequestId: uuid('cancel_request_id'),
    startedAt: timestamp('started_at', timestampOptions),
    finishedAt: timestamp('finished_at', timestampOptions),
    durationMs: bigintColumn('duration_ms', { mode: 'number' }),
    ...mutableTimestamps(),
  },
  (table) => [
    index('ops_job_runs_task_key_created_at_id_idx').on(table.taskKey, table.createdAt, table.id),
    uniqueIndex('ops_job_runs_task_key_running_unique')
      .on(table.taskKey)
      .where(sql`${table.status} = 'running'`),
    index('ops_job_runs_finished_at_id_idx').on(table.finishedAt, table.id),
    index('ops_job_runs_status_idx').on(table.status),
    uniqueIndex('ops_job_runs_trigger_request_id_unique')
      .on(table.triggerRequestId)
      .where(sql`${table.triggerRequestId} IS NOT NULL`),
    check(
      'ops_job_runs_task_key_shape_check',
      sql`btrim(${table.taskKey}) <> '' AND char_length(${table.taskKey}) <= 128`,
    ),
    check(
      'ops_job_runs_trigger_source_check',
      sql`${table.triggerSource} IN ('scheduled', 'manual', 'recovery')`,
    ),
    check(
      'ops_job_runs_status_check',
      sql`${table.status} IN ('running', 'success', 'failure', 'skipped', 'cancelled', 'interrupted')`,
    ),
    check(
      'ops_job_runs_schedule_shape_check',
      sql`(
        ${table.triggerSource} = 'scheduled'
        AND ${table.scheduledFor} IS NOT NULL
      ) OR (
        ${table.triggerSource} = 'manual'
        AND ${table.scheduledFor} IS NULL
      ) OR (
        ${table.triggerSource} = 'recovery'
      )`,
    ),
    check(
      'ops_job_runs_skip_shape_check',
      sql`(
        ${table.status} = 'skipped'
        AND ${table.skipReason} IS NOT NULL
        AND ${table.skipReason} = 'overlap'
        AND ${table.startedAt} IS NULL
        AND ${table.executorId} IS NULL
        AND ${table.deletedCount} IS NULL
        AND ${table.failedCount} IS NULL
        AND ${table.errorCategory} IS NULL
        AND ${table.errorSummary} IS NULL
      ) OR (
        ${table.status} <> 'skipped'
        AND ${table.skipReason} IS NULL
      )`,
    ),
    check(
      'ops_job_runs_execution_shape_check',
      sql`(
        ${table.status} = 'skipped'
        AND ${table.startedAt} IS NULL
        AND ${table.executorId} IS NULL
      ) OR (
        ${table.status} <> 'skipped'
        AND ${table.startedAt} IS NOT NULL
        AND ${table.executorId} IS NOT NULL
      )`,
    ),
    check(
      'ops_job_runs_finished_shape_check',
      sql`(${table.status} = 'running' AND ${table.finishedAt} IS NULL) OR (${table.status} <> 'running' AND ${table.finishedAt} IS NOT NULL)`,
    ),
    check(
      'ops_job_runs_duration_shape_check',
      sql`(
        ${table.status} IN ('success', 'failure', 'cancelled')
        AND ${table.durationMs} IS NOT NULL
        AND ${table.durationMs} BETWEEN 0 AND 9007199254740991
      ) OR (
        ${table.status} IN ('running', 'skipped', 'interrupted')
        AND ${table.durationMs} IS NULL
      )`,
    ),
    check(
      'ops_job_runs_count_shape_check',
      sql`
        (
          (${table.deletedCount} IS NULL OR ${table.deletedCount} >= 0)
          AND (${table.failedCount} IS NULL OR ${table.failedCount} >= 0)
          AND ${table.status} NOT IN ('running', 'skipped', 'interrupted')
        ) OR (
          ${table.status} IN ('running', 'skipped', 'interrupted')
          AND ${table.deletedCount} IS NULL
          AND ${table.failedCount} IS NULL
        )
      `,
    ),
    check(
      'ops_job_runs_success_shape_check',
      sql`${table.status} <> 'success' OR (${table.deletedCount} IS NOT NULL AND ${table.failedCount} IS NOT NULL AND ${table.failedCount} = 0 AND ${table.errorCategory} IS NULL AND ${table.errorSummary} IS NULL)`,
    ),
    check(
      'ops_job_runs_error_shape_check',
      sql`(
        ${table.status} = 'failure'
        AND ${table.errorCategory} IS NOT NULL
        AND ${table.errorCategory} IN ('partial_failure', 'database', 'storage', 'internal')
        AND ${table.errorSummary} IS NOT NULL
        AND btrim(${table.errorSummary}) <> ''
        AND char_length(${table.errorSummary}) <= 512
      ) OR (
        ${table.status} <> 'failure'
        AND ${table.errorCategory} IS NULL
        AND ${table.errorSummary} IS NULL
      )`,
    ),
    check(
      'ops_job_runs_running_interrupted_shape_check',
      sql`(
        ${table.status} NOT IN ('running', 'interrupted')
      ) OR (
        ${table.deletedCount} IS NULL
        AND ${table.failedCount} IS NULL
        AND ${table.errorCategory} IS NULL
        AND ${table.errorSummary} IS NULL
      )`,
    ),
    check(
      'ops_job_runs_trigger_actor_snapshot_check',
      sql`(
        ${table.triggerSource} = 'manual'
        AND ${table.triggeredByUserId} IS NOT NULL
        AND ${table.triggeredByUsername} IS NOT NULL
        AND btrim(${table.triggeredByUsername}) <> ''
        AND char_length(${table.triggeredByUsername}) <= 512
        AND ${table.triggeredByNickname} IS NOT NULL
        AND btrim(${table.triggeredByNickname}) <> ''
        AND char_length(${table.triggeredByNickname}) <= 512
        AND ${table.triggeredBySessionId} IS NOT NULL
        AND ${table.triggerRequestId} IS NOT NULL
      ) OR (
        ${table.triggerSource} <> 'manual'
        AND ${table.triggeredByUserId} IS NULL
        AND ${table.triggeredByUsername} IS NULL
        AND ${table.triggeredByNickname} IS NULL
        AND ${table.triggeredBySessionId} IS NULL
        AND ${table.triggerRequestId} IS NULL
      )`,
    ),
    check(
      'ops_job_runs_cancellation_snapshot_check',
      sql`(
        ${table.cancelRequestedAt} IS NULL
        AND ${table.cancelRequestedByUserId} IS NULL
        AND ${table.cancelRequestedByUsername} IS NULL
        AND ${table.cancelRequestedByNickname} IS NULL
        AND ${table.cancelRequestedBySessionId} IS NULL
        AND ${table.cancelRequestId} IS NULL
      ) OR (
        ${table.cancelRequestedAt} IS NOT NULL
        AND ${table.cancelRequestedByUserId} IS NOT NULL
        AND ${table.cancelRequestedByUsername} IS NOT NULL
        AND btrim(${table.cancelRequestedByUsername}) <> ''
        AND char_length(${table.cancelRequestedByUsername}) <= 512
        AND ${table.cancelRequestedByNickname} IS NOT NULL
        AND btrim(${table.cancelRequestedByNickname}) <> ''
        AND char_length(${table.cancelRequestedByNickname}) <= 512
        AND ${table.cancelRequestedBySessionId} IS NOT NULL
        AND ${table.cancelRequestId} IS NOT NULL
      )`,
    ),
    check(
      'ops_job_runs_cancellation_status_check',
      sql`(
        ${table.cancelRequestedAt} IS NULL
        OR ${table.status} IN ('running', 'cancelled', 'interrupted')
      ) AND (
        ${table.status} <> 'cancelled'
        OR ${table.cancelRequestedAt} IS NOT NULL
      )`,
    ),
  ],
)

export const authLoginAttemptBuckets = pgTable(
  'auth_login_attempt_buckets',
  {
    username: text('username').primaryKey(),
    failedCount: integer('failed_count').notNull(),
    windowStartedAt: timestamp('window_started_at', timestampOptions).notNull(),
    lastFailedAt: timestamp('last_failed_at', timestampOptions).notNull(),
    lockedUntil: timestamp('locked_until', timestampOptions),
    ...mutableTimestamps(),
  },
  (table) => [
    index('auth_login_attempt_buckets_locked_until_idx').on(table.lockedUntil),
    index('auth_login_attempt_buckets_window_started_at_idx').on(table.windowStartedAt),
  ],
)

export const announcements = pgTable(
  'announcements',
  {
    id: uuidPrimaryKeyColumn(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    contentJson: jsonb('content_json').$type<TiptapDocument>().notNull(),
    contentText: text('content_text').notNull(),
    contentHtml: text('content_html').notNull(),
    visibility: text('visibility').notNull().default(ANNOUNCEMENT_VISIBILITY_TARGETED),
    status: text('status').notNull().default(ANNOUNCEMENT_STATUS_DRAFT),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: timestamp('published_at', timestampOptions),
    ...auditTimestamps(),
  },
  (table) => [
    index('announcements_type_idx').on(table.type),
    index('announcements_visibility_idx').on(table.visibility),
    index('announcements_status_idx').on(table.status),
    index('announcements_pinned_idx').on(table.pinned),
    index('announcements_published_at_idx').on(table.publishedAt),
  ],
)

export const announcementTargets = pgTable(
  'announcement_targets',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.announcementId, table.targetType, table.targetId],
    }),
    index('announcement_targets_announcement_id_idx').on(table.announcementId),
    index('announcement_targets_target_idx').on(table.targetType, table.targetId),
  ],
)

export const announcementReads = pgTable(
  'announcement_reads',
  {
    announcementId: uuid('announcement_id')
      .notNull()
      .references(() => announcements.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => systemUsers.id),
    readAt: timestamp('read_at', timestampOptions).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.announcementId, table.userId],
    }),
    index('announcement_reads_user_id_idx').on(table.userId),
  ],
)

export const customIconSets = pgTable(
  'custom_icon_sets',
  {
    id: uuidPrimaryKeyColumn(),
    prefix: text('prefix').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('custom_icon_sets_prefix_active_unique')
      .on(table.prefix)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export const customIconSetIcons = pgTable(
  'custom_icon_set_icons',
  {
    id: uuidPrimaryKeyColumn(),
    setId: uuid('set_id')
      .notNull()
      .references(() => customIconSets.id),
    name: text('name').notNull(),
    body: text('body').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    palette: boolean('palette').notNull().default(false),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('custom_icon_set_icons_set_name_active_unique')
      .on(table.setId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    index('custom_icon_set_icons_set_id_idx').on(table.setId),
  ],
)
