ALTER TABLE "custom_icon_set_icons" ADD COLUMN "keywords" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE TABLE "icon_search_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"prefix" text NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"collection" text NOT NULL,
	"palette" boolean NOT NULL,
	"custom_icon_id" uuid,
	"exact_phrases" text[] NOT NULL,
	"full_tokens" text[] NOT NULL,
	"search_vector" tsvector NOT NULL,
	CONSTRAINT "icon_search_documents_source_check" CHECK ("source" IN ('builtin', 'custom')),
	CONSTRAINT "icon_search_documents_custom_id_check" CHECK (("source" = 'builtin' AND "custom_icon_id" IS NULL) OR ("source" = 'custom' AND "custom_icon_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "icon_search_documents_full_tokens_gin" ON "icon_search_documents" USING gin ("full_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_exact_phrases_gin" ON "icon_search_documents" USING gin ("exact_phrases");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_search_vector_gin" ON "icon_search_documents" USING gin ("search_vector");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_source_prefix_id_idx" ON "icon_search_documents" ("source", "prefix", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX "icon_search_documents_custom_icon_id_unique" ON "icon_search_documents" ("custom_icon_id") WHERE "custom_icon_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "icon_search_index_state" (
	"key" text PRIMARY KEY DEFAULT 'current' NOT NULL,
	"index_version" text NOT NULL,
	"icon_package_version" text NOT NULL,
	"search_data_version" text NOT NULL,
	"rules_version" text NOT NULL,
	"document_count" integer NOT NULL,
	"completed_at" timestamp with time zone NOT NULL
	,CONSTRAINT "icon_search_index_state_singleton_check" CHECK ("key" = 'current')
);
