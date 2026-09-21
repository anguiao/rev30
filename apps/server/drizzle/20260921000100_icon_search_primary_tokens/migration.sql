ALTER TABLE "icon_search_documents" ADD COLUMN "primary_tokens" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" ADD COLUMN "primary_tokens" text[] DEFAULT '{}'::text[] NOT NULL;
