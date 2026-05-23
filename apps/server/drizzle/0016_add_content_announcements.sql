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
--> statement-breakpoint
CREATE INDEX "content_announcements_type_idx" ON "content_announcements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "content_announcements_status_idx" ON "content_announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "content_announcements_pinned_idx" ON "content_announcements" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "content_announcements_published_at_idx" ON "content_announcements" USING btree ("published_at");
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000100', NULL, 'directory', '内容管理', 'content', NULL, NULL, 'self', 'lucide:layout-list', false, 1, 100, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000101', (SELECT "id" FROM "system_resources" WHERE "code" = 'content' AND "deleted_at" IS NULL), 'menu', '通知公告', 'content:announcement', '/content/announcements', NULL, 'self', 'lucide:megaphone', false, 1, 10, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'content' AND "deleted_at" IS NULL),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000102', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement' AND "deleted_at" IS NULL), 'action', '查看通知公告', 'content:announcement:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000103', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement' AND "deleted_at" IS NULL), 'action', '创建通知公告', 'content:announcement:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000104', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement' AND "deleted_at" IS NULL), 'action', '更新通知公告', 'content:announcement:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000105', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement' AND "deleted_at" IS NULL), 'action', '删除通知公告', 'content:announcement:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'content:announcement' AND "deleted_at" IS NULL),
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
