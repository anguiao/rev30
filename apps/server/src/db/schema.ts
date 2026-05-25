import {
  type AnyPgColumn,
  boolean,
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
  CONFIG_STATUS_ENABLED,
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

export const systemUsers = pgTable(
  'system_users',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    nickname: text('nickname').notNull(),
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
  ],
)

export const systemDepartments = pgTable(
  'system_departments',
  {
    id: uuid('id').primaryKey(),
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
    id: uuid('id').primaryKey(),
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
    id: uuid('id').primaryKey(),
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

export const systemConfigs = pgTable(
  'system_configs',
  {
    id: uuid('id').primaryKey(),
    groupCode: text('group_code').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    valueType: text('value_type').notNull(),
    value: text('value').notNull(),
    description: text('description'),
    status: smallint('status').notNull().default(CONFIG_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('system_configs_key_active_unique')
      .on(table.key)
      .where(sql`${table.deletedAt} IS NULL`),
    index('system_configs_group_code_idx').on(table.groupCode),
    index('system_configs_value_type_idx').on(table.valueType),
    index('system_configs_status_idx').on(table.status),
  ],
)

export const systemDictionaryTypes = pgTable(
  'system_dictionary_types',
  {
    id: uuid('id').primaryKey(),
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
    id: uuid('id').primaryKey(),
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

export const authRefreshTokens = pgTable(
  'auth_refresh_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => systemUsers.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    revokedAt: timestamp('revoked_at', timestampOptions),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex('auth_refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('auth_refresh_tokens_user_id_idx').on(table.userId),
    index('auth_refresh_tokens_expires_at_idx').on(table.expiresAt),
    index('auth_refresh_tokens_revoked_at_idx').on(table.revokedAt),
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

export const contentAnnouncements = pgTable(
  'content_announcements',
  {
    id: uuid('id').primaryKey(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    contentJson: jsonb('content_json').$type<TiptapDocument>().notNull(),
    contentText: text('content_text').notNull(),
    status: text('status').notNull().default(ANNOUNCEMENT_STATUS_DRAFT),
    pinned: boolean('pinned').notNull().default(false),
    publishedAt: timestamp('published_at', timestampOptions),
    ...auditTimestamps(),
  },
  (table) => [
    index('content_announcements_type_idx').on(table.type),
    index('content_announcements_status_idx').on(table.status),
    index('content_announcements_pinned_idx').on(table.pinned),
    index('content_announcements_published_at_idx').on(table.publishedAt),
  ],
)
