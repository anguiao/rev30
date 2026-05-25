import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'

const migrationUrl = new URL(
  '../../drizzle/0017_add_announcement_visibility_display.sql',
  import.meta.url,
)

async function runMigration(client: PGlite) {
  const migration = await readFile(migrationUrl, 'utf8')
  const statements = migration
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)

  for (const statement of statements) {
    await client.exec(statement)
  }
}

describe('announcement display migration', () => {
  let client: PGlite | undefined

  afterEach(async () => {
    await client?.close()
    client = undefined
  })

  it('keeps existing announcements visible and backfills html from rich content json', async () => {
    client = new PGlite()
    await client.exec(`
      CREATE TABLE "content_announcements" (
        "id" uuid PRIMARY KEY NOT NULL,
        "type" text NOT NULL,
        "title" text NOT NULL,
        "summary" text,
        "content_json" jsonb NOT NULL,
        "content_text" text NOT NULL,
        "status" text DEFAULT 'draft' NOT NULL,
        "pinned" boolean DEFAULT false NOT NULL,
        "published_at" timestamp with time zone,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        "deleted_at" timestamp with time zone
      );
    `)
    await client.exec(`
      INSERT INTO "content_announcements"
        ("id", "type", "title", "content_json", "content_text", "status", "created_at", "updated_at")
      VALUES (
        '11111111-1111-4111-8111-111111111111',
        'notice',
        '历史通知',
        $json$
        {
          "type": "doc",
          "content": [
            {
              "type": "heading",
              "attrs": { "level": 2 },
              "content": [{ "type": "text", "text": "维护安排" }]
            },
            {
              "type": "paragraph",
              "content": [
                { "type": "text", "text": "请查看 " },
                {
                  "type": "text",
                  "text": "详情",
                  "marks": [
                    {
                      "type": "link",
                      "attrs": {
                        "href": "https://example.com/details",
                        "target": "_blank"
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
        $json$::jsonb,
        '维护安排 请查看 详情',
        'published',
        now(),
        now()
      );
    `)

    await runMigration(client)

    const result = await client.query<{
      content_html: string
      visibility: string
    }>(`
      SELECT "content_html", "visibility"
      FROM "content_announcements"
      WHERE "id" = '11111111-1111-4111-8111-111111111111'
    `)

    expect(result.rows[0]).toEqual({
      content_html:
        '<h2>维护安排</h2><p>请查看 <a href="https://example.com/details" target="_blank" rel="noopener noreferrer">详情</a></p>',
      visibility: 'all',
    })
  })
})
