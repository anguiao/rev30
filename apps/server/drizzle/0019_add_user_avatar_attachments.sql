ALTER TABLE "system_users" ADD COLUMN "avatar_id" uuid;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_avatar_id_attachments_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_users_avatar_id_idx" ON "system_users" USING btree ("avatar_id");--> statement-breakpoint
INSERT INTO "system_resources" (
  "id",
  "parent_id",
  "type",
  "name",
  "code",
  "path",
  "external_url",
  "open_target",
  "icon",
  "hidden",
  "status",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES
  ('10000000-0000-4000-8000-000000000106', (SELECT "id" FROM "system_resources" WHERE "code" = 'content' AND "deleted_at" IS NULL), 'menu', '附件资源', 'content:attachment', '/content/attachments', NULL, 'self', 'lucide:files', false, 1, 20, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
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
INSERT INTO "system_resources" (
  "id",
  "parent_id",
  "type",
  "name",
  "code",
  "path",
  "external_url",
  "open_target",
  "icon",
  "hidden",
  "status",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES
  ('10000000-0000-4000-8000-000000000107', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:attachment' AND "deleted_at" IS NULL), 'action', '查看附件资源', 'content:attachment:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000108', (SELECT "id" FROM "system_resources" WHERE "code" = 'content:attachment' AND "deleted_at" IS NULL), 'action', '删除附件资源', 'content:attachment:delete', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = EXCLUDED."parent_id",
  "type" = EXCLUDED."type",
  "name" = EXCLUDED."name",
  "code" = EXCLUDED."code",
  "path" = EXCLUDED."path",
  "external_url" = EXCLUDED."external_url",
  "open_target" = EXCLUDED."open_target",
  "icon" = EXCLUDED."icon",
  "hidden" = EXCLUDED."hidden",
  "status" = EXCLUDED."status",
  "sort_order" = EXCLUDED."sort_order",
  "deleted_at" = NULL,
  "updated_at" = now();
