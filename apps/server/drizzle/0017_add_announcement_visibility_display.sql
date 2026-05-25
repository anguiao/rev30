ALTER TABLE "content_announcements" ADD COLUMN "visibility" text DEFAULT 'targeted' NOT NULL;
--> statement-breakpoint
ALTER TABLE "content_announcements" ADD COLUMN "content_html" text;
--> statement-breakpoint
UPDATE "content_announcements"
SET "content_html" = '<p>' || replace(replace(replace("content_text", '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</p>'
WHERE "content_html" IS NULL;
--> statement-breakpoint
ALTER TABLE "content_announcements" ALTER COLUMN "content_html" SET NOT NULL;
--> statement-breakpoint
CREATE TABLE "content_announcement_targets" (
	"announcement_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_announcement_targets_announcement_id_target_type_target_id_pk" PRIMARY KEY("announcement_id","target_type","target_id"),
	CONSTRAINT "content_announcement_targets_announcement_id_content_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."content_announcements"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "content_announcements_visibility_idx" ON "content_announcements" USING btree ("visibility");
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_announcement_id_idx" ON "content_announcement_targets" USING btree ("announcement_id");
--> statement-breakpoint
CREATE INDEX "content_announcement_targets_target_idx" ON "content_announcement_targets" USING btree ("target_type","target_id");
