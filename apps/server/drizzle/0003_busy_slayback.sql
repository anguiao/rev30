CREATE TABLE "custom_icon_set_icons" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"set_id" uuid NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"palette" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "custom_icon_sets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "custom_icon_set_icons" ADD CONSTRAINT "custom_icon_set_icons_set_id_custom_icon_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."custom_icon_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_icon_set_icons_set_name_active_unique" ON "custom_icon_set_icons" USING btree ("set_id","name") WHERE "custom_icon_set_icons"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "custom_icon_set_icons_set_id_idx" ON "custom_icon_set_icons" USING btree ("set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_icon_sets_prefix_active_unique" ON "custom_icon_sets" USING btree ("prefix") WHERE "custom_icon_sets"."deleted_at" IS NULL;
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000109', '10000000-0000-4000-8000-000000000100', 'menu', '图标库', 'content:icon-set', '/content/icon-sets', NULL, 'self', 'lucide:icons', false, 1, 30, now(), now());
--> statement-breakpoint
INSERT INTO "system_resources"
  ("id", "parent_id", "type", "name", "code", "path", "external_url", "open_target", "icon", "hidden", "status", "sort_order", "created_at", "updated_at")
VALUES
  ('10000000-0000-4000-8000-000000000110', '10000000-0000-4000-8000-000000000109', 'action', '查看图标库', 'content:icon-set:list', NULL, NULL, 'self', NULL, false, 1, 10, now(), now()),
  ('10000000-0000-4000-8000-000000000111', '10000000-0000-4000-8000-000000000109', 'action', '创建图标集', 'content:icon-set:create', NULL, NULL, 'self', NULL, false, 1, 20, now(), now()),
  ('10000000-0000-4000-8000-000000000112', '10000000-0000-4000-8000-000000000109', 'action', '更新图标集', 'content:icon-set:update', NULL, NULL, 'self', NULL, false, 1, 30, now(), now()),
  ('10000000-0000-4000-8000-000000000113', '10000000-0000-4000-8000-000000000109', 'action', '删除图标集', 'content:icon-set:delete', NULL, NULL, 'self', NULL, false, 1, 40, now(), now()),
  ('10000000-0000-4000-8000-000000000114', '10000000-0000-4000-8000-000000000109', 'action', '导出图标集', 'content:icon-set:export', NULL, NULL, 'self', NULL, false, 1, 50, now(), now());
