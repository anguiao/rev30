import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  ATTACHMENT_CLEANUP_POLICY_MANUAL,
  ATTACHMENT_READ_POLICY_SIGNED,
  type TiptapDocument,
} from '@rev30/contracts'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb } from '../../src/db/index'
import { migratePGlite } from '../../src/db/migrate'
import {
  attachmentReferences,
  attachments,
  authLoginAttemptBuckets,
  announcementReads,
  announcementTargets,
  announcements,
  systemConfigOverrides,
  systemResources,
  systemRoles,
  systemUsers,
} from '../../src/db/schema'

const originalNodeEnv = process.env.NODE_ENV
const originalPgliteDataDir = process.env.PGLITE_DATA_DIR
const tempDirs: string[] = []

const expectedTableNames = [
  'attachment_references',
  'attachments',
  'auth_login_attempt_buckets',
  'auth_password_credentials',
  'auth_refresh_tokens',
  'announcement_reads',
  'announcement_targets',
  'announcements',
  'custom_icon_set_icons',
  'custom_icon_sets',
  'system_config_overrides',
  'system_departments',
  'system_dictionary_items',
  'system_dictionary_types',
  'system_resources',
  'system_role_resources',
  'system_roles',
  'system_user_departments',
  'system_user_roles',
  'system_users',
]

const expectedResourceCodes = [
  'system',
  'system:user',
  'system:user:list',
  'system:user:reset-password',
  'system:department',
  'system:role',
  'system:resource',
  'system:config',
  'system:config:list',
  'system:config:update',
  'system:dictionary',
  'content',
  'content:announcement',
  'content:attachment',
  'content:attachment:list',
  'content:icon-set',
  'content:icon-set:list',
  'content:icon-set:create',
  'content:icon-set:update',
  'content:icon-set:delete',
  'content:icon-set:export',
]

async function createTempDir() {
  const directory = await mkdtemp(join(tmpdir(), 'rev30-pglite-'))

  tempDirs.push(directory)

  return directory
}

function restoreEnv(key: 'NODE_ENV' | 'PGLITE_DATA_DIR', value: string | undefined) {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

describe('PGlite migration runner', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('applies the baseline migration to a fresh PGlite database', async () => {
    const client = new PGlite()

    try {
      await migratePGlite(client)

      const database = drizzle({ client })
      const now = new Date()
      const tableNames = await client.query<{ table_name: string }>(
        `
          select table_name
          from information_schema.tables
          where table_schema = 'public'
            and table_type = 'BASE TABLE'
            and table_name <> '__drizzle_migrations'
        `,
      )
      const resources = await database
        .select({
          code: systemResources.code,
          icon: systemResources.icon,
          name: systemResources.name,
          path: systemResources.path,
        })
        .from(systemResources)
        .where(inArray(systemResources.code, expectedResourceCodes))
      const [adminRole] = await database
        .select()
        .from(systemRoles)
        .where(eq(systemRoles.code, 'admin'))

      expect(new Set(tableNames.rows.map((row) => row.table_name))).toEqual(
        new Set(expectedTableNames),
      )
      expect(new Set(resources.map((resource) => resource.code))).toEqual(
        new Set(expectedResourceCodes),
      )
      expect(resources.find((resource) => resource.code === 'system:dictionary')).toMatchObject({
        icon: 'lucide:book-open-text',
        name: '数据字典',
        path: '/system/dictionaries',
      })
      expect(adminRole).toMatchObject({
        code: 'admin',
        name: 'Administrator',
        status: 1,
      })

      const [createdUser] = await database
        .insert(systemUsers)
        .values({
          id: randomUUID(),
          username: 'migrated-user',
          nickname: 'Migrated User',
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      if (!createdUser) {
        throw new Error('Expected migrated user')
      }

      expect(createdUser.builtIn).toBe(false)

      const [createdConfig] = await database
        .insert(systemConfigOverrides)
        .values({
          id: randomUUID(),
          key: 'auth.loginFailureMaxAttempts',
          value: 'Rev30',
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      expect(createdConfig).toMatchObject({
        key: 'auth.loginFailureMaxAttempts',
        value: 'Rev30',
      })

      await expect(
        database.insert(systemConfigOverrides).values({
          id: randomUUID(),
          key: 'site.title',
          value: '   ',
          createdAt: now,
          updatedAt: now,
        }),
      ).rejects.toThrow()

      const [blankConfig] = await database
        .select()
        .from(systemConfigOverrides)
        .where(eq(systemConfigOverrides.key, 'site.title'))

      expect(blankConfig).toBeUndefined()

      await database.insert(authLoginAttemptBuckets).values({
        username: 'migrated-login-attempt',
        failedCount: 1,
        windowStartedAt: now,
        lastFailedAt: now,
        createdAt: now,
        updatedAt: now,
      })

      const announcementId = randomUUID()
      const announcementContentJson: TiptapDocument = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
      }
      const [createdAnnouncement] = await database
        .insert(announcements)
        .values({
          id: announcementId,
          type: 'notice',
          title: '维护通知',
          summary: '今晚维护',
          contentJson: announcementContentJson,
          contentText: '今晚维护',
          contentHtml: '<p>今晚维护</p>',
          visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
          status: ANNOUNCEMENT_STATUS_DRAFT,
          pinned: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      await database.insert(announcementTargets).values({
        announcementId,
        targetId: createdUser.id,
        targetType: 'user',
        createdAt: now,
      })
      await database.insert(announcementReads).values({
        announcementId,
        userId: createdUser.id,
        readAt: now,
      })

      expect(createdAnnouncement).toMatchObject({
        id: announcementId,
        type: 'notice',
        title: '维护通知',
        summary: '今晚维护',
        contentJson: announcementContentJson,
        contentText: '今晚维护',
        contentHtml: '<p>今晚维护</p>',
        visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
        status: ANNOUNCEMENT_STATUS_DRAFT,
        pinned: true,
        createdAt: now,
        updatedAt: now,
      })

      const [createdAttachment] = await database
        .insert(attachments)
        .values({
          id: randomUUID(),
          storageProvider: 'local',
          storageKey: 'migration-test/attachment.txt',
          originalName: 'attachment.txt',
          mimeType: 'text/plain',
          extension: '.txt',
          size: 12,
          usage: 'migration-test',
          createdBy: createdUser.id,
          createdAt: now,
        })
        .returning()

      expect(createdAttachment?.readPolicy).toBe(ATTACHMENT_READ_POLICY_SIGNED)
      expect(createdAttachment?.cleanupPolicy).toBe(ATTACHMENT_CLEANUP_POLICY_MANUAL)

      await database.insert(attachmentReferences).values({
        attachmentId: createdAttachment!.id,
        sourceType: 'announcement',
        sourceId: announcementId,
        sourceField: 'contentJson',
        createdAt: now,
        updatedAt: now,
      })
    } finally {
      await client.close()
    }
  }, 10_000)

  it('migrates development PGlite databases before returning from createDb', async () => {
    const dataDir = join(await createTempDir(), 'dev')

    process.env.NODE_ENV = 'development'
    process.env.PGLITE_DATA_DIR = dataDir

    const { close, db: database } = await createDb()

    try {
      const [systemResource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'system'))

      expect(systemResource?.name).toBe('系统管理')
    } finally {
      await close()
    }
  }, 10_000)
})
