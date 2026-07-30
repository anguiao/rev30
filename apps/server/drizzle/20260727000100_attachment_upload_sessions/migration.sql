CREATE TABLE "attachment_upload_sessions" (
  "id" uuid PRIMARY KEY DEFAULT uuidv7(),
  "original_name" text NOT NULL,
  "expected_size" integer NOT NULL,
  "usage" text NOT NULL,
  "read_policy" text DEFAULT 'signed' NOT NULL,
  "cleanup_policy" text DEFAULT 'manual' NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "storage_provider" text,
  "storage_key" text,
  "mime_type" text,
  "extension" text,
  "stored_size" integer,
  "checksum" text,
  "stored_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attachment_upload_sessions_state_check"
    CHECK ("state" IN ('pending', 'uploading', 'stored')),
  CONSTRAINT "attachment_upload_sessions_expected_size_non_negative_check"
    CHECK ("expected_size" >= 0),
  CONSTRAINT "attachment_upload_sessions_expiration_check"
    CHECK ("expires_at" > "created_at"),
  CONSTRAINT "attachment_upload_sessions_storage_state_check"
    CHECK (
      (
        "state" IN ('pending', 'uploading')
        AND "storage_provider" IS NULL
        AND "storage_key" IS NULL
        AND "mime_type" IS NULL
        AND "extension" IS NULL
        AND "stored_size" IS NULL
        AND "checksum" IS NULL
        AND "stored_at" IS NULL
      ) OR (
        "state" = 'stored'
        AND "storage_provider" IS NOT NULL
        AND "storage_key" IS NOT NULL
        AND "mime_type" IS NOT NULL
        AND "extension" IS NOT NULL
        AND "stored_size" IS NOT NULL
        AND "stored_size" >= 0
        AND "checksum" IS NOT NULL
        AND "stored_at" IS NOT NULL
      )
    )
);
--> statement-breakpoint
ALTER TABLE "attachment_upload_sessions"
  ADD CONSTRAINT "attachment_upload_sessions_created_by_system_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "system_users"("id");
--> statement-breakpoint
CREATE UNIQUE INDEX "attachment_upload_sessions_storage_key_unique"
  ON "attachment_upload_sessions" ("storage_provider", "storage_key")
  WHERE "storage_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "attachment_upload_sessions_expires_at_idx"
  ON "attachment_upload_sessions" ("expires_at");
