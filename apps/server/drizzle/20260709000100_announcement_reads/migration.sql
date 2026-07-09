CREATE TABLE "announcement_reads" (
  "announcement_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "announcement_reads_pkey" PRIMARY KEY("announcement_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "announcement_reads_user_id_idx" ON "announcement_reads" ("user_id");
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id");
--> statement-breakpoint
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "system_users"("id");
