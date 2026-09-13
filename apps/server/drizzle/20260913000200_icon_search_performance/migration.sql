ALTER TABLE "icon_search_documents" ADD COLUMN "preference" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE "icon_search_documents" SET "preference" =
  (CASE "prefix"
    WHEN 'lucide' THEN 100
    WHEN 'tabler' THEN 99
    WHEN 'heroicons' THEN 98
    WHEN 'ph' THEN 97
    WHEN 'material-symbols' THEN 96
    WHEN 'logos' THEN -1
    WHEN 'simple-icons' THEN -1
    WHEN 'emojione' THEN -1
    WHEN 'noto' THEN -1
    ELSE 0
  END * 2 + CASE WHEN "palette" THEN 0 ELSE 1 END);
--> statement-breakpoint
CREATE TABLE "icon_search_documents_staging" (
	"id" text PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"collection" text NOT NULL,
	"palette" boolean NOT NULL,
	"preference" integer DEFAULT 0 NOT NULL,
	"custom_icon_id" uuid,
	"exact_phrases" text[] NOT NULL,
	"full_tokens" text[] NOT NULL,
	"search_vector" tsvector NOT NULL,
	CONSTRAINT "icon_search_documents_staging_source_check" CHECK ("source" IN ('builtin', 'custom')),
	CONSTRAINT "icon_search_documents_staging_custom_id_check" CHECK (("source" = 'builtin' AND "custom_icon_id" IS NULL) OR ("source" = 'custom' AND "custom_icon_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_full_tokens_gin" ON "icon_search_documents_staging" USING gin ("full_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_exact_phrases_gin" ON "icon_search_documents_staging" USING gin ("exact_phrases");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_search_vector_gin" ON "icon_search_documents_staging" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_source_prefix_id_idx" ON "icon_search_documents_staging" ("source", "prefix", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "icon_search_documents_staging_custom_icon_id_unique" ON "icon_search_documents_staging" ("custom_icon_id") WHERE "custom_icon_id" IS NOT NULL;
