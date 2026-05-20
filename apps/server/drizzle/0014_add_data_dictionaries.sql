CREATE TABLE "system_dictionary_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type_id" uuid NOT NULL,
	"label" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "system_dictionary_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "system_dictionary_items" ADD CONSTRAINT "system_dictionary_items_type_id_system_dictionary_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."system_dictionary_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_items_type_value_active_unique" ON "system_dictionary_items" USING btree ("type_id","value") WHERE "system_dictionary_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_items_type_id_idx" ON "system_dictionary_items" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "system_dictionary_items_status_idx" ON "system_dictionary_items" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "system_dictionary_types_code_active_unique" ON "system_dictionary_types" USING btree ("code") WHERE "system_dictionary_types"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "system_dictionary_types_status_idx" ON "system_dictionary_types" USING btree ("status");
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000060', (SELECT "id" FROM "system_resources" WHERE "code" = 'system'), 'menu', '数据字典', 'system:dictionary', '/system/dictionaries', NULL, 'self', 'lucide:list-tree', false, 1, 60, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system'),
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
  ('10000000-0000-4000-8000-000000000061', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '查看数据字典', 'system:dictionary:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'),
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
  ('10000000-0000-4000-8000-000000000062', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '创建数据字典', 'system:dictionary:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'),
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
  ('10000000-0000-4000-8000-000000000063', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '更新数据字典', 'system:dictionary:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'),
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
  ('10000000-0000-4000-8000-000000000064', (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'), 'action', '删除数据字典', 'system:dictionary:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now())
ON CONFLICT ("code") WHERE "system_resources"."deleted_at" IS NULL DO UPDATE SET
  "parent_id" = (SELECT "id" FROM "system_resources" WHERE "code" = 'system:dictionary'),
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
