import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { and, eq, isNull } from 'drizzle-orm'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  ANNOUNCEMENT_STATUS_DRAFT,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  type TiptapDocument,
} from '@rev30/contracts'
import { createDb } from '../../src/db/index'
import { migratePGlite } from '../../src/db/migrate'
import {
  contentAnnouncements,
  systemConfigs,
  systemResources,
  systemUsers,
} from '../../src/db/schema'
import * as schema from '../../src/db/schema'

const originalNodeEnv = process.env.NODE_ENV
const originalPgliteDataDir = process.env.PGLITE_DATA_DIR
const packagedMigrationsDir = join(process.cwd(), 'drizzle')
const tempDirs: string[] = []

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

async function createMigrationFixture(maxMigrationIndex: number) {
  const fixtureDir = join(await createTempDir(), 'migrations')
  const metaDir = join(fixtureDir, 'meta')

  await mkdir(metaDir, { recursive: true })

  const journalPath = join(packagedMigrationsDir, 'meta', '_journal.json')
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    version: string
    dialect: string
    entries: Array<{ idx: number; tag: string }>
  }

  await writeFile(
    join(metaDir, '_journal.json'),
    `${JSON.stringify(
      {
        ...journal,
        entries: journal.entries.filter((entry) => entry.idx <= maxMigrationIndex),
      },
      null,
      2,
    )}\n`,
  )

  await Promise.all(
    journal.entries
      .filter((entry) => entry.idx <= maxMigrationIndex)
      .map((entry) =>
        copyFile(
          join(packagedMigrationsDir, `${entry.tag}.sql`),
          join(fixtureDir, `${entry.tag}.sql`),
        ),
      ),
  )

  return fixtureDir
}

describe('PGlite migration runner', () => {
  afterEach(async () => {
    restoreEnv('NODE_ENV', originalNodeEnv)
    restoreEnv('PGLITE_DATA_DIR', originalPgliteDataDir)

    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    )
  })

  it('applies packaged migrations to a fresh PGlite database', async () => {
    const client = new PGlite()

    try {
      await migratePGlite(client)

      const database = drizzle(client, { schema })
      const now = new Date()
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
      const [systemResource] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'system'))

      expect(createdUser?.builtIn).toBe(false)
      expect(systemResource).toMatchObject({
        code: 'system',
        name: '系统管理',
      })

      await client.query(
        `
          insert into "auth_login_attempt_buckets"
            ("username", "failed_count", "window_started_at", "last_failed_at", "created_at", "updated_at")
          values
            ('migrated-login-attempt', 1, now(), now(), now(), now())
        `,
      )

      const [createdConfig] = await database
        .insert(systemConfigs)
        .values({
          id: randomUUID(),
          groupCode: 'site',
          key: 'site.title',
          name: '站点名称',
          valueType: 'string',
          value: 'Rev30',
          description: '后台显示名称',
          createdAt: now,
          updatedAt: now,
        })
        .returning()
      const [configMenu] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'system:config'))

      expect(createdConfig).toMatchObject({
        groupCode: 'site',
        key: 'site.title',
        valueType: 'string',
        value: 'Rev30',
      })
      expect(configMenu).toMatchObject({
        code: 'system:config',
        name: '系统配置',
        path: '/system/configs',
      })

      const announcementId = randomUUID()
      const announcementContentJson: TiptapDocument = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '今晚维护' }] }],
      }
      const [createdAnnouncement] = await database
        .insert(contentAnnouncements)
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
      const [contentMenu] = await database
        .select()
        .from(systemResources)
        .where(eq(systemResources.code, 'content:announcement'))

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
      expect(contentMenu).toMatchObject({
        code: 'content:announcement',
        name: '通知公告',
        path: '/content/announcements',
      })
    } finally {
      await client.close()
    }
  }, 10_000)

  it('migrates announcement resources with soft-deleted parent resources present', async () => {
    const client = new PGlite()

    try {
      const partialMigrationsDir = await createMigrationFixture(15)

      await migratePGlite(client, partialMigrationsDir)

      const database = drizzle(client, { schema })
      const now = new Date()
      const activeContentId = randomUUID()

      await database.insert(systemResources).values([
        {
          id: randomUUID(),
          type: 'directory',
          name: '内容管理(旧)',
          code: 'content',
          openTarget: 'self',
          icon: 'lucide:layout-list',
          hidden: false,
          status: 1,
          sortOrder: 90,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        },
        {
          id: activeContentId,
          type: 'directory',
          name: '内容管理',
          code: 'content',
          openTarget: 'self',
          icon: 'lucide:layout-list',
          hidden: false,
          status: 1,
          sortOrder: 100,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: randomUUID(),
          parentId: activeContentId,
          type: 'menu',
          name: '通知公告(旧)',
          code: 'content:announcement',
          path: '/legacy/announcements',
          openTarget: 'self',
          icon: 'lucide:megaphone',
          hidden: false,
          status: 1,
          sortOrder: 5,
          createdAt: now,
          updatedAt: now,
          deletedAt: now,
        },
      ])

      const fullMigrationsDir = await createMigrationFixture(16)

      await migratePGlite(client, fullMigrationsDir)

      const [contentMenu] = await database
        .select()
        .from(systemResources)
        .where(
          and(eq(systemResources.code, 'content:announcement'), isNull(systemResources.deletedAt)),
        )
      const [contentAnnouncementListAction] = await database
        .select()
        .from(systemResources)
        .where(
          and(
            eq(systemResources.code, 'content:announcement:list'),
            isNull(systemResources.deletedAt),
          ),
        )

      expect(contentMenu).toMatchObject({
        code: 'content:announcement',
        parentId: activeContentId,
        path: '/content/announcements',
      })
      expect(contentAnnouncementListAction).toMatchObject({
        code: 'content:announcement:list',
        parentId: contentMenu?.id,
      })
    } finally {
      await client.close()
    }
  }, 10_000)

  it('adds announcement visibility columns and target table columns through migrations', async () => {
    const client = new PGlite()

    try {
      await migratePGlite(client)

      const announcementColumns = await client.query<{
        column_name: string
      }>(
        `
          select column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'content_announcements'
            and column_name in ('content_html', 'visibility')
          order by column_name
        `,
      )
      const targetColumns = await client.query<{
        column_name: string
      }>(
        `
          select column_name
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'content_announcement_targets'
            and column_name in ('announcement_id', 'created_at', 'target_id', 'target_type')
          order by column_name
        `,
      )

      expect(announcementColumns.rows.map((row) => row.column_name)).toEqual([
        'content_html',
        'visibility',
      ])
      expect(targetColumns.rows.map((row) => row.column_name)).toEqual([
        'announcement_id',
        'created_at',
        'target_id',
        'target_type',
      ])
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
  })
})
