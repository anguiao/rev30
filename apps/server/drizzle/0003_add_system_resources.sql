CREATE TABLE "system_resources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"path" text,
	"external_url" text,
	"open_target" text DEFAULT 'self' NOT NULL,
	"icon" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"status" smallint DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "system_resources" ADD CONSTRAINT "system_resources_parent_id_system_resources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."system_resources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "system_resources_code_unique" ON "system_resources" USING btree ("code");--> statement-breakpoint
CREATE INDEX "system_resources_parent_id_idx" ON "system_resources" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "system_resources_type_idx" ON "system_resources" USING btree ("type");--> statement-breakpoint
CREATE INDEX "system_resources_status_idx" ON "system_resources" USING btree ("status");