ALTER TABLE "auth_password_credentials"
  ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000015', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'), 'action', '重置密码', 'system:user:reset-password', NULL, NULL, 'self', NULL, false, 1, 50, now(), now())
ON CONFLICT ("code") DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:user'),
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
