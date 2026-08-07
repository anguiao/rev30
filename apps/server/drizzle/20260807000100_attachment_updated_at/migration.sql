ALTER TABLE "attachments"
  ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
DROP INDEX "attachments_cleanup_policy_created_at_idx";
--> statement-breakpoint
CREATE INDEX "attachments_cleanup_policy_updated_at_idx"
  ON "attachments" ("cleanup_policy", "updated_at");
