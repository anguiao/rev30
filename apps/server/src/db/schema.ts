import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  DEPARTMENT_STATUS_ENABLED,
  RESOURCE_OPEN_TARGET_SELF,
  RESOURCE_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
} from '@rev30/shared'

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

export const users = pgTable(
  'users',
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
    uniqueIndex('users_username_unique').on(table.username),
    uniqueIndex('users_email_unique').on(table.email),
    uniqueIndex('users_phone_unique').on(table.phone),
  ],
)

export const authPasswordCredentials = pgTable('auth_password_credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
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
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', timestampOptions).notNull(),
    revokedAt: timestamp('revoked_at', timestampOptions),
    ...mutableTimestamps(),
  },
  (table) => [
    uniqueIndex('auth_refresh_tokens_token_hash_unique').on(table.tokenHash),
    index('auth_refresh_tokens_user_id_idx').on(table.userId),
  ],
)

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => departments.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: smallint('status').notNull().default(DEPARTMENT_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('departments_code_unique').on(table.code),
    index('departments_parent_id_idx').on(table.parentId),
    index('departments_status_idx').on(table.status),
  ],
)

export const userDepartments = pgTable(
  'user_departments',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.departmentId],
    }),
    index('user_departments_department_id_idx').on(table.departmentId),
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
    uniqueIndex('system_resources_code_unique').on(table.code),
    index('system_resources_parent_id_idx').on(table.parentId),
    index('system_resources_type_idx').on(table.type),
    index('system_resources_status_idx').on(table.status),
  ],
)

export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    status: smallint('status').notNull().default(ROLE_STATUS_ENABLED),
    sortOrder: integer('sort_order').notNull().default(0),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('roles_code_unique').on(table.code),
    index('roles_status_idx').on(table.status),
  ],
)

export const roleResources = pgTable(
  'role_resources',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => systemResources.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.resourceId],
    }),
    index('role_resources_resource_id_idx').on(table.resourceId),
  ],
)

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    ...createdTimestamp(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
    }),
    index('user_roles_role_id_idx').on(table.roleId),
  ],
)
