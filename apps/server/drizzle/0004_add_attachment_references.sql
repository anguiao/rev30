CREATE TABLE "attachment_references" (
	"attachment_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"source_field" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachment_references_source_type_source_id_source_field_attachment_id_pk" PRIMARY KEY("source_type","source_id","source_field","attachment_id")
);
--> statement-breakpoint
CREATE INDEX "attachment_references_attachment_id_idx" ON "attachment_references" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "attachment_references_source_idx" ON "attachment_references" USING btree ("source_type","source_id");