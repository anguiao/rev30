CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"size" integer NOT NULL,
	"usage" text NOT NULL,
	"checksum" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_system_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_unique" ON "attachments" USING btree ("storage_provider","storage_key");--> statement-breakpoint
CREATE INDEX "attachments_created_by_created_at_idx" ON "attachments" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "attachments_usage_created_at_idx" ON "attachments" USING btree ("usage","created_at");--> statement-breakpoint
CREATE INDEX "attachments_deleted_at_idx" ON "attachments" USING btree ("deleted_at");