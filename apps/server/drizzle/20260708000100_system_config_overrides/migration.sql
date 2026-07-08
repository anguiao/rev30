CREATE TABLE "system_config_overrides" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "key" text NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "system_config_overrides_value_non_blank_check" CHECK (btrim("value") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "system_config_overrides_key_unique" ON "system_config_overrides" ("key");
--> statement-breakpoint
DROP TABLE IF EXISTS "system_configs";
--> statement-breakpoint
DELETE FROM "system_role_resources"
WHERE "resource_id" IN (
  SELECT "id"
  FROM "system_resources"
  WHERE "code" IN ('system:config:create', 'system:config:delete')
);
--> statement-breakpoint
DELETE FROM "system_resources"
WHERE "code" IN ('system:config:create', 'system:config:delete');
