-- Keep the committed v5 version until rebuilding publishes the v6 facts.
ALTER TABLE "icon_search_index_state" RENAME COLUMN "rules_version" TO "index_rules_version";
--> statement-breakpoint
ALTER TABLE "icon_search_index_state" DROP COLUMN "search_data_version";
--> statement-breakpoint
ALTER TABLE "icon_search_documents" RENAME COLUMN "exact_phrases" TO "exact_keys";
--> statement-breakpoint
ALTER TABLE "icon_search_documents" RENAME COLUMN "full_tokens" TO "tokens";
--> statement-breakpoint
ALTER INDEX "icon_search_documents_exact_phrases_gin" RENAME TO "icon_search_documents_exact_keys_gin";
--> statement-breakpoint
ALTER INDEX "icon_search_documents_full_tokens_gin" RENAME TO "icon_search_documents_tokens_gin";
--> statement-breakpoint
ALTER TABLE "icon_search_documents"
  DROP COLUMN "full_expressions",
  DROP COLUMN "primary_expressions",
  DROP COLUMN "exact_expressions",
  ADD COLUMN "category" text DEFAULT 'other' NOT NULL,
  ADD COLUMN "related_tokens" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN "english_rank_vector" tsvector DEFAULT ''::tsvector NOT NULL,
  ADD CONSTRAINT "icon_search_documents_category_check"
    CHECK ("category" IN ('ui', 'brand', 'programming', 'emoji', 'flag', 'other', 'custom'));
--> statement-breakpoint
UPDATE "icon_search_documents" SET "category" = 'custom' WHERE "source" = 'custom';
--> statement-breakpoint
ALTER TABLE "icon_search_documents"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "related_tokens" DROP DEFAULT,
  ALTER COLUMN "english_rank_vector" DROP DEFAULT;
--> statement-breakpoint
CREATE INDEX "icon_search_documents_primary_tokens_gin" ON "icon_search_documents" USING gin ("primary_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_related_tokens_gin" ON "icon_search_documents" USING gin ("related_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_name_idx" ON "icon_search_documents" ("name");
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" RENAME COLUMN "exact_phrases" TO "exact_keys";
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" RENAME COLUMN "full_tokens" TO "tokens";
--> statement-breakpoint
ALTER INDEX "icon_search_documents_staging_exact_phrases_gin" RENAME TO "icon_search_documents_staging_exact_keys_gin";
--> statement-breakpoint
ALTER INDEX "icon_search_documents_staging_full_tokens_gin" RENAME TO "icon_search_documents_staging_tokens_gin";
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging"
  DROP COLUMN "full_expressions",
  DROP COLUMN "primary_expressions",
  DROP COLUMN "exact_expressions",
  ADD COLUMN "category" text DEFAULT 'other' NOT NULL,
  ADD COLUMN "related_tokens" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN "english_rank_vector" tsvector DEFAULT ''::tsvector NOT NULL,
  ADD CONSTRAINT "icon_search_documents_staging_category_check"
    CHECK ("category" IN ('ui', 'brand', 'programming', 'emoji', 'flag', 'other', 'custom'));
--> statement-breakpoint
UPDATE "icon_search_documents_staging" SET "category" = 'custom' WHERE "source" = 'custom';
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "related_tokens" DROP DEFAULT,
  ALTER COLUMN "english_rank_vector" DROP DEFAULT;
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_primary_tokens_gin" ON "icon_search_documents_staging" USING gin ("primary_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_related_tokens_gin" ON "icon_search_documents_staging" USING gin ("related_tokens");
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_name_idx" ON "icon_search_documents_staging" ("name");
