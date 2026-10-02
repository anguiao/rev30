ALTER TABLE "icon_search_documents" ADD COLUMN "full_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "icon_search_documents" ADD COLUMN "primary_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "icon_search_documents" ADD COLUMN "exact_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX "icon_search_documents_full_expressions_gin" ON "icon_search_documents" USING gin ("full_expressions");
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" ADD COLUMN "full_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" ADD COLUMN "primary_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "icon_search_documents_staging" ADD COLUMN "exact_expressions" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX "icon_search_documents_staging_full_expressions_gin" ON "icon_search_documents_staging" USING gin ("full_expressions");
